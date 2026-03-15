import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const WMS_BASE = "https://inspire.landregistry.gov.uk/inspire/wms";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // Forward all query params to the WMS endpoint
    const wmsUrl = `${WMS_BASE}?${url.searchParams.toString()}`;

    console.log(`Proxying WMS request: ${wmsUrl}`);

    const response = await fetch(wmsUrl, {
      headers: { 'Accept': 'image/png,*/*' },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`WMS error [${response.status}]: ${text}`);
      return new Response(text, {
        status: response.status,
        headers: corsHeaders,
      });
    }

    const body = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    // If the WMS returned XML error instead of image, pass it through
    if (contentType.includes('xml') || contentType.includes('text')) {
      const text = new TextDecoder().decode(body);
      console.error(`WMS returned non-image: ${text.substring(0, 500)}`);
      return new Response(text, {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': contentType },
      });
    }

    return new Response(body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('WMS proxy error:', error);
    return new Response('Proxy error', {
      status: 500,
      headers: corsHeaders,
    });
  }
});
