import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Map front-end layer IDs to database table(s) and geometry type
const LAYER_TABLE_MAP: Record<string, { tables: string[]; type: "line" | "point" | "polygon" }> = {
  primary_substations: {
    tables: ["primary_substations_33kv", "primary_substations_66kv"],
    type: "point",
  },
  ehv_feeders: {
    tables: ["feeders_ehv"],
    type: "line",
  },
  hv_feeders: {
    tables: ["feeders_hv_33kv", "feeders_hv_66kv"],
    type: "line",
  },
  underground_cables: {
    tables: ["cables_hv_ug_capacity", "cables_ehv_ug_capacity"],
    type: "line",
  },
  ndp: {
    tables: ["ndp_projects"],
    type: "polygon",
  },
  highway_widths: {
    tables: ["highway_widths"],
    type: "line",
  },
  wayleaves: {
    tables: ["wayleaves"],
    type: "polygon",
  },
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

    const url = new URL(req.url);
    const layerId = url.searchParams.get("layer");
    const bboxParam = url.searchParams.get("bbox"); // optional: minLng,minLat,maxLng,maxLat

    if (!layerId || !LAYER_TABLE_MAP[layerId]) {
      return new Response(
        JSON.stringify({ error: "Invalid layer", valid: Object.keys(LAYER_TABLE_MAP) }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify the user is authenticated
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const config = LAYER_TABLE_MAP[layerId];
    const allFeatures: any[] = [];

    // Build optional bbox filter (transform bbox from 4326 to 27700 for the query)
    let bboxFilter = "";
    if (bboxParam) {
      const [minLng, minLat, maxLng, maxLat] = bboxParam.split(",").map(Number);
      bboxFilter = `AND ST_Intersects(geom, ST_Transform(ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326), 27700))`;
    }

    for (const table of config.tables) {
      // Use raw SQL via the rpc approach - query geom as GeoJSON + properties
      const { data, error } = await supabase.rpc("get_layer_geojson", {
        _table_name: table,
        _bbox_filter: bboxFilter,
        _limit: 5000,
      });

      if (error) {
        console.error(`Error querying ${table}:`, error);
        continue;
      }

      if (data && Array.isArray(data)) {
        allFeatures.push(...data);
      }
    }

    const geojson = {
      type: "FeatureCollection",
      features: allFeatures,
    };

    return new Response(JSON.stringify(geojson), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    console.error("get-layer-geojson error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
