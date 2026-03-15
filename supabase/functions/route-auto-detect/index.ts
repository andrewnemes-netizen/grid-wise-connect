import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { route_coords, search_radius_m = 200 } = await req.json();

    if (!route_coords || route_coords.length < 2) {
      return new Response(JSON.stringify({ error: "route_coords must have at least 2 points" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Build route LineString WKT
    const coordsWkt = route_coords.map(([lng, lat]: [number, number]) => `${lng} ${lat}`).join(",");
    const routeLineWkt = `SRID=4326;LINESTRING(${coordsWkt})`;

    // ── 1. Cable Candidate Discovery ──
    // Find nearby cables from geo_cables within search radius
    const { data: nearbyCables, error: cablesError } = await supabase.rpc("route_nearby_cables", {
      route_wkt: routeLineWkt,
      radius_m: search_radius_m,
    });

    // ── 2. Surface Classification from highway_widths ──
    const { data: surfaceSegments, error: surfaceError } = await supabase.rpc("route_surface_classify", {
      route_wkt: routeLineWkt,
      buffer_m: 25,
    });

    // ── 3. Crossing Detection ──
    // Where does the route cross existing cables/feeders?
    const { data: crossings, error: crossingsError } = await supabase.rpc("route_crossing_detect", {
      route_wkt: routeLineWkt,
    });

    const result = {
      cable_candidates: nearbyCables || [],
      surface_segments: surfaceSegments || [],
      crossings: crossings || [],
      errors: [
        cablesError?.message,
        surfaceError?.message,
        crossingsError?.message,
      ].filter(Boolean),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
