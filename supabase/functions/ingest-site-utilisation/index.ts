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

    const { rows } = await req.json();

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return new Response(JSON.stringify({ error: "rows array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Map rows - now flexible: site_id + coordinates are optional
    const mapped = rows
      .filter((r: any) => r.site_name || r.site_id) // only need a name or id
      .map((r: any) => {
        const record: Record<string, any> = {
          site_name: String(r.site_name || r.site_id || ""),
          site_id: String(r.site_id || r.site_name || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, ""),
        };

        // Optional standard fields
        if (r.ams_site_asset_id) record.ams_site_asset_id = String(r.ams_site_asset_id);
        if (r.transformer_id) record.transformer_id = String(r.transformer_id);
        if (r.substation_type) record.substation_type = r.substation_type;
        if (r.licence_area) record.licence_area = r.licence_area;
        if (r.loadings_data_source) record.loadings_data_source = r.loadings_data_source;
        if (r.max_demand_kw != null && !isNaN(parseFloat(r.max_demand_kw))) record.max_demand_kw = parseFloat(r.max_demand_kw);
        if (r.connected_customers != null && !isNaN(parseInt(r.connected_customers))) record.connected_customers = parseInt(r.connected_customers);
        if (r.firm_capacity_kw != null && !isNaN(parseFloat(r.firm_capacity_kw))) record.firm_capacity_kw = parseFloat(r.firm_capacity_kw);
        if (r.transformer_headroom_kw != null && !isNaN(parseFloat(r.transformer_headroom_kw))) record.transformer_headroom_kw = parseFloat(r.transformer_headroom_kw);
        if (r.headroom_band) record.headroom_band = r.headroom_band;
        if (r.utilisation_pct != null && !isNaN(parseInt(r.utilisation_pct))) record.utilisation_pct = parseInt(r.utilisation_pct);
        if (r.utilisation_band) record.utilisation_band = r.utilisation_band;
        if (r.substation_class) record.substation_class = r.substation_class;
        if (r.three_phase) record.three_phase = r.three_phase;
        if (r.upstream_site) record.upstream_site = r.upstream_site;
        if (r.site_easting != null && !isNaN(parseFloat(r.site_easting))) record.site_easting = parseFloat(r.site_easting);
        if (r.site_northing != null && !isNaN(parseFloat(r.site_northing))) record.site_northing = parseFloat(r.site_northing);
        if (r.site_band) record.site_band = r.site_band;
        if (r.geo_point) record.geo_point = r.geo_point;
        if (r.msoa_name) record.msoa_name = r.msoa_name;
        if (r.msoa_code) record.msoa_code = r.msoa_code;
        if (r.lsoa_name) record.lsoa_name = r.lsoa_name;
        if (r.lsoa_code) record.lsoa_code = r.lsoa_code;
        if (r.local_authority) record.local_authority = r.local_authority;
        if (r.local_authority_code) record.local_authority_code = r.local_authority_code;
        if (r.ward_name) record.ward_name = r.ward_name;
        if (r.ward_code) record.ward_code = r.ward_code;

        // Store any extra data in attrs_json
        if (r.attrs_json) {
          record.attrs_json = typeof r.attrs_json === "string" ? r.attrs_json : JSON.stringify(r.attrs_json);
        }

        return record;
      });

    if (mapped.length === 0) {
      return new Response(JSON.stringify({ error: "No valid rows found", inserted: 0 }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Update geom from eastings/northings (only affects rows that have them)
    const hasCoords = mapped.some((r) => r.site_easting && r.site_northing);
    if (hasCoords) {
      await supabase.rpc("update_site_utilisation_geom");
    }

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
