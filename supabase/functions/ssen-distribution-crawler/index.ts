import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * SSEN Distribution Catalog Crawler
 *
 * Discovers every dataset on the SSEN Distribution open data portal
 * (data.ssen.co.uk — Datopian Portal.js on top of CKAN at
 * data-api.ssen.co.uk) using the standard CKAN Action API and upserts
 * records into dno_dataset_registry under DNO key "SSEN".
 *
 * Distribution dataset_ids are prefixed "dx-" so they don't collide with
 * the Transmission slugs produced by ssen-catalog-crawler.
 */

const CKAN_API = "https://data-api.ssen.co.uk/api/3/action";
const PORTAL_BASE = "https://data.ssen.co.uk/@ssen-distribution";
const DNO_KEY = "SSEN";
const PREFIX = "dx-"; // distribution prefix (transmission rows are unprefixed)
const UA = "Mozilla/5.0 (compatible; GridwiseConnect-Crawler/1.0; +https://grid-wise-connect.lovable.app)";

interface CrawlResult {
  total_discovered: number;
  inserted: number;
  updated: number;
  errors: string[];
}

interface CkanResource {
  id: string;
  name?: string;
  description?: string;
  format?: string;
  url?: string;
  mimetype?: string;
  size?: number;
  last_modified?: string;
}

interface CkanPackage {
  id: string;
  name: string; // slug
  title?: string;
  notes?: string; // description
  organization?: { name?: string; title?: string };
  resources?: CkanResource[];
  tags?: Array<{ name: string }>;
  groups?: Array<{ name: string; title?: string }>;
  metadata_modified?: string;
  last_data_update?: string;
  frequency?: string;
  license_id?: string;
  license_title?: string;
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
    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[ssen-dx] Starting SSEN Distribution catalog discovery...");

    const allPackages: CkanPackage[] = [];
    const pageSize = 100;
    let start = 0;
    let total = 0;

    while (true) {
      const url = `${CKAN_API}/package_search?rows=${pageSize}&start=${start}`;
      const resp = await fetchWithRetry(url);
      const data = await resp.json();
      if (!data?.success) {
        throw new Error(`CKAN package_search failed: ${JSON.stringify(data).slice(0, 300)}`);
      }
      total = data.result?.count ?? 0;
      const batch: CkanPackage[] = data.result?.results ?? [];
      allPackages.push(...batch);
      console.log(`[ssen-dx] start=${start} got=${batch.length} total=${total} accumulated=${allPackages.length}`);
      if (batch.length < pageSize || allPackages.length >= total) break;
      start += pageSize;
      await sleep(200);
    }

    console.log(`[ssen-dx] Discovered ${allPackages.length} packages (CKAN reports total=${total})`);

    const result: CrawlResult = {
      total_discovered: allPackages.length,
      inserted: 0,
      updated: 0,
      errors: [],
    };

    for (const pkg of allPackages) {
      try {
        const entry = processPackage(pkg);
        const { error: upsertErr } = await supabase
          .from("dno_dataset_registry")
          .upsert(entry, { onConflict: "dno,dataset_id" });
        if (upsertErr) {
          console.error(`[ssen-dx] Upsert error for ${pkg.name}:`, upsertErr);
          result.errors.push(`${pkg.name}: ${upsertErr.message}`);
        } else {
          result.inserted++;
        }
      } catch (err) {
        console.error(`[ssen-dx] Error processing ${pkg.name}:`, err);
        result.errors.push(`${pkg.name}: ${String(err)}`);
      }
    }

    await supabase.from("audit_log").insert({
      action: "ssen_distribution_catalog_crawl",
      user_id: user.id,
      meta_json: {
        total_discovered: result.total_discovered,
        inserted: result.inserted,
        errors_count: result.errors.length,
        source: "ssen-distribution",
      },
    });

    console.log(`[ssen-dx] Done. Discovered=${result.total_discovered} Upserted=${result.inserted} Errors=${result.errors.length}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ssen-dx] Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ---------------------------------------------------------------------------

function processPackage(pkg: CkanPackage): Record<string, any> {
  const slug = pkg.name;
  const datasetId = `${PREFIX}${slug}`;
  const resources = pkg.resources ?? [];

  // Choose a primary download per format priority.
  const fmtPriority = ["GPKG", "GEOPACKAGE", "SHP", "SHAPEFILE", "GEOJSON", "JSON", "CSV", "XLSX"];
  const byFmt = (fmt: string) =>
    resources.find((r) => (r.format || "").toUpperCase() === fmt.toUpperCase());

  let primary: CkanResource | undefined;
  for (const fmt of fmtPriority) {
    primary = byFmt(fmt);
    if (primary) break;
  }

  const csvRes = byFmt("CSV");
  const geojsonRes = byFmt("GEOJSON");
  const shpRes = byFmt("SHP") || byFmt("SHAPEFILE");
  const gpkgRes = byFmt("GPKG") || byFmt("GEOPACKAGE");
  const xlsxRes = byFmt("XLSX");

  // Heuristic: geospatial if any geo-flavoured resource exists, OR title hints
  // at substations/lines/cables/network etc.
  const titleLower = (pkg.title || slug).toLowerCase();
  const geoHints = [
    "substation", "overhead", "underground", "cable", "line", "network",
    "asset", "transformer", "feeder", "circuit", "pole", "tower", "boundary",
  ];
  const looksGeo = !!(geojsonRes || shpRes || gpkgRes) ||
    geoHints.some((h) => titleLower.includes(h));
  const isGeospatial = looksGeo;

  // Best-effort geometry type guess
  let geometryType: string | null = null;
  if (isGeospatial) {
    if (titleLower.match(/\b(line|cable|circuit|overhead|underground|feeder|route)\b/)) {
      geometryType = "LineString";
    } else if (titleLower.match(/\b(substation|tower|pole|point|location|site)\b/)) {
      geometryType = "Point";
    } else if (titleLower.match(/\b(boundary|area|zone|polygon|region)\b/)) {
      geometryType = "Polygon";
    } else {
      geometryType = "Point";
    }
  }

  let storageTable = "geo_points";
  if (geometryType === "LineString") storageTable = "geo_polygons"; // shared lines/polygons store
  else if (geometryType === "Polygon") storageTable = "geo_polygons";
  else storageTable = "geo_points";

  const exportFormats = Array.from(
    new Set(resources.map((r) => (r.format || "").toLowerCase()).filter(Boolean))
  );

  const attachmentUrls = resources
    .filter((r) => (r.format || "").toUpperCase() === "PDF")
    .map((r) => ({ title: r.name || "document", url: r.url || null, mimetype: r.mimetype || "application/pdf" }));

  const fields_json = resources.map((r) => ({
    name: r.name || r.id,
    type: (r.format || "unknown").toLowerCase(),
    label: r.name || r.id,
    description: r.description || null,
    url: r.url || null,
  }));

  const fieldSummary = resources
    .map((r) => `${r.id}:${r.format}:${r.last_modified || ""}`)
    .sort()
    .join("|");
  const schemaHash = simpleHash(fieldSummary);

  return {
    dno: DNO_KEY,
    dataset_id: datasetId,
    title: pkg.title || slug,
    description: pkg.notes || null,
    portal_url: `${PORTAL_BASE}/${slug}`,
    updated_at_source: pkg.last_data_update || pkg.metadata_modified || null,
    is_geospatial: isGeospatial,
    geometry_field: isGeospatial ? "geometry" : null,
    geometry_type: geometryType,
    fields_json,
    record_count: 0, // CKAN doesn't expose row counts at catalog level
    endpoint_records: primary?.url || null,
    endpoint_metadata: `${CKAN_API}/package_show?id=${slug}`,
    endpoint_export_csv: csvRes?.url || null,
    endpoint_export_json: null,
    endpoint_export_geojson: geojsonRes?.url || null,
    endpoint_export_parquet: null,
    attachment_urls: attachmentUrls,
    export_formats: exportFormats,
    primary_key_guess: null,
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

async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    "Accept": "application/json",
  };
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, { headers });
      if (resp.status === 429) {
        const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`[ssen-dx] 429 rate limited, backing off ${Math.round(backoff)}ms`);
        await sleep(backoff);
        continue;
      }
      if (!resp.ok && attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 500;
        console.warn(`[ssen-dx] HTTP ${resp.status} for ${url}, retrying in ${backoff}ms`);
        await resp.text();
        await sleep(backoff);
        continue;
      }
      return resp;
    } catch (err) {
      if (attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 500;
        console.warn(`[ssen-dx] Fetch error, retrying in ${backoff}ms:`, err);
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}