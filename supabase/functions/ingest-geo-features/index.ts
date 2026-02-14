import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { layer_id, storage_table, dno, features } = await req.json();

    if (!layer_id || !storage_table || !dno || !Array.isArray(features) || !features.length) {
      return new Response(
        JSON.stringify({ error: "layer_id, storage_table, dno, and features[] required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the features JSON for the batch insert RPC
    const mappedFeatures = features.map((f: any) => {
      const props = f.properties || {};
      return {
        geom_geojson: JSON.stringify(f.geometry),
        layer_id,
        dno,
        name: props.name || props.site_name || props.Name || props.SITE_NAME || null,
        asset_id: props.asset_id || props.ASSET_ID || props.site_id || props.SITE_ID || null,
        attrs_json: props,
        status: props.status || "unknown",
        // substation
        capacity_kw: parseNum(props.firm_capacity_kw || props.capacity_kw),
        demand_kw: parseNum(props.max_demand_kw || props.demand_kw),
        headroom_kw: parseNum(props.transformer_headroom_kw || props.headroom_kw),
        utilisation_pct: parseNum(props.utilisation_pct),
        voltage_kv: parseNum(props.voltage_kv),
        // feeder
        feeder_ref: props.feeder_ref || null,
        // cable
        capacity_value: parseNum(props.capacity_value),
        capacity_unit: props.capacity_unit || null,
        capacity_flag: props.capacity_flag || "unknown",
        // constraint
        constraint_type: props.constraint_type || props.type || null,
      };
    });

    const { data: inserted, error: rpcError } = await supabase.rpc("batch_insert_geo_features", {
      _table_name: storage_table,
      _features_json: JSON.stringify(mappedFeatures),
    });

    if (rpcError) {
      console.error("RPC error:", rpcError);
      return new Response(
        JSON.stringify({ error: rpcError.message, inserted: 0 }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update feature count
    const { count } = await supabase
      .from(storage_table)
      .select("*", { count: "exact", head: true })
      .eq("layer_id", layer_id);

    await supabase
      .from("layer_registry")
      .update({ feature_count: count ?? 0, updated_at: new Date().toISOString() })
      .eq("id", layer_id);

    return new Response(
      JSON.stringify({ inserted: inserted ?? features.length, total_in_layer: count }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Ingest error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function parseNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
