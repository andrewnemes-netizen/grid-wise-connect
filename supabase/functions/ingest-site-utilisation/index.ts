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

    // Verify user is admin
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { rows } = await req.json();

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "rows array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map and clean rows for upsert via supabase client
    const mapped = rows
      .filter((r: any) => r.site_id && r.site_easting && r.site_northing)
      .map((r: any) => ({
        site_name: String(r.site_name || ""),
        site_id: String(r.site_id || ""),
        ams_site_asset_id: r.ams_site_asset_id ? String(r.ams_site_asset_id) : null,
        transformer_id: r.transformer_id ? String(r.transformer_id) : null,
        substation_type: r.substation_type || null,
        licence_area: r.licence_area || null,
        loadings_data_source: r.loadings_data_source || null,
        max_demand_kw: parseFloat(r.max_demand_kw) || null,
        connected_customers: parseInt(r.connected_customers) || null,
        firm_capacity_kw: parseFloat(r.firm_capacity_kw) || null,
        transformer_headroom_kw: parseFloat(r.transformer_headroom_kw) || null,
        headroom_band: r.headroom_band || null,
        utilisation_pct: parseInt(r.utilisation_pct) || null,
        utilisation_band: r.utilisation_band || null,
        substation_class: r.substation_class || null,
        three_phase: r.three_phase || null,
        upstream_site: r.upstream_site || null,
        site_easting: parseFloat(r.site_easting) || null,
        site_northing: parseFloat(r.site_northing) || null,
        site_band: r.site_band || null,
        geo_point: r.geo_point || null,
        msoa_name: r.msoa_name || null,
        msoa_code: r.msoa_code || null,
        lsoa_name: r.lsoa_name || null,
        lsoa_code: r.lsoa_code || null,
        local_authority: r.local_authority || null,
        local_authority_code: r.local_authority_code || null,
        ward_name: r.ward_name || null,
        ward_code: r.ward_code || null,
      }));

    const { error } = await supabase
      .from("site_utilisation")
      .upsert(mapped, { onConflict: "site_id" });

    if (error) {
      console.error("Upsert error:", error);
      return new Response(JSON.stringify({ error: error.message, inserted: 0 }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update geom from eastings/northings
    await supabase.rpc("update_site_utilisation_geom");

    return new Response(
      JSON.stringify({ inserted: mapped.length, total: rows.length }),
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
