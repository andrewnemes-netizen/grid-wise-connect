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
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    // Score the site
    const { data: scoreData, error: scoreError } = await supabase.rpc("score_site_from_lnglat", {
      _lng: lng,
      _lat: lat,
      _proposed_kw: proposed_kw || 0,
    });

    if (scoreError) {
      console.error("Score error:", scoreError);
      return new Response(JSON.stringify({ error: scoreError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch nearest substations (ranked by distance)
    const offset = 0.02; // ~2km radius
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

    const { data: substations, error: subError } = await supabase.rpc("search_substations_in_polygon", {
      _geojson: JSON.stringify(searchPolygon),
      _limit: 10,
    });

    if (subError) {
      console.error("Substation search error:", subError);
    }

    // Map substations to response format
    const nearestSubstations = (substations || []).map((s: any) => ({
      site_name: s.site_name,
      site_id: s.site_id,
      utilisation_pct: s.utilisation_pct,
      firm_capacity_kw: s.firm_capacity_kw,
      max_demand_kw: s.max_demand_kw,
      transformer_headroom_kw: s.transformer_headroom_kw,
      headroom_band: s.headroom_band,
      utilisation_band: s.utilisation_band,
    }));

    // Check user roles for output filtering
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
