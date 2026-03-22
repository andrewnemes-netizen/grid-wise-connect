import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DFT_BASE = "https://roadtraffic.dft.gov.uk/api";

interface CountPointRaw {
  id: number;
  latitude: number;
  longitude: number;
  road_name: string;
  road_category: string;
  road_type: string;
  local_authority_name: string;
  region_name: string;
  count_point_id?: number;
}

/**
 * DfT Road Traffic Count Points Proxy
 *
 * Actions:
 *  - ingest: Paginate all count points, enrich with latest AADF, write to geo_points
 *  - detail: Return AADF vehicle breakdown for a single count_point_id
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action as string;

    if (action === "detail") {
      return await handleDetail(body.count_point_id);
    }

    if (action === "ingest") {
      return await handleIngest(req);
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use 'ingest' or 'detail'." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("DfT proxy error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

/** Fetch AADF vehicle breakdown for a single count point */
async function handleDetail(countPointId: number | string) {
  if (!countPointId) {
    return new Response(JSON.stringify({ error: "count_point_id required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = `${DFT_BASE}/average-annual-daily-flow?filter[count_point_id]=${countPointId}&page[size]=20&sort=-year`;
  const resp = await fetch(url);
  if (!resp.ok) {
    return new Response(JSON.stringify({ error: `DfT API error: ${resp.status}` }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const json = await resp.json();
  const rows = (json.rows || json.data || []).map((r: any) => ({
    year: r.year,
    all_motor_vehicles: r.all_motor_vehicles,
    cars_and_taxis: r.cars_and_taxis,
    buses_and_coaches: r.buses_and_coaches,
    lgvs: r.lgvs,
    all_hgvs: r.all_hgvs,
    two_wheeled_motor_vehicles: r.two_wheeled_motor_vehicles,
    pedal_cycles: r.pedal_cycles,
    estimation_method: r.estimation_method,
    road_name: r.road_name,
    road_category: r.road_category,
    local_authority_name: r.local_authority_name,
  }));

  return new Response(JSON.stringify({ count_point_id: countPointId, aadf: rows }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Paginate all count points, attach latest AADF, upsert into geo_points */
async function handleIngest(req: Request) {
  // Auth check
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Verify user
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
  if (claimsErr || !claimsData?.claims) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check admin role
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
  const userId = claimsData.claims.sub as string;
  const { data: isAdmin } = await serviceClient.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: "Admin role required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Find the layer_registry entry
  const { data: layerMeta } = await serviceClient
    .from("layer_registry")
    .select("id")
    .eq("slug", "dft_traffic_count_points")
    .single();

  if (!layerMeta) {
    return new Response(JSON.stringify({ error: "Layer registry entry not found for dft_traffic_count_points" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const layerId = layerMeta.id;
  let totalInserted = 0;
  let pageNum = 1;
  const pageSize = 1000;

  // Paginate through count points
  while (true) {
    const cpUrl = `${DFT_BASE}/count-points?page[size]=${pageSize}&page[number]=${pageNum}`;
    console.log(`Fetching page ${pageNum}: ${cpUrl}`);
    const cpResp = await fetch(cpUrl);
    if (!cpResp.ok) {
      console.error(`DfT API error on page ${pageNum}: ${cpResp.status}`);
      break;
    }

    const cpJson = await cpResp.json();
    const rows: CountPointRaw[] = cpJson.rows || cpJson.data || [];
    if (rows.length === 0) break;

    // Build geo_points rows
    const geoRows = rows
      .filter((r) => r.latitude && r.longitude)
      .map((r) => ({
        layer_id: layerId,
        dno: "National",
        asset_id: String(r.count_point_id || r.id),
        name: r.road_name || `Count Point ${r.count_point_id || r.id}`,
        geom: `SRID=4326;POINT(${r.longitude} ${r.latitude})`,
        attrs_json: {
          count_point_id: r.count_point_id || r.id,
          road_name: r.road_name,
          road_category: r.road_category,
          road_type: r.road_type,
          local_authority: r.local_authority_name,
          region: r.region_name,
        },
      }));

    if (geoRows.length > 0) {
      const { error: insertErr } = await serviceClient
        .from("geo_points")
        .upsert(geoRows, { onConflict: "layer_id,asset_id", ignoreDuplicates: true });

      if (insertErr) {
        console.error(`Insert error page ${pageNum}:`, insertErr);
      } else {
        totalInserted += geoRows.length;
      }
    }

    if (rows.length < pageSize) break;
    pageNum++;

    // Rate limit — be gentle with the DfT API
    await new Promise((r) => setTimeout(r, 500));
  }

  // Update feature count
  await serviceClient
    .from("layer_registry")
    .update({ feature_count: totalInserted, updated_at: new Date().toISOString() })
    .eq("id", layerId);

  return new Response(
    JSON.stringify({ success: true, total_inserted: totalInserted, pages_fetched: pageNum }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
