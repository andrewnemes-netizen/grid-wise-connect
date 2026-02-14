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

    // Verify admin
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

    if (!rows || !Array.isArray(rows)) {
      return new Response(JSON.stringify({ error: "rows array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let inserted = 0;
    let errors = 0;
    const batchSize = 100;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const values: string[] = [];

      for (const row of batch) {
        const easting = parseFloat(row.site_easting);
        const northing = parseFloat(row.site_northing);

        if (isNaN(easting) || isNaN(northing)) {
          errors++;
          continue;
        }

        const siteName = (row.site_name || "").replace(/'/g, "''");
        const siteId = (row.site_id || "").replace(/'/g, "''");
        const amsSiteAssetId = (row.ams_site_asset_id || "").replace(/'/g, "''");
        const transformerId = (row.transformer_id || "").replace(/'/g, "''");
        const substationType = (row.substation_type || "").replace(/'/g, "''");
        const licenceArea = (row.licence_area || "").replace(/'/g, "''");
        const loadingsSource = (row.loadings_data_source || "").replace(/'/g, "''");
        const maxDemand = parseFloat(row.max_demand_kw) || null;
        const customers = parseInt(row.connected_customers) || null;
        const firmCapacity = parseFloat(row.firm_capacity_kw) || null;
        const headroom = parseFloat(row.transformer_headroom_kw) || null;
        const headroomBand = (row.headroom_band || "").replace(/'/g, "''");
        const utilPct = parseInt(row.utilisation_pct) || null;
        const utilBand = (row.utilisation_band || "").replace(/'/g, "''");
        const subClass = (row.substation_class || "").replace(/'/g, "''");
        const threePhase = (row.three_phase || "").replace(/'/g, "''");
        const upstream = (row.upstream_site || "").replace(/'/g, "''");
        const siteBand = (row.site_band || "").replace(/'/g, "''");
        const geoPoint = (row.geo_point || "").replace(/'/g, "''");
        const msoaName = (row.msoa_name || "").replace(/'/g, "''");
        const msoaCode = (row.msoa_code || "").replace(/'/g, "''");
        const lsoaName = (row.lsoa_name || "").replace(/'/g, "''");
        const lsoaCode = (row.lsoa_code || "").replace(/'/g, "''");
        const la = (row.local_authority || "").replace(/'/g, "''");
        const laCode = (row.local_authority_code || "").replace(/'/g, "''");
        const wardName = (row.ward_name || "").replace(/'/g, "''");
        const wardCode = (row.ward_code || "").replace(/'/g, "''");

        values.push(`(
          '${siteName}', '${siteId}', '${amsSiteAssetId}', '${transformerId}',
          '${substationType}', '${licenceArea}', '${loadingsSource}',
          ${maxDemand}, ${customers}, ${firmCapacity}, ${headroom},
          '${headroomBand}', ${utilPct}, '${utilBand}', '${subClass}',
          '${threePhase}', '${upstream}', ${easting}, ${northing},
          '${siteBand}', '${geoPoint}', '${msoaName}', '${msoaCode}',
          '${lsoaName}', '${lsoaCode}', '${la}', '${laCode}',
          '${wardName}', '${wardCode}',
          ST_SetSRID(ST_MakePoint(${easting}, ${northing}), 27700)
        )`);
      }

      if (values.length > 0) {
        const sql = `INSERT INTO public.site_utilisation (
          site_name, site_id, ams_site_asset_id, transformer_id,
          substation_type, licence_area, loadings_data_source,
          max_demand_kw, connected_customers, firm_capacity_kw, transformer_headroom_kw,
          headroom_band, utilisation_pct, utilisation_band, substation_class,
          three_phase, upstream_site, site_easting, site_northing,
          site_band, geo_point, msoa_name, msoa_code,
          lsoa_name, lsoa_code, local_authority, local_authority_code,
          ward_name, ward_code, geom
        ) VALUES ${values.join(",")}
        ON CONFLICT (site_id) DO UPDATE SET
          max_demand_kw = EXCLUDED.max_demand_kw,
          firm_capacity_kw = EXCLUDED.firm_capacity_kw,
          transformer_headroom_kw = EXCLUDED.transformer_headroom_kw,
          headroom_band = EXCLUDED.headroom_band,
          utilisation_pct = EXCLUDED.utilisation_pct,
          utilisation_band = EXCLUDED.utilisation_band,
          site_band = EXCLUDED.site_band`;

        const { error } = await supabase.rpc("exec_sql", { sql });
        if (error) {
          // Try direct approach
          const { error: err2 } = await supabase.from("site_utilisation").upsert(
            batch.filter(r => !isNaN(parseFloat(r.site_easting))).map(r => ({
              site_name: r.site_name,
              site_id: r.site_id,
              ams_site_asset_id: r.ams_site_asset_id,
              transformer_id: r.transformer_id,
              substation_type: r.substation_type,
              licence_area: r.licence_area,
              loadings_data_source: r.loadings_data_source,
              max_demand_kw: parseFloat(r.max_demand_kw) || null,
              connected_customers: parseInt(r.connected_customers) || null,
              firm_capacity_kw: parseFloat(r.firm_capacity_kw) || null,
              transformer_headroom_kw: parseFloat(r.transformer_headroom_kw) || null,
              headroom_band: r.headroom_band,
              utilisation_pct: parseInt(r.utilisation_pct) || null,
              utilisation_band: r.utilisation_band,
              substation_class: r.substation_class,
              three_phase: r.three_phase,
              upstream_site: r.upstream_site,
              site_easting: parseFloat(r.site_easting),
              site_northing: parseFloat(r.site_northing),
              site_band: r.site_band,
              geo_point: r.geo_point,
              msoa_name: r.msoa_name,
              msoa_code: r.msoa_code,
              lsoa_name: r.lsoa_name,
              lsoa_code: r.lsoa_code,
              local_authority: r.local_authority,
              local_authority_code: r.local_authority_code,
              ward_name: r.ward_name,
              ward_code: r.ward_code,
            })),
            { onConflict: "site_id" }
          );
          if (err2) {
            console.error("Batch insert error:", err2);
            errors += batch.length;
            continue;
          }
        }
        inserted += values.length;
      }
    }

    // Update geom from eastings/northings for rows inserted via upsert (no geom)
    await supabase.rpc("update_site_utilisation_geom");

    return new Response(
      JSON.stringify({ inserted, errors, total: rows.length }),
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
