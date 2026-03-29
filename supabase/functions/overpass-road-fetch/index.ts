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

const ROAD_FILTERS: Record<string, string> = {
  osm_major_roads: "motorway|trunk|primary",
  osm_minor_roads: "secondary|tertiary|residential|unclassified",
  osm_footways: "footway|path|cycleway",
};

// Max bbox span per road type (degrees). Queries larger than this will be clipped to center.
const MAX_BBOX_SPAN: Record<string, number> = {
  osm_major_roads: 0.5,
  osm_minor_roads: 0.2,
  osm_footways: 0.15,
};

function clampBbox(
  bbox: [number, number, number, number],
  roadType: string
): [number, number, number, number] {
  const maxSpan = MAX_BBOX_SPAN[roadType] ?? 0.3;
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
  roadType: string
): string {
  const filter = ROAD_FILTERS[roadType] ?? ROAD_FILTERS["osm_major_roads"];
  const bboxStr = bbox.join(",");
  return `[out:json][timeout:15];way["highway"~"${filter}"](${bboxStr});out body geom;`;
}

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
}

function overpassToGeoJSON(
  elements: OverpassElement[]
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const el of elements) {
    if (!el.geometry || el.geometry.length < 2) continue;
    const coords = el.geometry.map((p) => [p.lon, p.lat]);
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: coords },
      properties: {
        osm_id: el.id,
        highway: el.tags?.highway ?? null,
        name: el.tags?.name ?? null,
        surface: el.tags?.surface ?? null,
        lanes: el.tags?.lanes ?? null,
        maxspeed: el.tags?.maxspeed ?? null,
        width: el.tags?.width ?? null,
        oneway: el.tags?.oneway ?? null,
      },
    });
  }
  return { type: "FeatureCollection", features };
}

async function fetchWithRetry(
  query: string,
  featureCap: number
): Promise<GeoJSON.FeatureCollection> {
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(18000),
      });
      if (!resp.ok) {
        console.warn(`Overpass ${endpoint} returned ${resp.status}`);
        await resp.text();
        continue;
      }
      const json = await resp.json();
      const elements: OverpassElement[] = json.elements ?? [];
      const capped = elements.slice(0, featureCap);
      return overpassToGeoJSON(capped);
    } catch (err) {
      console.warn(`Overpass ${endpoint} failed:`, err);
      continue;
    }
  }
  return { type: "FeatureCollection", features: [] };
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
      !ROAD_FILTERS[road_type]
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Invalid input. Required: bbox [south,west,north,east], road_type (osm_major_roads|osm_minor_roads|osm_footways)",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Clamp bbox to prevent oversized queries
    const clampedBbox = clampBbox(bbox as [number, number, number, number], road_type);
    const cap = Math.min(feature_cap ?? 5000, 10000);
    const query = buildQuery(clampedBbox, road_type);
    const geojson = await fetchWithRetry(query, cap);

    return new Response(JSON.stringify(geojson), {
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
