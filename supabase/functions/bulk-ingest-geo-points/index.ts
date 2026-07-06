import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ingest-token",
};

// One-off ingest for large point uploads. Protected by a shared token header.
const SHARED_TOKEN = "camb-lights-ingest-9c4b2f7e";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (req.headers.get("x-ingest-token") !== SHARED_TOKEN) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { layer_id, dno, features } = await req.json();
    if (!layer_id || !dno || !Array.isArray(features) || !features.length) {
      return new Response(JSON.stringify({ error: "layer_id, dno, features[] required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const mapped = features.map((f: any) => ({
      geom_geojson: JSON.stringify({ type: "Point", coordinates: [f.lng, f.lat] }),
      layer_id,
      dno,
      name: f.name ?? null,
      asset_id: f.asset_id ?? null,
      attrs_json: f.props ?? {},
      status: "unknown",
      capacity_flag: "unknown",
    }));

    const { data, error } = await supabase.rpc("batch_insert_geo_features", {
      _table_name: "geo_points",
      _features_json: JSON.stringify(mapped),
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { count } = await supabase
      .from("geo_points")
      .select("*", { count: "exact", head: true })
      .eq("layer_id", layer_id);

    await supabase.from("layer_registry").update({ feature_count: count ?? 0, updated_at: new Date().toISOString() }).eq("id", layer_id);

    return new Response(JSON.stringify({ inserted: data ?? mapped.length, total_in_layer: count }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});