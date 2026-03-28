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
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const fetchWithTimeout = (url: RequestInfo | URL, init?: RequestInit) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 30000);
      return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(id));
    };

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { fetch: fetchWithTimeout },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { lng, lat, proposed_kw, site_name, postcode, site_type } = await req.json();

    if (!lng || !lat) {
      return new Response(JSON.stringify({ error: "lng and lat are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Score the site via direct REST call (bypasses 8s PostgREST statement timeout)
    const scoreController = new AbortController();
    const scoreTimer = setTimeout(() => scoreController.abort(), 28000);

    let scoreData: any;
    let scoreError: any;
    try {
      const rpcRes = await fetch(
        `${supabaseUrl}/rest/v1/rpc/score_site_from_lnglat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Prefer": "params=single-object",
          },
          body: JSON.stringify({ _lng: lng, _lat: lat, _proposed_kw: proposed_kw || 0 }),
          signal: scoreController.signal,
        }
      );
      if (!rpcRes.ok) {
        const errText = await rpcRes.text();
        scoreError = { message: errText };
      } else {
        scoreData = await rpcRes.json();
      }
    } catch (fetchErr: any) {
      scoreError = { message: fetchErr?.message || "scoring timed out" };
    } finally {
      clearTimeout(scoreTimer);
    }

    if (scoreError) {
      console.error("Score error:", scoreError);
      return new Response(JSON.stringify({ error: scoreError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Traffic + NaPTAN: Direct SQL queries via supabase-js (bypasses RPC timeout issues) ──
    // First, look up layer_ids by slug
    const { data: layers } = await supabase
      .from("layer_registry")
      .select("id, slug")
      .in("slug", ["dft_traffic_count_points", "naptan_transport_nodes"]);

    const trafficLayerId = layers?.find((l: any) => l.slug === "dft_traffic_count_points")?.id;
    const naptanLayerId = layers?.find((l: any) => l.slug === "naptan_transport_nodes")?.id;

    console.log("Layer IDs — traffic:", trafficLayerId, "naptan:", naptanLayerId);

    // Use direct PostgREST RPC with proper error logging
    const trafficPromise = trafficLayerId
      ? fetch(
          `${supabaseUrl}/rest/v1/rpc/nearby_geo_points_by_slug`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` },
            body: JSON.stringify({ p_slug: "dft_traffic_count_points", p_lng: lng, p_lat: lat, p_radius_m: 1000, p_limit: 20 }),
            signal: AbortSignal.timeout(15000),
          }
        ).then(async r => {
          if (!r.ok) {
            const errText = await r.text();
            console.error("Traffic RPC error:", r.status, errText);
            return [];
          }
          return r.json();
        }).catch((e) => { console.error("Traffic fetch error:", e.message); return []; })
      : Promise.resolve([]);

    const naptanPromise = naptanLayerId
      ? fetch(
          `${supabaseUrl}/rest/v1/rpc/nearby_geo_points_by_slug`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` },
            body: JSON.stringify({ p_slug: "naptan_transport_nodes", p_lng: lng, p_lat: lat, p_radius_m: 500, p_limit: 50 }),
            signal: AbortSignal.timeout(15000),
          }
        ).then(async r => {
          if (!r.ok) {
            const errText = await r.text();
            console.error("NaPTAN RPC error:", r.status, errText);
            return [];
          }
          return r.json();
        }).catch((e) => { console.error("NaPTAN fetch error:", e.message); return []; })
      : Promise.resolve([]);

    // Adaptive radius search for nearest substations
    let substations: any[] = [];
    const radii = [0.02, 0.05, 0.1];

    for (const offset of radii) {
      const searchPolygon = {
        type: "Polygon",
        coordinates: [[
          [lng - offset, lat - offset],
          [lng + offset, lat - offset],
          [lng + offset, lat + offset],
          [lng - offset, lat + offset],
          [lng - offset, lat - offset],
        ]],
      };

      try {
        const subRes = await fetch(
          `${supabaseUrl}/rest/v1/rpc/search_substations_in_polygon`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": supabaseKey,
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ _geojson: JSON.stringify(searchPolygon), _limit: 10 }),
            signal: AbortSignal.timeout(20000),
          }
        );
        if (subRes.ok) {
          substations = await subRes.json() || [];
        } else {
          const errText = await subRes.text();
          console.error("Substation search error:", errText);
          break;
        }
      } catch (subErr: any) {
        console.error("Substation fetch error:", subErr?.message);
        break;
      }

      if (substations.length > 0) break;
    }

    const nearestSubstations = substations.map((s: any) => ({
      site_name: s.site_name,
      site_id: s.site_id,
      utilisation_pct: s.utilisation_pct,
      firm_capacity_kw: s.firm_capacity_kw,
      max_demand_kw: s.max_demand_kw,
      transformer_headroom_kw: s.transformer_headroom_kw,
      headroom_band: s.headroom_band,
      utilisation_band: s.utilisation_band,
    }));

    // Resolve traffic + NaPTAN
    const [trafficPoints, naptanNodes] = await Promise.all([trafficPromise, naptanPromise]);

    console.log("Traffic points returned:", trafficPoints?.length || 0);
    console.log("NaPTAN nodes returned:", naptanNodes?.length || 0);

    // Extract traffic AADF
    const trafficData = (trafficPoints || []).map((t: any) => ({
      count_point_id: t.attrs_json?.count_point_id || t.asset_id,
      road_name: t.attrs_json?.road_name || t.name,
      all_motor_vehicles: t.attrs_json?.all_motor_vehicles || 0,
      road_category: t.attrs_json?.road_category,
      distance_m: t.distance_m,
    }));
    const maxAadf = Math.max(0, ...trafficData.map((t: any) => t.all_motor_vehicles || 0));

    // If max AADF is 0, try live DfT API for the nearest count point
    let liveAadf = maxAadf;
    if (maxAadf === 0 && trafficData.length > 0) {
      const nearestCpId = trafficData[0].count_point_id;
      console.log("AADF is 0, trying live DfT API for count point:", nearestCpId);
      try {
        const aadfUrl = `https://roadtraffic.dft.gov.uk/api/average-annual-daily-flow?filter[count_point_id]=${nearestCpId}&page[size]=1&sort=-year`;
        const aadfResp = await fetch(aadfUrl, { signal: AbortSignal.timeout(8000) });
        if (aadfResp.ok) {
          const aadfJson = await aadfResp.json();
          // DfT API returns { data: [{ id, type, attributes: { all_motor_vehicles, ... } }] }
          const aadfRows = aadfJson.data || [];
          if (aadfRows.length > 0) {
            // Try attributes.all_motor_vehicles first (DfT JSON:API format), then top-level
            const row = aadfRows[0];
            liveAadf = row?.attributes?.all_motor_vehicles || row?.all_motor_vehicles || 0;
            trafficData[0].all_motor_vehicles = liveAadf;
            console.log("Live DfT AADF:", liveAadf);
          }
        } else {
          const errText = await aadfResp.text();
          console.error("DfT AADF API error:", aadfResp.status, errText);
        }
      } catch (e: any) {
        console.error("DfT AADF fallback error:", e.message);
      }
    }

    // Extract NaPTAN accessibility data
    const busStops = (naptanNodes || []).filter((n: any) => {
      const t = n.attrs_json?.node_type || n.attrs_json?.stop_type || "";
      return t === "bus" || t === "BCT" || t === "BCS";
    }).length;
    const railStations = (naptanNodes || []).filter((n: any) => {
      const t = n.attrs_json?.node_type || n.attrs_json?.stop_type || "";
      return t === "rail" || t === "RLY" || t === "MET";
    }).length;

    console.log("Bus stops:", busStops, "Rail stations:", railStations);

    // Check user roles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const userRoles = (roles || []).map((r: { role: string }) => r.role);
    const isInternal = userRoles.includes("admin") || userRoles.includes("engineer");

    let result = scoreData;

    // Add enrichment data
    result = {
      ...result,
      nearest_substations: nearestSubstations,
      traffic_aadf: liveAadf,
      traffic_count_points: trafficData.length,
      nearby_bus_stops: busStops,
      nearby_rail_stations: railStations,
      nearby_transport_nodes: (naptanNodes || []).length,
    };

    // Filter output for clients
    if (!isInternal) {
      const distances = result.distances || {};
      const distanceBand = (m: number) => {
        if (m < 250) return "Close (<250m)";
        if (m <= 750) return "Medium (250–750m)";
        return "Far (>750m)";
      };

      result = {
        score: result.score,
        reasons: result.reasons,
        next_steps: result.next_steps,
        data_timestamp: result.data_timestamp,
        nearest_substations: nearestSubstations,
        traffic_aadf: liveAadf,
        traffic_count_points: trafficData.length,
        nearby_bus_stops: busStops,
        nearby_rail_stations: railStations,
        nearby_transport_nodes: (naptanNodes || []).length,
        distance_bands: {
          primary: distanceBand(distances.primary_m),
          feeder: distanceBand(distances.feeder_m),
          capacity_segment: distanceBand(distances.capacity_segment_m),
        },
        capacity_indicator: result.constraints?.capacity_flag || "unknown",
      };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
