import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

const OSM_FILTERS: Record<string, string> = {
  // Roads
  osm_major_roads: 'way["highway"~"motorway|trunk|primary"]',
  osm_minor_roads: 'way["highway"~"secondary|tertiary|residential|unclassified"]',
  osm_footways: 'way["highway"~"footway|path|cycleway"]',
  // Constraints
  osm_water: '(way["natural"="water"];way["waterway"~"river|canal|stream"];relation["natural"="water"];)',
  osm_railways: 'way["railway"~"rail|light_rail|subway|tram"]',
  osm_buildings: 'way["building"]',
  osm_barriers: '(way["barrier"];node["barrier"];)',
  // Point layers
  osm_crossings: 'node["highway"="crossing"]',
  osm_traffic_signals: 'node["highway"="traffic_signals"]',
};

// Geometry output type per layer
const POLYGON_LAYERS = new Set(["osm_water", "osm_buildings"]);
const POINT_ONLY_LAYERS = new Set(["osm_crossings", "osm_traffic_signals"]);

// Max bbox span per layer type (degrees)
const MAX_BBOX_SPAN: Record<string, number> = {
  osm_major_roads: 0.15,
  osm_minor_roads: 0.08,
  osm_footways: 0.05,
  osm_water: 0.11,
  osm_railways: 0.11,
  osm_buildings: 0.05,
  osm_barriers: 0.05,
  osm_crossings: 0.05,
  osm_traffic_signals: 0.05,
};

// Tile zoom per layer for deterministic snapping
const TILE_ZOOM: Record<string, number> = {
  osm_major_roads: 12,
  osm_minor_roads: 13,
  osm_footways: 14,
  osm_water: 13,
  osm_railways: 13,
  osm_buildings: 14,
  osm_barriers: 14,
  osm_crossings: 14,
  osm_traffic_signals: 14,
};

// ── Tile math helpers ──────────────────────────────────────────────
function lat2tile(lat: number, z: number): number {
  return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * (1 << z));
}
function lon2tile(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * (1 << z));
}
function tile2lat(y: number, z: number): number {
  const n = Math.PI - 2 * Math.PI * y / (1 << z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}
function tile2lon(x: number, z: number): number {
  return x / (1 << z) * 360 - 180;
}

interface TileBbox {
  tileId: string;
  bbox: [number, number, number, number]; // [south, west, north, east]
}

/** Snap a bbox to XYZ tile boundaries at the given zoom level */
function bboxToTiles(
  bbox: [number, number, number, number], // [south, west, north, east]
  zoom: number
): TileBbox[] {
  const [south, west, north, east] = bbox;
  const minX = lon2tile(west, zoom);
  const maxX = lon2tile(east, zoom);
  const minY = lat2tile(north, zoom); // note: y is inverted
  const maxY = lat2tile(south, zoom);

  const tiles: TileBbox[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const tileNorth = tile2lat(y, zoom);
      const tileSouth = tile2lat(y + 1, zoom);
      const tileWest = tile2lon(x, zoom);
      const tileEast = tile2lon(x + 1, zoom);
      tiles.push({
        tileId: `${zoom}/${x}/${y}`,
        bbox: [tileSouth, tileWest, tileNorth, tileEast],
      });
    }
  }
  return tiles;
}

function clampBbox(
  bbox: [number, number, number, number],
  layerType: string
): [number, number, number, number] {
  const maxSpan = MAX_BBOX_SPAN[layerType] ?? 0.1;
  let [south, west, north, east] = bbox;
  const latSpan = north - south;
  const lonSpan = east - west;

  if (latSpan > maxSpan) {
    const cLat = (south + north) / 2;
    south = cLat - maxSpan / 2;
    north = cLat + maxSpan / 2;
  }
  if (lonSpan > maxSpan) {
    const cLon = (west + east) / 2;
    west = cLon - maxSpan / 2;
    east = cLon + maxSpan / 2;
  }
  return [south, west, north, east];
}

function buildQuery(
  bbox: [number, number, number, number],
  layerType: string
): string {
  const filter = OSM_FILTERS[layerType];
  if (!filter) return "";
  const bboxStr = bbox.join(",");

  // For grouped queries (water, barriers) the filter already includes parentheses
  if (filter.startsWith("(")) {
    const inner = filter.slice(1, -1);
    const parts = inner.split(";").filter(Boolean);
    const bboxedParts = parts.map((p) => `${p}(${bboxStr})`);
    return `[out:json][timeout:15];(${bboxedParts.join(";")};);out body geom;`;
  }

  // Point-only layers use "out body;" (no geom needed for nodes)
  if (POINT_ONLY_LAYERS.has(layerType)) {
    return `[out:json][timeout:15];${filter}(${bboxStr});out body;`;
  }

  return `[out:json][timeout:15];${filter}(${bboxStr});out body geom;`;
}

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  lat?: number;
  lon?: number;
}

function overpassToGeoJSON(
  elements: OverpassElement[],
  layerType: string
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const isPolygon = POLYGON_LAYERS.has(layerType);

  for (const el of elements) {
    // Handle node elements
    if (el.type === "node" && el.lat != null && el.lon != null) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [el.lon, el.lat] },
        properties: {
          osm_id: el.id,
          ...extractTags(el.tags, layerType),
        },
      });
      continue;
    }

    if (!el.geometry || el.geometry.length < 2) continue;
    const coords = el.geometry.map((p) => [p.lon, p.lat]);

    if (isPolygon && coords.length >= 4) {
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push([...first]);
      }
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [coords] },
        properties: {
          osm_id: el.id,
          ...extractTags(el.tags, layerType),
        },
      });
    } else {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {
          osm_id: el.id,
          ...extractTags(el.tags, layerType),
        },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

function extractTags(
  tags: Record<string, string> | undefined,
  layerType: string
): Record<string, unknown> {
  if (!tags) return {};
  switch (layerType) {
    case "osm_major_roads":
    case "osm_minor_roads":
    case "osm_footways":
      return {
        highway: tags.highway ?? null,
        name: tags.name ?? null,
        surface: tags.surface ?? null,
        lanes: tags.lanes ?? null,
        maxspeed: tags.maxspeed ?? null,
        width: tags.width ?? null,
        oneway: tags.oneway ?? null,
        // P1 additions for SROH / civils costing
        lit: tags.lit ?? null,
        foot: tags.foot ?? null,
        bicycle: tags.bicycle ?? null,
        junction: tags.junction ?? null,
        sidewalk: tags.sidewalk ?? null,
        crossing: tags.crossing ?? null,
      };
    case "osm_water":
      return {
        natural: tags.natural ?? null,
        waterway: tags.waterway ?? null,
        name: tags.name ?? null,
      };
    case "osm_railways":
      return {
        railway: tags.railway ?? null,
        name: tags.name ?? null,
        electrified: tags.electrified ?? null,
        gauge: tags.gauge ?? null,
      };
    case "osm_buildings":
      return {
        building: tags.building ?? null,
        name: tags.name ?? null,
        amenity: tags.amenity ?? null,
        "addr:street": tags["addr:street"] ?? null,
      };
    case "osm_barriers":
      return {
        barrier: tags.barrier ?? null,
        access: tags.access ?? null,
        name: tags.name ?? null,
      };
    case "osm_crossings":
      return {
        crossing: tags.crossing ?? null,
        "crossing:markings": tags["crossing:markings"] ?? null,
        traffic_signals: tags.traffic_signals ?? null,
        tactile_paving: tags.tactile_paving ?? null,
      };
    case "osm_traffic_signals":
      return {
        traffic_signals: tags.traffic_signals ?? null,
        "traffic_signals:direction": tags["traffic_signals:direction"] ?? null,
        name: tags.name ?? null,
      };
    default:
      return { name: tags.name ?? null };
  }
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Race all endpoints in parallel — first successful response wins */
async function fetchWithRace(
  query: string,
  featureCap: number,
  layerType: string
): Promise<{ geojson: GeoJSON.FeatureCollection; endpoint: string }> {
  const attempts = OVERPASS_ENDPOINTS.map(async (endpoint) => {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`${endpoint} returned ${resp.status}: ${txt.slice(0, 100)}`);
    }
    const json = await resp.json();
    const elements: OverpassElement[] = json.elements ?? [];
    return {
      geojson: overpassToGeoJSON(elements.slice(0, featureCap), layerType),
      endpoint,
    };
  });

  try {
    return await Promise.any(attempts);
  } catch (err) {
    console.warn("All Overpass endpoints failed:", err);
    return { geojson: { type: "FeatureCollection", features: [] }, endpoint: "none" };
  }
}

/** Merge multiple FeatureCollections, deduplicating by osm_id */
function mergeFeatureCollections(collections: GeoJSON.FeatureCollection[]): GeoJSON.FeatureCollection {
  const seen = new Set<number>();
  const features: GeoJSON.Feature[] = [];
  for (const fc of collections) {
    for (const f of fc.features) {
      const osmId = (f.properties as any)?.osm_id;
      if (osmId && seen.has(osmId)) continue;
      if (osmId) seen.add(osmId);
      features.push(f);
    }
  }
  return { type: "FeatureCollection", features };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const sb = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { bbox, road_type, feature_cap } = body;

    if (
      !bbox ||
      !Array.isArray(bbox) ||
      bbox.length !== 4 ||
      !road_type ||
      !OSM_FILTERS[road_type]
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Invalid input. Required: bbox [south,west,north,east], road_type (one of: " +
            Object.keys(OSM_FILTERS).join(", ") + ")",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const clampedBbox = clampBbox(bbox as [number, number, number, number], road_type);
    const cap = Math.min(feature_cap ?? 5000, 10000);

    // Deterministic tile-based snapping
    const zoom = TILE_ZOOM[road_type] ?? 13;
    const tiles = bboxToTiles(clampedBbox, zoom);

    // Limit to 4 tiles max to prevent huge queries
    const tilesToFetch = tiles.slice(0, 4);

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sbAdmin = createClient(supabaseUrl, serviceKey);

    const tileResults: GeoJSON.FeatureCollection[] = [];

    for (const tile of tilesToFetch) {
      const query = buildQuery(tile.bbox, road_type);
      const queryHash = await sha256Hex(query);

      // ── P2: Check tile cache in database ──
      const { data: cachedTile } = await sbAdmin
        .from("osm_tile_cache")
        .select("geojson, feature_count, expires_at")
        .eq("layer_slug", road_type)
        .eq("tile_id", tile.tileId)
        .gt("expires_at", new Date().toISOString())
        .limit(1)
        .single();

      if (cachedTile && cachedTile.geojson) {
        console.log(`Cache HIT for ${road_type}:${tile.tileId} (${cachedTile.feature_count} features)`);
        tileResults.push(cachedTile.geojson as unknown as GeoJSON.FeatureCollection);
        continue;
      }

      // Cache miss — fetch from Overpass
      const { geojson, endpoint: usedEndpoint } = await fetchWithRace(query, cap, road_type);
      tileResults.push(geojson);

      // Fire-and-forget: store in tile cache (upsert by layer_slug + tile_id)
      sbAdmin.from("osm_tile_cache").upsert({
        layer_slug: road_type,
        tile_id: tile.tileId,
        query_hash: queryHash,
        geojson: geojson as any,
        feature_count: geojson.features.length,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
        source_endpoint: usedEndpoint,
      }, { onConflict: "layer_slug,tile_id" }).then(({ error: cacheErr }) => {
        if (cacheErr) console.warn("Tile cache upsert failed:", cacheErr.message);
      });

      // Fire-and-forget: log ingestion metadata
      sbAdmin.from("osm_ingestion_meta").insert({
        layer_slug: road_type,
        source_endpoint: usedEndpoint,
        query_hash: queryHash,
        query_text: query,
        tile_id: tile.tileId,
        bbox: tile.bbox,
        row_count: geojson.features.length,
        status: geojson.features.length > 0 ? "success" : "empty",
        fetched_by: user.id,
      }).then(({ error: metaErr }) => {
        if (metaErr) console.warn("Meta insert failed:", metaErr.message);
      });
    }

    const merged = mergeFeatureCollections(tileResults);

    return new Response(JSON.stringify(merged), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    console.error("overpass-road-fetch error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
