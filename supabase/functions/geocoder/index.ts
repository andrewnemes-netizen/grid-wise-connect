import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OS_NAMES_KEY = Deno.env.get("OS_API_KEY") ?? "";

/**
 * Unified Gridwise Geocoder
 *
 * Merges OS Names API (gazetteer/place search) and OS Places API (address/postcode)
 * into one endpoint with a standardised response schema.
 *
 * Usage:
 *   GET /geocoder?q=Manchester
 *   GET /geocoder?q=SW1A+1AA
 *   GET /geocoder?q=10+Downing+Street&source=places
 *   GET /geocoder?q=SW1A+1AA&source=names
 *
 * Query params:
 *   q         - search query (required)
 *   source    - "names" | "places" | "auto" (default: "auto")
 *   limit     - max results (default: 8)
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth ──
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
    const query = url.searchParams.get("q")?.trim();
    const source = url.searchParams.get("source") || "auto";
    const limit = parseInt(url.searchParams.get("limit") || "8", 10);

    if (!query) {
      return new Response(
        JSON.stringify({ error: "q parameter required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Decide source ──
    // "auto" uses OS Names first (fast, good for places/postcodes), 
    // falls back to OS Places for address-level results
    const useNames = source === "names" || source === "auto";
    const usePlaces = source === "places";

    let results: GeocoderResult[] = [];

    if (useNames) {
      results = await searchOsNames(query, limit);
    }

    // If auto mode got no results from Names, try Places
    if (usePlaces || (source === "auto" && results.length === 0)) {
      const placesKey = Deno.env.get("OS_DATA_HUB_KEY");
      if (placesKey) {
        const placesResults = await searchOsPlaces(query, limit, placesKey);
        // Merge, deduplicating by proximity
        results = mergeResults(results, placesResults);
      }
    }

    return new Response(
      JSON.stringify({ query, source, total: results.length, results }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300", // 5 min cache
        },
      }
    );
  } catch (err: unknown) {
    console.error("Geocoder error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Standardised result schema ──
interface GeocoderResult {
  label: string;
  lat: number;
  lng: number;
  source: "os_names" | "os_places";
  confidence: "high" | "medium" | "low";
  type: string;
  uprn: string | null;
  classification: string | null;
  local_authority: string | null;
  postcode: string | null;
}

// ── BNG → WGS84 (Helmert 7-param) ──
function bngToWgs84(easting: number, northing: number): { lat: number; lng: number } {
  const a = 6377563.396;
  const b = 6356256.909;
  const e2 = 1 - (b * b) / (a * a);
  const N0 = -100000, E0 = 400000, F0 = 0.9996012717;
  const phi0 = (49 * Math.PI) / 180;
  const lambda0 = (-2 * Math.PI) / 180;
  const n = (a - b) / (a + b), n2 = n * n, n3 = n * n * n;

  let phi = ((northing - N0) / (a * F0)) + phi0;
  for (let i = 0; i < 10; i++) {
    const M = b * F0 *
      ((1 + n + (5/4)*n2 + (5/4)*n3) * (phi - phi0) -
       (3*n + 3*n2 + (21/8)*n3) * Math.sin(phi - phi0) * Math.cos(phi + phi0) +
       ((15/8)*n2 + (15/8)*n3) * Math.sin(2*(phi - phi0)) * Math.cos(2*(phi + phi0)) -
       (35/24)*n3 * Math.sin(3*(phi - phi0)) * Math.cos(3*(phi + phi0)));
    phi = ((northing - N0 - M) / (a * F0)) + phi;
    if (Math.abs(northing - N0 - M) < 0.001) break;
  }

  const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi), tanPhi = Math.tan(phi);
  const nu = a * F0 / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
  const eta2 = nu / rho - 1;
  const dE = easting - E0;

  const VII = tanPhi / (2 * rho * nu);
  const VIII = tanPhi / (24 * rho * nu**3) * (5 + 3*tanPhi**2 + eta2 - 9*tanPhi**2*eta2);
  const IX = tanPhi / (720 * rho * nu**5) * (61 + 90*tanPhi**2 + 45*tanPhi**4);
  const X = 1 / (cosPhi * nu);
  const XI = 1 / (6 * cosPhi * nu**3) * (nu/rho + 2*tanPhi**2);
  const XII = 1 / (120 * cosPhi * nu**5) * (5 + 28*tanPhi**2 + 24*tanPhi**4);

  const osgbLat = phi - VII*dE**2 + VIII*dE**4 - IX*dE**6;
  const osgbLng = lambda0 + X*dE - XI*dE**3 + XII*dE**5;

  const sinLat = Math.sin(osgbLat), cosLat = Math.cos(osgbLat);
  const sinLng = Math.sin(osgbLng), cosLng = Math.cos(osgbLng);
  const nuC = a / Math.sqrt(1 - e2 * sinLat**2);
  const x1 = nuC * cosLat * cosLng;
  const y1 = nuC * cosLat * sinLng;
  const z1 = nuC * (1 - e2) * sinLat;

  const tx=446.448, ty=-125.157, tz=542.060, s=-20.4894e-6;
  const rx=(0.1502/3600)*(Math.PI/180), ry=(0.2470/3600)*(Math.PI/180), rz=(0.8421/3600)*(Math.PI/180);

  const x2 = tx + (1+s)*x1 + (-rz)*y1 + ry*z1;
  const y2 = ty + rz*x1 + (1+s)*y1 + (-rx)*z1;
  const z2 = tz + (-ry)*x1 + rx*y1 + (1+s)*z1;

  const aW=6378137.0, bW=6356752.3142, e2W=1-(bW*bW)/(aW*aW);
  const p = Math.sqrt(x2*x2 + y2*y2);
  let lat = Math.atan2(z2, p*(1-e2W));
  for (let i=0; i<10; i++) {
    const nuW = aW / Math.sqrt(1 - e2W*Math.sin(lat)**2);
    lat = Math.atan2(z2 + e2W*nuW*Math.sin(lat), p);
  }
  return { lat: lat*(180/Math.PI), lng: Math.atan2(y2, x2)*(180/Math.PI) };
}

// ── Fetch with retry ──
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return res;
      if (i < retries - 1) await new Promise(r => setTimeout(r, 300 * (i + 1)));
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw new Error("Max retries reached");
}

// ── OS Names search ──
async function searchOsNames(query: string, limit: number): Promise<GeocoderResult[]> {
  const url = `https://api.os.uk/search/names/v1/find?query=${encodeURIComponent(query)}&maxresults=${limit}&key=${OS_NAMES_KEY}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) return [];
  const data = await res.json();

  return (data.results || []).map((r: any) => {
    const entry = r.GAZETTEER_ENTRY;
    if (!entry) return null;
    const { lat, lng } = bngToWgs84(entry.GEOMETRY_X, entry.GEOMETRY_Y);
    const localType = entry.LOCAL_TYPE || "";
    const county = entry.COUNTY_UNITARY || entry.REGION || "";
    const district = entry.DISTRICT_BOROUGH || "";
    const parts = [entry.NAME1];
    if (district && district !== entry.NAME1) parts.push(district);
    if (county && county !== district) parts.push(county);

    return {
      label: parts.join(", "),
      lat,
      lng,
      source: "os_names" as const,
      confidence: entry.MATCH ? "high" : "medium" as const,
      type: localType.toLowerCase(),
      uprn: null,
      classification: null,
      local_authority: county || null,
      postcode: entry.POSTCODE_DISTRICT || null,
    } satisfies GeocoderResult;
  }).filter(Boolean);
}

// ── OS Places search ──
async function searchOsPlaces(query: string, limit: number, apiKey: string): Promise<GeocoderResult[]> {
  const isPostcode = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(query);
  const endpoint = isPostcode
    ? `https://api.os.uk/search/places/v1/postcode?postcode=${encodeURIComponent(query)}&maxresults=${limit}&key=${apiKey}`
    : `https://api.os.uk/search/places/v1/find?query=${encodeURIComponent(query)}&maxresults=${limit}&key=${apiKey}`;

  const res = await fetchWithRetry(endpoint);
  if (!res.ok) return [];
  const data = await res.json();

  return (data.results || []).map((r: any) => {
    const dpa = r.DPA;
    if (!dpa) return null;
    return {
      label: dpa.ADDRESS,
      lat: dpa.LAT,
      lng: dpa.LNG,
      source: "os_places" as const,
      confidence: "high" as const,
      type: isPostcode ? "postcode" : "address",
      uprn: dpa.UPRN || null,
      classification: dpa.CLASSIFICATION_CODE || null,
      local_authority: dpa.LOCAL_CUSTODIAN_CODE_DESCRIPTION || null,
      postcode: dpa.POSTCODE || null,
    } satisfies GeocoderResult;
  }).filter(Boolean);
}

// ── Merge + deduplicate by proximity ──
function mergeResults(a: GeocoderResult[], b: GeocoderResult[]): GeocoderResult[] {
  const merged = [...a];
  for (const item of b) {
    const isDupe = merged.some(
      (existing) =>
        Math.abs(existing.lat - item.lat) < 0.001 &&
        Math.abs(existing.lng - item.lng) < 0.001
    );
    if (!isDupe) merged.push(item);
  }
  return merged;
}
