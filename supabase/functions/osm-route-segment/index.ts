import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * OSM Route Segmentation Engine
 * 
 * Given a cable route LineString, fetches nearby OSM roads from the Overpass API
 * and classifies each segment by surface type (FOOTWAY / CARRIAGEWAY / VERGE),
 * detects crossings (pedestrian, traffic signals, railways, water), and returns
 * enriched route segments for the cost engine.
 * 
 * Input:  { route_coords: [lng, lat][], buffer_m?: number }
 * Output: { segments: RouteSegment[], crossings: RouteCrossing[], summary: {} }
 */

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// ── Geometry helpers ────────────────────────────────────────

function toRad(deg: number): number { return deg * Math.PI / 180; }

function haversineM(a: [number, number], b: [number, number]): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** Distance from point P to line segment AB in metres */
function pointToSegmentDistM(p: [number, number], a: [number, number], b: [number, number]): number {
  const ab = [b[0] - a[0], b[1] - a[1]];
  const ap = [p[0] - a[0], p[1] - a[1]];
  const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1] + 1e-12)));
  const closest: [number, number] = [a[0] + t * ab[0], a[1] + t * ab[1]];
  return haversineM(p, closest);
}

/** Get bounding box for a route with buffer (degrees) */
function routeBbox(coords: [number, number][], bufferDeg: number): [number, number, number, number] {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [lon, lat] of coords) {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
  }
  return [minLat - bufferDeg, minLon - bufferDeg, maxLat + bufferDeg, maxLon + bufferDeg];
}

// ── Surface classification ──────────────────────────────────

type SurfaceType = "FOOTWAY" | "CARRIAGEWAY" | "VERGE";

interface OsmWay {
  id: number;
  tags: Record<string, string>;
  geometry: { lat: number; lon: number }[];
}

interface OsmNode {
  id: number;
  lat: number;
  lon: number;
  tags: Record<string, string>;
}

function classifyHighway(highway: string | undefined): SurfaceType {
  if (!highway) return "VERGE";
  switch (highway) {
    case "footway":
    case "path":
    case "cycleway":
    case "pedestrian":
    case "steps":
      return "FOOTWAY";
    case "motorway":
    case "trunk":
    case "primary":
    case "secondary":
    case "tertiary":
    case "residential":
    case "unclassified":
    case "service":
    case "living_street":
      return "CARRIAGEWAY";
    case "track":
      return "VERGE";
    default:
      return "CARRIAGEWAY";
  }
}

interface RouteSegment {
  segment_id: string;
  surface_type: SurfaceType;
  length_m: number;
  osm_highway?: string;
  osm_surface?: string;
  osm_width?: string;
  osm_lit?: string;
  osm_lanes?: string;
  osm_name?: string;
  cover_depth_mm: number;
  coordinates: [number, number][];
}

interface RouteCrossing {
  crossing_id: string;
  crossing_type: "PEDESTRIAN" | "TRAFFIC_SIGNAL" | "RAILWAY" | "WATER";
  lat: number;
  lon: number;
  distance_along_m: number;
  osm_tags: Record<string, string>;
}

/** Cover depth defaults (mm) by surface type — SROH aligned */
function coverDepth(surface: SurfaceType): number {
  switch (surface) {
    case "CARRIAGEWAY": return 600;
    case "FOOTWAY": return 450;
    case "VERGE": return 450;
  }
}

// ── Overpass fetch ──────────────────────────────────────────

async function fetchOverpass(query: string): Promise<any> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(10000),
      });
      if (resp.ok) return await resp.json();
    } catch { /* try next */ }
  }
  return { elements: [] };
}

// ── Main segmentation logic ─────────────────────────────────

function segmentRouteAgainstOsm(
  routeCoords: [number, number][],
  osmWays: OsmWay[],
  osmCrossingNodes: OsmNode[],
  osmSignalNodes: OsmNode[],
  osmRailways: OsmWay[],
  osmWater: OsmWay[],
  bufferM: number
): { segments: RouteSegment[]; crossings: RouteCrossing[] } {
  const segments: RouteSegment[] = [];
  const crossings: RouteCrossing[] = [];
  let cumulativeM = 0;

  // For each route segment (pair of consecutive points), find the nearest OSM way
  for (let i = 0; i < routeCoords.length - 1; i++) {
    const a = routeCoords[i];
    const b = routeCoords[i + 1];
    const segLength = haversineM(a, b);
    const midpoint: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

    // Find best OSM way using cost-weighted scoring
    // Prefer cheaper surfaces: verge (0 penalty) > footway (+15m) > carriageway (+30m)
    let bestScore = Infinity;
    let bestWay: OsmWay | null = null;
    let bestDist = Infinity;
    for (const way of osmWays) {
      if (!way.geometry || way.geometry.length < 2) continue;
      const surfType = classifyHighway(way.tags?.highway);
      const costPenalty = surfType === "CARRIAGEWAY" ? 30 : surfType === "FOOTWAY" ? 15 : 0;
      for (let j = 0; j < way.geometry.length - 1; j++) {
        const wa: [number, number] = [way.geometry[j].lon, way.geometry[j].lat];
        const wb: [number, number] = [way.geometry[j + 1].lon, way.geometry[j + 1].lat];
        const d = pointToSegmentDistM(midpoint, wa, wb);
        const effectiveScore = d + costPenalty;
        if (effectiveScore < bestScore) {
          bestScore = effectiveScore;
          bestDist = d;
          bestWay = way;
        }
      }
    }

    const surfaceType = bestDist < bufferM && bestWay
      ? classifyHighway(bestWay.tags?.highway)
      : "VERGE";

    segments.push({
      segment_id: `SEG_${String(i + 1).padStart(3, "0")}`,
      surface_type: surfaceType,
      length_m: Math.round(segLength * 100) / 100,
      osm_highway: bestWay?.tags?.highway,
      osm_surface: bestWay?.tags?.surface,
      osm_width: bestWay?.tags?.width,
      osm_lit: bestWay?.tags?.lit,
      osm_lanes: bestWay?.tags?.lanes,
      osm_name: bestWay?.tags?.name,
      cover_depth_mm: coverDepth(surfaceType),
      coordinates: [a, b],
    });

    // Check for crossing nodes near this segment
    const segMid = cumulativeM + segLength / 2;
    for (const node of osmCrossingNodes) {
      const np: [number, number] = [node.lon, node.lat];
      const d = pointToSegmentDistM(np, a, b);
      if (d < bufferM) {
        crossings.push({
          crossing_id: `CROSS_PED_${crossings.length + 1}`,
          crossing_type: "PEDESTRIAN",
          lat: node.lat,
          lon: node.lon,
          distance_along_m: Math.round(segMid),
          osm_tags: node.tags || {},
        });
      }
    }

    for (const node of osmSignalNodes) {
      const np: [number, number] = [node.lon, node.lat];
      const d = pointToSegmentDistM(np, a, b);
      if (d < bufferM) {
        crossings.push({
          crossing_id: `CROSS_SIG_${crossings.length + 1}`,
          crossing_type: "TRAFFIC_SIGNAL",
          lat: node.lat,
          lon: node.lon,
          distance_along_m: Math.round(segMid),
          osm_tags: node.tags || {},
        });
      }
    }

    // Railway crossings
    for (const rail of osmRailways) {
      if (!rail.geometry || rail.geometry.length < 2) continue;
      for (let j = 0; j < rail.geometry.length - 1; j++) {
        const ra: [number, number] = [rail.geometry[j].lon, rail.geometry[j].lat];
        const rb: [number, number] = [rail.geometry[j + 1].lon, rail.geometry[j + 1].lat];
        const d = pointToSegmentDistM(midpoint, ra, rb);
        if (d < bufferM * 0.5) {
          crossings.push({
            crossing_id: `CROSS_RAIL_${crossings.length + 1}`,
            crossing_type: "RAILWAY",
            lat: midpoint[1],
            lon: midpoint[0],
            distance_along_m: Math.round(segMid),
            osm_tags: rail.tags || {},
          });
          break;
        }
      }
    }

    // Water crossings
    for (const water of osmWater) {
      if (!water.geometry || water.geometry.length < 2) continue;
      for (let j = 0; j < water.geometry.length - 1; j++) {
        const wa: [number, number] = [water.geometry[j].lon, water.geometry[j].lat];
        const wb: [number, number] = [water.geometry[j + 1].lon, water.geometry[j + 1].lat];
        const d = pointToSegmentDistM(midpoint, wa, wb);
        if (d < bufferM * 0.5) {
          crossings.push({
            crossing_id: `CROSS_WATER_${crossings.length + 1}`,
            crossing_type: "WATER",
            lat: midpoint[1],
            lon: midpoint[0],
            distance_along_m: Math.round(segMid),
            osm_tags: water.tags || {},
          });
          break;
        }
      }
    }

    cumulativeM += segLength;
  }

  // Deduplicate crossings by proximity (within 20m)
  const dedupedCrossings: RouteCrossing[] = [];
  for (const c of crossings) {
    const isDupe = dedupedCrossings.some(
      (d) => d.crossing_type === c.crossing_type && haversineM([c.lon, c.lat], [d.lon, d.lat]) < 20
    );
    if (!isDupe) dedupedCrossings.push(c);
  }

  return { segments, crossings: dedupedCrossings };
}

/** Merge consecutive segments with the same surface type */
function mergeConsecutive(segments: RouteSegment[]): RouteSegment[] {
  if (segments.length === 0) return [];
  const merged: RouteSegment[] = [{ ...segments[0] }];
  for (let i = 1; i < segments.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = segments[i];
    if (curr.surface_type === prev.surface_type) {
      prev.length_m = Math.round((prev.length_m + curr.length_m) * 100) / 100;
      prev.coordinates = [...prev.coordinates, ...curr.coordinates.slice(1)];
    } else {
      merged.push({ ...curr, segment_id: `SEG_${String(merged.length + 1).padStart(3, "0")}` });
    }
  }
  return merged;
}

// ── Edge function handler ───────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const sb = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { route_coords, buffer_m = 30 } = body;

    if (!route_coords || !Array.isArray(route_coords) || route_coords.length < 2) {
      return new Response(JSON.stringify({ error: "route_coords must be an array of [lng,lat] with at least 2 points" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate route bbox with buffer (~30m ≈ 0.0003°)
    const bufferDeg = (buffer_m / 111000) * 1.5; // generous buffer
    const bbox = routeBbox(route_coords, bufferDeg);
    const bboxStr = bbox.join(",");

    // Fetch roads, crossings, signals, railways, water in parallel
    const [roadsJson, crossingsJson, signalsJson, railwaysJson, waterJson] = await Promise.all([
      fetchOverpass(`[out:json][timeout:10];(way["highway"~"motorway|trunk|primary|secondary|tertiary|residential|unclassified|service|footway|path|cycleway|pedestrian|living_street|track"](${bboxStr}););out body geom;`),
      fetchOverpass(`[out:json][timeout:10];node["highway"="crossing"](${bboxStr});out body;`),
      fetchOverpass(`[out:json][timeout:10];node["highway"="traffic_signals"](${bboxStr});out body;`),
      fetchOverpass(`[out:json][timeout:10];way["railway"~"rail|light_rail|subway|tram"](${bboxStr});out body geom;`),
      fetchOverpass(`[out:json][timeout:10];(way["natural"="water"](${bboxStr});way["waterway"~"river|canal|stream"](${bboxStr}););out body geom;`),
    ]);

    const osmWays: OsmWay[] = (roadsJson.elements || []).filter((e: any) => e.type === "way");
    const crossingNodes: OsmNode[] = (crossingsJson.elements || []).filter((e: any) => e.type === "node");
    const signalNodes: OsmNode[] = (signalsJson.elements || []).filter((e: any) => e.type === "node");
    const railways: OsmWay[] = (railwaysJson.elements || []).filter((e: any) => e.type === "way");
    const waterWays: OsmWay[] = (waterJson.elements || []).filter((e: any) => e.type === "way");

    // Run segmentation
    const { segments: rawSegments, crossings } = segmentRouteAgainstOsm(
      route_coords,
      osmWays,
      crossingNodes,
      signalNodes,
      railways,
      waterWays,
      buffer_m
    );

    // Merge consecutive same-type segments
    const segments = mergeConsecutive(rawSegments);

    // Build summary
    const totalLength = segments.reduce((s, seg) => s + seg.length_m, 0);
    const footwayLength = segments.filter(s => s.surface_type === "FOOTWAY").reduce((s, seg) => s + seg.length_m, 0);
    const carriagewayLength = segments.filter(s => s.surface_type === "CARRIAGEWAY").reduce((s, seg) => s + seg.length_m, 0);
    const vergeLength = segments.filter(s => s.surface_type === "VERGE").reduce((s, seg) => s + seg.length_m, 0);

    const summary = {
      total_length_m: Math.round(totalLength * 100) / 100,
      footway_m: Math.round(footwayLength * 100) / 100,
      carriageway_m: Math.round(carriagewayLength * 100) / 100,
      verge_m: Math.round(vergeLength * 100) / 100,
      footway_pct: totalLength > 0 ? Math.round((footwayLength / totalLength) * 100) : 0,
      carriageway_pct: totalLength > 0 ? Math.round((carriagewayLength / totalLength) * 100) : 0,
      verge_pct: totalLength > 0 ? Math.round((vergeLength / totalLength) * 100) : 0,
      crossing_count: crossings.length,
      pedestrian_crossings: crossings.filter(c => c.crossing_type === "PEDESTRIAN").length,
      traffic_signals: crossings.filter(c => c.crossing_type === "TRAFFIC_SIGNAL").length,
      railway_crossings: crossings.filter(c => c.crossing_type === "RAILWAY").length,
      water_crossings: crossings.filter(c => c.crossing_type === "WATER").length,
      traffic_management_required: carriagewayLength > 0 || crossings.some(c => c.crossing_type === "TRAFFIC_SIGNAL"),
      osm_ways_matched: osmWays.length,
      lit_segments: segments.filter(s => s.osm_lit === "yes").length,
    };

    return new Response(JSON.stringify({ segments, crossings, summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("osm-route-segment error:", err);
    return new Response(JSON.stringify({ error: "Internal error", detail: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
