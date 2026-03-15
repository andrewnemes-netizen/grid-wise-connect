import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OS_API_KEY = "j7vwIPqoPOj5tiwNsJGlQ1SDD2GpsehD";

/**
 * OS Features API (WFS) Proxy
 *
 * Queries OS Features API and returns GeoJSON for map overlay display.
 *
 * Usage:
 *   GET /os-features-proxy?typeName=Zoomstack_RailwayStations&bbox=-0.5,51.3,0.3,51.7
 *   GET /os-features-proxy?typeName=Zoomstack_Boundaries&bbox=-0.5,51.3,0.3,51.7
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const typeName = url.searchParams.get("typeName");
    const bbox = url.searchParams.get("bbox");
    const count = url.searchParams.get("count") || "500";

    if (!typeName) {
      return new Response(
        JSON.stringify({ error: "typeName parameter required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build WFS GetFeature request
    const params = new URLSearchParams({
      service: "wfs",
      version: "2.0.0",
      request: "GetFeature",
      typeNames: typeName,
      outputFormat: "GEOJSON",
      srsName: "urn:ogc:def:crs:EPSG::4326",
      count,
      key: OS_API_KEY,
    });

    if (bbox) {
      // WFS expects bbox as minLat,minLng,maxLat,maxLng for EPSG:4326
      const [minLng, minLat, maxLng, maxLat] = bbox.split(",").map(Number);
      params.set("bbox", `${minLat},${minLng},${maxLat},${maxLng}`);
    }

    const wfsUrl = `https://api.os.uk/features/v1/wfs?${params.toString()}`;
    const res = await fetch(wfsUrl);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OS Features API error [${res.status}]: ${body}`);
    }

    const contentType = res.headers.get("content-type") || "";
    
    // WFS might return XML error even with 200
    if (contentType.includes("xml")) {
      const body = await res.text();
      throw new Error(`OS Features returned XML (likely error): ${body.substring(0, 500)}`);
    }

    const geojson = await res.json();

    return new Response(
      JSON.stringify(geojson),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("OS Features proxy error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
