import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Legacy layer ID → table mapping (backwards compatibility)
const LEGACY_MAP: Record<string, { tables: string[]; srid: number }> = {
  site_utilisation: { tables: ["site_utilisation"], srid: 27700 },
  primary_substations: { tables: ["primary_substations_33kv", "primary_substations_66kv"], srid: 27700 },
  ehv_feeders: { tables: ["feeders_ehv"], srid: 27700 },
  hv_feeders: { tables: ["feeders_hv_33kv", "feeders_hv_66kv"], srid: 27700 },
  underground_cables: { tables: ["cables_hv_ug_capacity", "cables_ehv_ug_capacity"], srid: 27700 },
  ndp: { tables: ["ndp_projects"], srid: 27700 },
  highway_widths: { tables: ["highway_widths"], srid: 27700 },
  wayleaves: { tables: ["wayleaves"], srid: 27700 },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const layerParam = url.searchParams.get("layer");
    const layerId = url.searchParams.get("layer_id"); // new: UUID from layer_registry
    const bboxParam = url.searchParams.get("bbox"); // minLng,minLat,maxLng,maxLat
    const dnoClip = url.searchParams.get("dno_clip"); // optional: DNO code for spatial filtering
    const limitParam = parseInt(url.searchParams.get("limit") || "5000");
    const limit = Math.min(Math.max(limitParam, 1), 10000);

    // --- New dynamic path: query by layer_id (UUID) ---
    if (layerId) {
      const { data: layerMeta, error: metaErr } = await supabase
        .from("layer_registry")
        .select("id, storage_table, slug, enabled")
        .eq("id", layerId)
        .single();

      if (metaErr || !layerMeta) {
        return new Response(
          JSON.stringify({ error: "Layer not found", layer_id: layerId }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!layerMeta.enabled) {
        return new Response(
          JSON.stringify({ type: "FeatureCollection", features: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } }
        );
      }

      const { data: features, error: rpcErr } = await supabase.rpc("get_geo_layer_geojson", {
        _layer_id: layerId,
        _storage_table: layerMeta.storage_table,
        _bbox: bboxParam || null,
        _limit: limit,
        _dno_clip: dnoClip || null,
      });

      if (rpcErr) {
        console.error("RPC error:", rpcErr);
        return new Response(
          JSON.stringify({ error: rpcErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const geojson = {
        type: "FeatureCollection",
        features: features || [],
      };

      return new Response(JSON.stringify(geojson), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
        },
      });
    }

    // --- Legacy path: query by slug/layer name ---
    if (!layerParam) {
      return new Response(
        JSON.stringify({ error: "Provide ?layer_id=<uuid> or ?layer=<slug>" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // First try layer_registry by slug
    const { data: regLayer } = await supabase
      .from("layer_registry")
      .select("id, storage_table, enabled")
      .eq("slug", layerParam)
      .single();

    if (regLayer && regLayer.enabled) {
      const { data: features, error: rpcErr } = await supabase.rpc("get_geo_layer_geojson", {
        _layer_id: regLayer.id,
        _storage_table: regLayer.storage_table,
        _bbox: bboxParam || null,
        _limit: limit,
        _dno_clip: dnoClip || null,
      });

      if (rpcErr) {
        console.error("RPC error:", rpcErr);
        return new Response(
          JSON.stringify({ error: rpcErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ type: "FeatureCollection", features: features || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } }
      );
    }

    // Fall back to legacy hardcoded tables
    const legacy = LEGACY_MAP[layerParam];
    if (!legacy) {
      return new Response(
        JSON.stringify({ error: "Unknown layer", layer: layerParam }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allFeatures: any[] = [];
    let bboxFilter = "";
    if (bboxParam) {
      const [minLng, minLat, maxLng, maxLat] = bboxParam.split(",").map(Number);
      if (legacy.srid === 27700) {
        bboxFilter = `AND ST_Intersects(geom, ST_Transform(ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326), 27700))`;
      } else {
        bboxFilter = `AND ST_Intersects(geom, ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326))`;
      }
    }

    for (const table of legacy.tables) {
      const { data, error } = await supabase.rpc("get_layer_geojson", {
        _table_name: table,
        _bbox_filter: bboxFilter,
        _limit: limit,
      });

      if (error) {
        console.error(`Error querying ${table}:`, error);
        continue;
      }
      if (data && Array.isArray(data)) {
        allFeatures.push(...data);
      }
    }

    return new Response(
      JSON.stringify({ type: "FeatureCollection", features: allFeatures }),
      { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } }
    );
  } catch (err) {
    console.error("get-layer-geojson error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
