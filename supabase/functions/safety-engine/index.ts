import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * AI Safety Engine
 *
 * Analyses a site location for safety risks by combining:
 *  - STATS19 accident history within radius
 *  - DfT traffic count data within radius
 *  - Transport node proximity (bus stops, rail stations)
 *  - Grid connection context
 *
 * Returns AI-generated risk assessment with scores and recommendations.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { lat, lng, radius_m = 500, site_name = "Site" } = body;

    if (!lat || !lng) {
      return new Response(JSON.stringify({ error: "lat and lng required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Gather nearby STATS19 accidents
    const { data: accidents } = await serviceClient.rpc("nearby_geo_points_by_slug", {
      p_slug: "stats19_accidents",
      p_lng: lng,
      p_lat: lat,
      p_radius_m: radius_m,
      p_limit: 200,
    });

    // 2. Gather nearby traffic count points
    const { data: trafficPoints } = await serviceClient.rpc("nearby_geo_points_by_slug", {
      p_slug: "dft_traffic_count_points",
      p_lng: lng,
      p_lat: lat,
      p_radius_m: radius_m * 2, // wider search for traffic
      p_limit: 20,
    });

    // 3. Gather nearby transport nodes
    const { data: transportNodes } = await serviceClient.rpc("nearby_geo_points_by_slug", {
      p_slug: "naptan_transport_nodes",
      p_lng: lng,
      p_lat: lat,
      p_radius_m: radius_m,
      p_limit: 50,
    });

    // Build context summary
    const accidentList = (accidents || []).map((a: any) => ({
      severity: a.attrs_json?.severity || "Unknown",
      date: a.attrs_json?.date,
      speed_limit: a.attrs_json?.speed_limit,
      light_conditions: a.attrs_json?.light_conditions,
      road_surface: a.attrs_json?.road_surface,
      casualties: a.attrs_json?.number_of_casualties,
    }));

    const fatalCount = accidentList.filter((a: any) => a.severity === "Fatal").length;
    const seriousCount = accidentList.filter((a: any) => a.severity === "Serious").length;
    const slightCount = accidentList.filter((a: any) => a.severity === "Slight").length;

    const trafficSummary = (trafficPoints || []).map((t: any) => ({
      road_name: t.attrs_json?.road_name || t.name,
      all_motor_vehicles: t.attrs_json?.all_motor_vehicles,
      road_category: t.attrs_json?.road_category,
    }));

    const maxTrafficFlow = Math.max(0, ...trafficSummary.map((t: any) => t.all_motor_vehicles || 0));

    const transportSummary = (transportNodes || []).map((n: any) => ({
      name: n.name,
      type: n.attrs_json?.node_type || n.attrs_json?.stop_type,
    }));

    const busStops = transportSummary.filter((n: any) => n.type === "bus" || n.type === "BCT").length;
    const railStations = transportSummary.filter((n: any) => n.type === "rail" || n.type === "RLY").length;

    // Build deterministic safety scores first
    const accidentScore = Math.min(100, (fatalCount * 30 + seriousCount * 10 + slightCount * 3));
    const trafficScore = maxTrafficFlow > 30000 ? 80 : maxTrafficFlow > 15000 ? 60 : maxTrafficFlow > 5000 ? 40 : 20;
    const pedestrianExposure = Math.min(100, (busStops * 5 + railStations * 15));

    const overallRisk = Math.round(accidentScore * 0.45 + trafficScore * 0.30 + pedestrianExposure * 0.25);
    const riskLevel = overallRisk >= 70 ? "HIGH" : overallRisk >= 40 ? "MEDIUM" : "LOW";
    const recommendation = overallRisk >= 70 ? "MODIFY" : overallRisk >= 40 ? "PROCEED_WITH_CAUTION" : "SAFE";

    const deterministicResult = {
      risk_score: overallRisk,
      risk_level: riskLevel,
      recommendation,
      accident_summary: {
        total: accidentList.length,
        fatal: fatalCount,
        serious: seriousCount,
        slight: slightCount,
        radius_m: radius_m,
      },
      traffic_summary: {
        count_points_nearby: trafficSummary.length,
        max_aadf: maxTrafficFlow,
      },
      transport_summary: {
        bus_stops: busStops,
        rail_stations: railStations,
        total_nodes: transportSummary.length,
      },
      sub_scores: {
        accident_risk: accidentScore,
        traffic_risk: trafficScore,
        pedestrian_exposure: pedestrianExposure,
      },
    };

    // If Lovable AI is available, enhance with AI narrative
    let aiNarrative: string | null = null;
    if (lovableApiKey) {
      try {
        const prompt = `You are a UK road safety and EV infrastructure analyst. Analyse this site for EV charger installation safety.

Site: ${site_name} (${lat}, ${lng})
Search radius: ${radius_m}m

ACCIDENT DATA (last 5 years within radius):
- Fatal: ${fatalCount}
- Serious: ${seriousCount}  
- Slight: ${slightCount}
- Total: ${accidentList.length}

TRAFFIC DATA:
- Nearby count points: ${trafficSummary.length}
- Max AADF (all motor vehicles): ${maxTrafficFlow}
- Roads: ${trafficSummary.slice(0, 5).map((t: any) => `${t.road_name} (${t.all_motor_vehicles} AADF)`).join(", ") || "None nearby"}

TRANSPORT NODES:
- Bus stops within ${radius_m}m: ${busStops}
- Rail stations within ${radius_m}m: ${railStations}

COMPUTED RISK SCORE: ${overallRisk}/100 (${riskLevel})

Provide a concise safety assessment covering:
1. Cyclist risk (LOW/MEDIUM/HIGH + reason)
2. Pedestrian risk (LOW/MEDIUM/HIGH + reason)  
3. Traffic impact assessment
4. Key safety considerations for EV charger installation
5. Mitigation measures if needed

Keep it under 200 words, professional tone, specific to this location's data.`;

        const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: "You are a professional UK road safety analyst specializing in EV infrastructure deployment." },
              { role: "user", content: prompt },
            ],
            stream: false,
          }),
        });

        if (aiResp.ok) {
          const aiJson = await aiResp.json();
          aiNarrative = aiJson.choices?.[0]?.message?.content || null;
        } else {
          const errText = await aiResp.text();
          console.error("AI gateway error:", aiResp.status, errText);
        }
      } catch (aiErr) {
        console.error("AI narrative error:", aiErr);
      }
    }

    return new Response(
      JSON.stringify({
        ...deterministicResult,
        ai_narrative: aiNarrative,
        site: { name: site_name, lat, lng },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Safety engine error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
