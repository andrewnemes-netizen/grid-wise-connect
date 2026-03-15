const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TILES_BASE = "https://tiles.planning.data.gov.uk";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    const fnIndex = parts.indexOf("planning-vector-tile");

    if (fnIndex < 0 || parts.length < fnIndex + 5) {
      return new Response(JSON.stringify({ error: "Expected /{dataset}/{z}/{x}/{y}.pbf" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dataset = decodeURIComponent(parts[fnIndex + 1]);
    const z = parts[fnIndex + 2];
    const x = parts[fnIndex + 3];
    const y = parts[fnIndex + 4];

    if (!/^[a-z0-9-]+$/.test(dataset) || !/^\d+$/.test(z) || !/^\d+$/.test(x) || !/^\d+\.pbf$/.test(y)) {
      return new Response(JSON.stringify({ error: "Invalid tile path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const upstreamUrl = `${TILES_BASE}/${dataset}/${z}/${x}/${y}`;
    const upstreamRes = await fetch(upstreamUrl, {
      headers: { "Accept-Encoding": "gzip" },
    });

    if (!upstreamRes.ok) {
      return new Response(JSON.stringify({ error: `Upstream ${upstreamRes.status}` }), {
        status: upstreamRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await upstreamRes.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": upstreamRes.headers.get("content-type") || "application/x-protobuf",
        "Content-Encoding": upstreamRes.headers.get("content-encoding") || "gzip",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
