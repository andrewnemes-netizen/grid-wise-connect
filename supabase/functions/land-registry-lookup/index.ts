import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BASE_URL = 'https://use-land-property-data.service.gov.uk/api/v1';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LAND_REGISTRY_API_KEY = Deno.env.get('LAND_REGISTRY_API_KEY');
    if (!LAND_REGISTRY_API_KEY) {
      throw new Error('LAND_REGISTRY_API_KEY is not configured');
    }

    // Validate JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { action, dataset_name, file_name } = await req.json();

    let url: string;
    switch (action) {
      case 'list_datasets':
        url = `${BASE_URL}/datasets`;
        break;

      case 'dataset_info':
        if (!dataset_name) throw new Error('dataset_name is required');
        url = `${BASE_URL}/datasets/${encodeURIComponent(dataset_name)}`;
        break;

      case 'download_file':
        if (!dataset_name || !file_name) throw new Error('dataset_name and file_name are required');
        url = `${BASE_URL}/datasets/${encodeURIComponent(dataset_name)}/${encodeURIComponent(file_name)}`;
        break;

      default:
        throw new Error(`Unknown action: ${action}. Valid actions: list_datasets, dataset_info, download_file`);
    }

    console.log(`Land Registry API request: ${action} -> ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': LAND_REGISTRY_API_KEY,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Land Registry API error [${response.status}]: ${errorText}`);
      return new Response(JSON.stringify({
        error: `Land Registry API returned ${response.status}`,
        details: errorText,
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // For download_file, the response may contain a download_url redirect
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Land Registry lookup error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
