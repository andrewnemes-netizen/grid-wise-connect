import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

Deno.serve(async (req: Request) => {
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const userResp = await supabase.auth.getUser(token);
    if (userResp.error || !userResp.data.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const layerParam = url.searchParams.get("layer");
    const layerId = url.searchParams.get("layer_id");
    const bboxParam = url.searchParams.get("bbox");
    const dnoClip = url.searchParams.get("dno_clip");
    const rawLimit = parseInt(url.searchParams.get("limit") || "5000", 10);
    const limit = Math.min(Math.max(rawLimit, 1), 10000);

    // Dynamic path: query by layer_id (UUID)
    if (layerId) {
      const metaResp = await supabase
        .from("layer_registry")
        .select("id, storage_table, slug, enabled")
        .eq("id", layerId)
        .single();

      if (metaResp.error || !metaResp.data) {
        return new Response(
          JSON.stringify({ error: "Layer not found", layer_id: layerId }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const layerMeta = metaResp.data;

      if (!layerMeta.enabled) {
        return new Response(
          JSON.stringify({ type: "FeatureCollection", features: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } },
        );
      }

      const rpcResp = await supabase.rpc("get_geo_layer_geojson", {
        _layer_id: layerId,
        _storage_table: layerMeta.storage_table,
        _bbox: bboxParam || null,
        _limit: limit,
        _dno_clip: dnoClip || null,
      });

      if (rpcResp.error) {
        console.error("RPC error:", rpcResp.error);
        return new Response(JSON.stringify({ error: rpcResp.error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ type: "FeatureCollection", features: rpcResp.data || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } },
      );
    }

    // Legacy path: query by slug/layer name
    if (!layerParam) {
      return new Response(
        JSON.stringify({ error: "Provide ?layer_id=<uuid> or ?layer=<slug>" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // First try layer_registry by slug
    const regResp = await supabase
      .from("layer_registry")
      .select("id, storage_table, enabled")
      .eq("slug", layerParam)
      .single();

    if (regResp.data && regResp.data.enabled) {
      const regLayer = regResp.data;
      const rpcResp = await supabase.rpc("get_geo_layer_geojson", {
        _layer_id: regLayer.id,
        _storage_table: regLayer.storage_table,
        _bbox: bboxParam || null,
        _limit: limit,
        _dno_clip: dnoClip || null,
      });

      if (rpcResp.error) {
        console.error("RPC error:", rpcResp.error);
        return new Response(JSON.stringify({ error: rpcResp.error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ type: "FeatureCollection", features: rpcResp.data || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } },
      );
    }

    // Fall back to legacy hardcoded tables
    const legacy = LEGACY_MAP[layerParam];
    if (!legacy) {
      return new Response(
        JSON.stringify({ error: "Unknown layer", layer: layerParam }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const allFeatures: unknown[] = [];
    let bboxFilter = "";
    if (bboxParam) {
      const parts = bboxParam.split(",").map(Number);
      const minLng = parts[0];
      const minLat = parts[1];
      const maxLng = parts[2];
      const maxLat = parts[3];
      if (legacy.srid === 27700) {
        bboxFilter = `AND ST_Intersects(geom, ST_Transform(ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326), 27700))`;
      } else {
        bboxFilter = `AND ST_Intersects(geom, ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326))`;
      }
    }

    for (const table of legacy.tables) {
      const resp = await supabase.rpc("get_layer_geojson", {
        _table_name: table,
        _bbox_filter: bboxFilter,
        _limit: limit,
      });

      if (resp.error) {
        console.error(`Error querying ${table}:`, resp.error);
        continue;
      }
      if (resp.data && Array.isArray(resp.data)) {
        allFeatures.push(...resp.data);
      }
    }

    return new Response(
      JSON.stringify({ type: "FeatureCollection", features: allFeatures }),
      { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=300" } },
    );
  } catch (err) {
    console.error("get-layer-geojson error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
