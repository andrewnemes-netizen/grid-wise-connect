import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * OS Places Lookup Edge Function
 *
 * Provides postcode and address geocoding via the OS Data Hub Places API.
 * Requires OS_DATA_HUB_KEY secret.
 *
 * Usage:
 *   GET /os-places-lookup?postcode=SW1A+1AA
 *   GET /os-places-lookup?query=10+Downing+Street
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth check ──
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
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("OS_DATA_HUB_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OS_DATA_HUB_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const postcode = url.searchParams.get("postcode");
    const query = url.searchParams.get("query");
    const maxResults = url.searchParams.get("maxresults") || "10";

    let apiUrl: string;

    if (postcode) {
      // Postcode lookup — returns addresses at a postcode
      apiUrl = `https://api.os.uk/search/places/v1/postcode?postcode=${encodeURIComponent(postcode)}&maxresults=${maxResults}&key=${apiKey}`;
    } else if (query) {
      // Free-text search
      apiUrl = `https://api.os.uk/search/places/v1/find?query=${encodeURIComponent(query)}&maxresults=${maxResults}&key=${apiKey}`;
    } else {
      return new Response(
        JSON.stringify({ error: "Provide ?postcode= or ?query= parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch(apiUrl);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OS Places API error [${res.status}]: ${body}`);
    }

    const data = await res.json();

    // Transform to simplified response
    const results = (data.results || []).map((r: any) => {
      const dpa = r.DPA;
      if (!dpa) return null;
      return {
        uprn: dpa.UPRN,
        address: dpa.ADDRESS,
        postcode: dpa.POSTCODE,
        building_name: dpa.BUILDING_NAME || null,
        building_number: dpa.BUILDING_NUMBER || null,
        street: dpa.THOROUGHFARE_NAME || null,
        town: dpa.POST_TOWN || null,
        local_authority: dpa.LOCAL_CUSTODIAN_CODE_DESCRIPTION || null,
        lng: dpa.LNG,
        lat: dpa.LAT,
        classification: dpa.CLASSIFICATION_CODE || null,
        classification_desc: dpa.CLASSIFICATION_CODE_DESCRIPTION || null,
      };
    }).filter(Boolean);

    return new Response(
      JSON.stringify({
        total: data.header?.totalresults || results.length,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("OS Places error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
