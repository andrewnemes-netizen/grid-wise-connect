import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * NGED Catalog Crawler
 *
 * Discovers datasets on the NGED Connected Data portal (CKAN-based)
 * using the CKAN Action API v3.
 */

const CKAN_BASE = "https://connecteddata.nationalgrid.co.uk";
const API_BASE = `${CKAN_BASE}/api/3/action`;
const DNO_KEY = "NGED";

interface CrawlResult {
  total_discovered: number;
  inserted: number;
  updated: number;
  skipped: number;
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

    // Auth check
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

    const ngedApiKey = Deno.env.get("NGED_API_KEY") || null;

    console.log("[nged-crawler] Starting NGED CKAN catalog discovery...");

    // Step 1: Get all package names
    const listResp = await fetchCkan(`${API_BASE}/package_list`, ngedApiKey);
    const listData = await listResp.json();
    if (!listData.success) throw new Error("package_list failed");
    
    const packageNames: string[] = listData.result;
    console.log(`[nged-crawler] Found ${packageNames.length} packages`);

    const result: CrawlResult = {
      total_discovered: packageNames.length,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    // Step 2: Fetch each package's metadata
    for (let i = 0; i < packageNames.length; i++) {
      const pkgName = packageNames[i];
      try {
        const pkgResp = await fetchCkan(`${API_BASE}/package_show?id=${pkgName}`, ngedApiKey);
        const pkgData = await pkgResp.json();
        
        if (!pkgData.success) {
          result.errors.push(`${pkgName}: package_show failed`);
          continue;
        }

        const entry = processPackage(pkgData.result);
        const { error: upsertErr } = await supabase
          .from("dno_dataset_registry")
          .upsert(entry, { onConflict: "dno,dataset_id" });

        if (upsertErr) {
          console.error(`[nged-crawler] Upsert error for ${pkgName}:`, upsertErr);
          result.errors.push(`${pkgName}: ${upsertErr.message}`);
        } else {
          result.inserted++;
        }

        // Rate limit: small delay every 5 requests
        if (i > 0 && i % 5 === 0) {
          await sleep(300);
        }
      } catch (err) {
        console.error(`[nged-crawler] Error processing ${pkgName}:`, err);
        result.errors.push(`${pkgName}: ${String(err)}`);
      }
    }

    // Audit log
    await supabase.from("audit_log").insert({
      action: "nged_catalog_crawl",
      user_id: user.id,
      meta_json: {
        total_discovered: result.total_discovered,
        inserted: result.inserted,
        errors_count: result.errors.length,
      },
    });

    console.log(`[nged-crawler] Done. Discovered: ${result.total_discovered}, Upserted: ${result.inserted}, Errors: ${result.errors.length}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[nged-crawler] Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function processPackage(pkg: any): Record<string, any> {
  const datasetId = pkg.name; // CKAN slug
  const resources = pkg.resources || [];
  
  // Find the primary data resource (prefer CSV with datastore, then GeoJSON/SHP)
  const datastoreResource = resources.find((r: any) => r.datastore_active && r.format?.toUpperCase() === "CSV");
  const csvResource = resources.find((r: any) => r.format?.toUpperCase() === "CSV");
  const geojsonResource = resources.find((r: any) => r.format?.toUpperCase() === "GEOJSON");
  const shpResource = resources.find((r: any) => 
    r.format?.toUpperCase() === "SHP" || r.format?.toUpperCase() === "SHAPEFILE"
  );
  const primaryResource = datastoreResource || csvResource || geojsonResource || shpResource;

  // Determine if geospatial based on package name patterns
  const geoPatterns = [
    /ohl|overhead/i, /ug\b|underground/i, /pole/i, /tower/i,
    /substation/i, /transformer/i, /cable/i, /gm\b/i,
    /feeder/i, /spatial/i, /location.*easting/i, /132kv|66kv|33kv|11kv/i,
  ];
  const isGeospatialByName = geoPatterns.some(p => p.test(datasetId) || p.test(pkg.title || ""));
  const hasGeoResource = !!geojsonResource || !!shpResource;
  const isGeospatial = isGeospatialByName || hasGeoResource;

  // Determine geometry type from name
  let geometryType: string | null = null;
  let geometryField: string | null = null;
  if (isGeospatial) {
    if (/ohl|overhead|ug\b|underground|cable|feeder/i.test(datasetId)) {
      geometryType = "LineString";
    } else if (/pole|tower|substation|transformer|location.*easting/i.test(datasetId)) {
      geometryType = "Point";
    } else if (/boundary|area|region|polygon/i.test(datasetId)) {
      geometryType = "Polygon";
    } else {
      geometryType = "Point"; // default for geospatial
    }
    geometryField = "geo_shape"; // placeholder
  }

  // Build storage table mapping
  let storageTable = "geo_points";
  if (!isGeospatial) {
    storageTable = "geo_points"; // tabular data still goes here as fallback
  } else if (geometryType === "LineString") {
    storageTable = "geo_cables";
  } else if (geometryType === "Polygon") {
    storageTable = "geo_polygons";
  } else if (/substation|transformer/i.test(datasetId)) {
    storageTable = "geo_substations";
  }

  // Build endpoint URLs
  const portalUrl = `${CKAN_BASE}/dataset/${datasetId}`;
  const resourceId = primaryResource?.id || null;
  const endpointRecords = resourceId 
    ? `${API_BASE}/datastore_search?resource_id=${resourceId}` 
    : null;
  const endpointMetadata = `${API_BASE}/package_show?id=${datasetId}`;

  // Export URLs
  const endpointExportCsv = csvResource?.url || (resourceId 
    ? `${CKAN_BASE}/datastore/dump/${resourceId}?format=csv`
    : null);
  const endpointExportJson = resourceId
    ? `${CKAN_BASE}/datastore/dump/${resourceId}?format=json`
    : null;
  const endpointExportGeojson = geojsonResource?.url || null;

  // Fields from datastore
  const fieldsJson: any[] = [];
  
  // Export formats available
  const exportFormats: string[] = [];
  const formatSet = new Set(resources.map((r: any) => r.format?.toUpperCase()).filter(Boolean));
  if (formatSet.has("CSV")) exportFormats.push("csv");
  if (formatSet.has("GEOJSON")) exportFormats.push("geojson");
  if (formatSet.has("SHP") || formatSet.has("SHAPEFILE")) exportFormats.push("shp");
  if (formatSet.has("JSON")) exportFormats.push("json");
  if (formatSet.has("XLSX") || formatSet.has("XLS")) exportFormats.push("xlsx");
  if (formatSet.has("PDF")) exportFormats.push("pdf");

  // Attachments (non-data resources like PDFs)
  const attachmentUrls = resources
    .filter((r: any) => r.format?.toUpperCase() === "PDF")
    .map((r: any) => ({
      title: r.name || r.description || "attachment",
      url: r.url,
      mimetype: r.mimetype || "application/pdf",
    }));

  // Record count estimate
  const recordCount = primaryResource?.size 
    ? Math.round(primaryResource.size / 200) // rough estimate from file size
    : 0;

  // Schema hash from resource list
  const schemaHash = simpleHash(
    resources.map((r: any) => `${r.id}:${r.format}:${r.last_modified}`).join("|")
  );

  // Primary key guess
  const pkGuess = /substation/i.test(datasetId) ? "substation_id" :
    /transformer/i.test(datasetId) ? "transformer_id" :
    /pole|tower/i.test(datasetId) ? "asset_id" : null;

  return {
    dno: DNO_KEY,
    dataset_id: datasetId,
    title: pkg.title || datasetId,
    description: pkg.notes || null,
    portal_url: portalUrl,
    updated_at_source: pkg.metadata_modified || null,
    is_geospatial: isGeospatial,
    geometry_field: geometryField,
    geometry_type: geometryType,
    fields_json: fieldsJson,
    record_count: recordCount,
    endpoint_records: endpointRecords,
    endpoint_metadata: endpointMetadata,
    endpoint_export_csv: endpointExportCsv,
    endpoint_export_json: endpointExportJson,
    endpoint_export_geojson: endpointExportGeojson,
    endpoint_export_parquet: null, // CKAN doesn't typically offer parquet
    attachment_urls: attachmentUrls,
    export_formats: exportFormats,
    primary_key_guess: pkGuess,
    storage_table: storageTable,
    schema_hash: schemaHash,
    updated_at: new Date().toISOString(),
  };
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

async function fetchCkan(url: string, apiKey?: string | null, maxRetries = 3): Promise<Response> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["Authorization"] = apiKey;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, { headers });
      if (resp.status === 429) {
        const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`[nged-crawler] Rate limited, backing off ${Math.round(backoff)}ms`);
        await sleep(backoff);
        continue;
      }
      if (!resp.ok && attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 500;
        console.warn(`[nged-crawler] HTTP ${resp.status} for ${url}, retrying in ${backoff}ms`);
        await resp.text();
        await sleep(backoff);
        continue;
      }
      return resp;
    } catch (err) {
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 500;
        console.warn(`[nged-crawler] Fetch error, retrying in ${backoff}ms:`, err);
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
