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
    const { dataset, latitude, longitude, limit, geometry_relation } = await req.json();

    if (!dataset) {
      return new Response(
        JSON.stringify({ success: false, error: "dataset is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build query params
    const params = new URLSearchParams();
    params.set("dataset", dataset);
    params.set("limit", String(limit || 100));

    if (latitude != null && longitude != null) {
      params.set("latitude", String(latitude));
      params.set("longitude", String(longitude));
    }

    if (geometry_relation) {
      params.set("geometry_relation", geometry_relation);
    }

    const url = `${PLANNING_API}/entity.geojson?${params.toString()}`;
    console.log("Planning data lookup:", url);

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
