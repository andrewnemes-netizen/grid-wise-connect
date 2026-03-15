const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLANNING_API = "https://www.planning.data.gov.uk";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dataset, latitude, longitude, bbox, limit, geometry_relation } = await req.json();

    if (!dataset) {
      return new Response(
        JSON.stringify({ success: false, error: "dataset is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const params = new URLSearchParams();
    params.set("dataset", dataset);
    params.set("limit", String(limit || 100));
    params.set("geometry_relation", geometry_relation || "intersects");

    // Prefer bbox (WKT polygon) over point query for reliable intersection
    if (bbox) {
      // bbox = [west, south, east, north]
      const [w, s, e, n] = bbox;
      const wkt = `POLYGON((${w} ${s},${e} ${s},${e} ${n},${w} ${n},${w} ${s}))`;
      params.set("geometry", wkt);
      console.log(`Planning data lookup: dataset=${dataset}, bbox WKT`);
    } else if (latitude != null && longitude != null) {
      // Fallback: create a small bbox around the point (~2km)
      const buffer = 0.02;
      const w = longitude - buffer;
      const e = longitude + buffer;
      const s = latitude - buffer;
      const n = latitude + buffer;
      const wkt = `POLYGON((${w} ${s},${e} ${s},${e} ${n},${w} ${n},${w} ${s}))`;
      params.set("geometry", wkt);
      console.log(`Planning data lookup: dataset=${dataset}, point-buffered WKT around ${latitude},${longitude}`);
    }

    const url = `${PLANNING_API}/entity.geojson?${params.toString()}`;
    console.log("Planning URL:", url);

    const response = await fetch(url, {
      headers: { Accept: "application/geo+json, application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Planning API error:", response.status, text);
      return new Response(
        JSON.stringify({ success: false, error: `Planning API returned ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    console.log(`Planning data: ${data?.features?.length || 0} features for ${dataset}`);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in planning-data-lookup:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
