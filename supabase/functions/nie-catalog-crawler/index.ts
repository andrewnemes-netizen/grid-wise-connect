import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * NIE Networks Catalog Crawler
 *
 * Discovers datasets on the NIE Networks (Northern Ireland) Opendatasoft portal
 * using the Explore API v2.1 catalog endpoint.
 */

const BASE_URL = "https://nienetworks.opendatasoft.com/api/explore/v2.1";
const PORTAL_BASE = "https://nienetworks.opendatasoft.com/explore/dataset";
const DNO_KEY = "NIE";

interface CrawlResult {
  total_discovered: number;
  inserted: number;
  updated: number;
  errors: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await userClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const apiKey = body.api_key || Deno.env.get("NIE_API_KEY") || null;

    console.log("[crawler] Starting NIE catalog discovery...");

    // Paginate through catalog
    const allDatasets: any[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const url = `${BASE_URL}/catalog/datasets?limit=${limit}&offset=${offset}`;
      const resp = await fetchWithRetry(url, apiKey);
      const data = await resp.json();
      const results = data.results || [];
      allDatasets.push(...results);

      console.log(`[crawler] Fetched ${results.length} datasets at offset ${offset}, total so far: ${allDatasets.length}`);

      if (results.length < limit || allDatasets.length >= (data.total_count || 0)) break;
      offset += limit;
      await sleep(200);
    }

    console.log(`[crawler] Discovered ${allDatasets.length} total datasets`);

    const result: CrawlResult = {
      total_discovered: allDatasets.length,
      inserted: 0,
      updated: 0,
      errors: [],
    };

    for (const ds of allDatasets) {
      try {
        const entry = processDataset(ds);
        const { error: upsertErr } = await supabase
          .from("dno_dataset_registry")
          .upsert(entry, { onConflict: "dno,dataset_id" });

        if (upsertErr) {
          console.error(`[crawler] Upsert error for ${ds.dataset?.dataset_id}:`, upsertErr);
          result.errors.push(`${ds.dataset?.dataset_id}: ${upsertErr.message}`);
        } else {
          result.inserted++;
        }
      } catch (err) {
        const dsId = ds.dataset?.dataset_id || "unknown";
        console.error(`[crawler] Error processing ${dsId}:`, err);
        result.errors.push(`${dsId}: ${String(err)}`);
      }
    }

    await supabase.from("audit_log").insert({
      action: "nie_catalog_crawl",
      user_id: user.id,
      meta_json: {
        total_discovered: result.total_discovered,
        inserted: result.inserted,
        errors_count: result.errors.length,
      },
    });

    console.log(`[crawler] Done. Discovered: ${result.total_discovered}, Upserted: ${result.inserted}, Errors: ${result.errors.length}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[crawler] Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function processDataset(ds: any): Record<string, any> {
  const meta = ds.dataset || ds;
  const datasetId = meta.dataset_id;
  const metas = meta.metas?.default || {};
  const fields = meta.fields || [];

  const geoShapeField = fields.find((f: any) => f.type === "geo_shape");
  const geoPointField = fields.find((f: any) => f.type === "geo_point_2d");
  const geoField = geoShapeField || geoPointField;
  const isGeospatial = !!geoField;
  const geometryField = geoField?.name || null;
  const geometryType = geoField?.type === "geo_point_2d" ? "Point" :
    geoField?.type === "geo_shape" ? "Polygon" : null;

  const endpointBase = `${BASE_URL}/catalog/datasets/${datasetId}`;
  const exportBase = `${endpointBase}/exports`;

  const exportFormats: string[] = ["csv", "json", "geojson", "parquet", "xlsx", "shp"];

  const attachments = meta.attachments || [];
  const attachmentUrls = attachments.map((a: any) => ({
    title: a.title || a.metas?.title || "attachment",
    url: a.href || a.url || null,
    mimetype: a.metas?.mime_type || null,
  }));

  const pkGuess = guessPrimaryKey(fields);

  const fieldSummary = fields.map((f: any) => `${f.name}:${f.type}`).sort().join("|");
  const schemaHash = simpleHash(fieldSummary);

  let storageTable = "geo_points";
  if (!isGeospatial) {
    storageTable = "geo_points";
  } else if (geoShapeField && !geoPointField) {
    storageTable = "geo_polygons";
  } else if (geoShapeField && geoPointField) {
    storageTable = "geo_polygons";
  } else if (geometryType === "Point") {
    storageTable = "geo_substations";
  }

  return {
    dno: DNO_KEY,
    dataset_id: datasetId,
    title: metas.title || datasetId,
    description: metas.description || null,
    portal_url: `${PORTAL_BASE}/${datasetId}`,
    updated_at_source: metas.modified || metas.metadata_processed || null,
    is_geospatial: isGeospatial,
    geometry_field: geometryField,
    geometry_type: geometryType,
    fields_json: fields.map((f: any) => ({
      name: f.name,
      type: f.type,
      label: f.label || f.name,
      description: f.description || null,
    })),
    record_count: meta.metas?.default?.records_count || 0,
    endpoint_records: `${endpointBase}/records`,
    endpoint_metadata: endpointBase,
    endpoint_export_csv: `${exportBase}/csv`,
    endpoint_export_json: `${exportBase}/json`,
    endpoint_export_geojson: isGeospatial ? `${exportBase}/geojson` : null,
    endpoint_export_parquet: `${exportBase}/parquet`,
    attachment_urls: attachmentUrls,
    export_formats: exportFormats,
    primary_key_guess: pkGuess,
    storage_table: storageTable,
    schema_hash: schemaHash,
    updated_at: new Date().toISOString(),
  };
}

function guessPrimaryKey(fields: any[]): string | null {
  const pkCandidates = ["id", "asset_id", "site_id", "project_id", "circuit_id", "objectid", "fid"];
  for (const candidate of pkCandidates) {
    const match = fields.find((f: any) => f.name.toLowerCase() === candidate);
    if (match) return match.name;
  }
  const idField = fields.find((f: any) => f.name.toLowerCase().endsWith("_id"));
  if (idField) return idField.name;
  return null;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

async function fetchWithRetry(url: string, apiKey?: string | null, maxRetries = 3): Promise<Response> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["Authorization"] = `Apikey ${apiKey}`;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, { headers });
      if (resp.status === 429) {
        const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`[crawler] Rate limited, backing off ${Math.round(backoff)}ms`);
        await sleep(backoff);
        continue;
      }
      if (!resp.ok && attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 500;
        console.warn(`[crawler] HTTP ${resp.status}, retrying in ${backoff}ms`);
        await resp.text();
        await sleep(backoff);
        continue;
      }
      return resp;
    } catch (err) {
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 500;
        console.warn(`[crawler] Fetch error, retrying in ${backoff}ms:`, err);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
