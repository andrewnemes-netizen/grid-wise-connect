import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * DNO Open Data Feed — Scaffold
 *
 * Provides a unified interface for querying DNO capacity and headroom data
 * from public APIs. Currently supports:
 *  - UKPN: Open Data portal (capacity headroom)
 *  - WPD/NGED: Network capacity map API
 *  - SSEN: Connected data portal
 *
 * This is a scaffold — real API endpoints will be added as DNOs publish
 * stable API versions.
 *
 * Usage:
 *   POST /dno-capacity-lookup
 *   Body: { dno: "UKPN", lat: 51.5, lng: -0.1, radius_m: 2000 }
 */

interface DnoLookupRequest {
  dno: string;
  lat: number;
  lng: number;
  radius_m?: number;
}

// Supported DNO endpoints (placeholder URLs — replace with real when available)
const DNO_ENDPOINTS: Record<string, { name: string; api_url: string | null; status: "live" | "planned" }> = {
  UKPN: {
    name: "UK Power Networks",
    api_url: null, // UKPN Open Data API URL when available
    status: "planned",
  },
  NGED: {
    name: "National Grid Electricity Distribution",
    api_url: null,
    status: "planned",
  },
  SSEN: {
    name: "Scottish & Southern Electricity Networks",
    api_url: null,
    status: "planned",
  },
  SPEN: {
    name: "SP Energy Networks",
    api_url: null,
    status: "planned",
  },
  NPG: {
    name: "Northern Powergrid",
    api_url: null,
    status: "planned",
  },
  ENWL: {
    name: "Electricity North West",
    api_url: null,
    status: "planned",
  },
};

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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "POST required" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: DnoLookupRequest = await req.json();
    const { dno, lat, lng, radius_m = 2000 } = body;

    if (!dno || !lat || !lng) {
      return new Response(
        JSON.stringify({ error: "dno, lat, lng are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dnoConfig = DNO_ENDPOINTS[dno.toUpperCase()];
    if (!dnoConfig) {
      return new Response(
        JSON.stringify({
          error: `Unknown DNO: ${dno}`,
          supported_dnos: Object.keys(DNO_ENDPOINTS),
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (dnoConfig.status === "planned" || !dnoConfig.api_url) {
      // Return scaffold response with metadata
      return new Response(
        JSON.stringify({
          dno: dno.toUpperCase(),
          dno_name: dnoConfig.name,
          status: "scaffold",
          message: `${dnoConfig.name} API integration is planned but not yet connected. Using local data only.`,
          query: { lat, lng, radius_m },
          substations: [],
          capacity_data: null,
          data_source: "local_db",
          last_updated: null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // When live APIs are connected, the real fetch logic goes here
    // const apiRes = await fetch(dnoConfig.api_url + ...);
    // const data = await apiRes.json();
    // return transformed response

    return new Response(
      JSON.stringify({ error: "Not implemented" }),
      { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("DNO capacity lookup error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
