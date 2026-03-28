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

    // Custom fetch with 30s abort so the edge function doesn't hit the wall-clock limit
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

    // Score the site — use a service-role client that bypasses the default 8s PostgREST timeout
    // by going directly via the REST endpoint with a long-lived abort controller
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

    // ── Traffic AADF + NaPTAN queries (fire in parallel with substation search) ──
    const trafficPromise = fetch(
      `${supabaseUrl}/rest/v1/rpc/nearby_geo_points_by_slug`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` },
        body: JSON.stringify({ p_slug: "dft_traffic_count_points", p_lng: lng, p_lat: lat, p_radius_m: 1000, p_limit: 20 }),
        signal: AbortSignal.timeout(15000),
      }
    ).then(r => r.ok ? r.json() : []).catch(() => []);

    const naptanPromise = fetch(
      `${supabaseUrl}/rest/v1/rpc/nearby_geo_points_by_slug`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` },
        body: JSON.stringify({ p_slug: "naptan_transport_nodes", p_lng: lng, p_lat: lat, p_radius_m: 500, p_limit: 50 }),
        signal: AbortSignal.timeout(15000),
      }
    ).then(r => r.ok ? r.json() : []).catch(() => []);

    // Adaptive radius search for nearest substations: 2km → 5km → 10km
    // Also via direct fetch to bypass the 8s PostgREST statement timeout
    let substations: any[] = [];
    const radii = [0.02, 0.05, 0.1]; // ~2km, ~5km, ~10km

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

      if (substations.length > 0) break; // Found results, stop expanding
    }

    // Map substations to response format
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

    // Check user roles for output filtering — lightweight query, Supabase client is fine here
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const userRoles = (roles || []).map((r: { role: string }) => r.role);
    const isInternal = userRoles.includes("admin") || userRoles.includes("engineer");

    let result = scoreData;

    // Add nearest_substations to the result for all users
    result = { ...result, nearest_substations: nearestSubstations };

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
