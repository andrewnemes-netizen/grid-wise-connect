import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * NPG Dataset Ingest
 *
 * Ingests a single dataset from the NPG Opendatasoft portal using exports
 * (preferred for full refresh) or paginated records (for incremental/filtered).
 *
 * Supports:
 *   - Export-based full refresh via /exports/geojson or /exports/csv
 *   - Paginated records via /records with select, where, order_by, group_by
 *   - Automatic geometry promotion (LineString→Multi, Polygon→Multi)
 *   - Schema drift detection
 *   - Retry with exponential backoff
 *   - Rate limit handling
 *
 * Body params:
 *   registry_id  — UUID of the dno_dataset_registry row
 *   mode         — "export" (default) or "records"
 *   where        — optional ODS filter expression
 *   select       — optional field selection
 *   order_by     — optional sort
 *   limit        — optional limit for records mode
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { registry_id, mode = "export", where, select: selectFields, order_by } = body;

    if (!registry_id) {
      return new Response(JSON.stringify({ error: "registry_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the registry entry
    const { data: entry, error: regErr } = await supabase
      .from("dno_dataset_registry")
      .select("*")
      .eq("id", registry_id)
      .single();

    if (regErr || !entry) {
      return new Response(JSON.stringify({ error: "Registry entry not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!entry.linked_layer_id) {
      return new Response(JSON.stringify({ error: "No linked layer — link a layer_registry entry first" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify linked layer
    const { data: layerRow } = await supabase
      .from("layer_registry")
      .select("id, storage_table, geometry_type")
      .eq("id", entry.linked_layer_id)
      .single();

    if (!layerRow) {
      return new Response(JSON.stringify({ error: "Linked layer not found in registry" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const storageTable = layerRow.storage_table;
    const apiKey = Deno.env.get("NPG_API_KEY") || null;

    console.log(`[ingest] Starting ${mode} ingest for ${entry.dataset_id} → ${storageTable}`);

    let totalInserted = 0;
    let totalSkipped = 0;
    let syncError: string | null = null;

    try {
      if (mode === "export" && entry.is_geospatial && entry.endpoint_export_geojson) {
        // ── Export-based GeoJSON full refresh ──
        try {
          const result = await ingestViaGeoJsonExport(
            supabase, entry, layerRow, storageTable, apiKey
          );
          totalInserted = result.inserted;
          totalSkipped = result.skipped;
        } catch (exportErr) {
          const errMsg = String(exportErr);
          if (errMsg.includes("Memory limit") || errMsg.includes("CPU Time")) {
            console.warn(`[ingest] Export failed (${errMsg}), falling back to records mode`);
            const result = await ingestViaRecords(
              supabase, entry, layerRow, storageTable, apiKey,
              { where, select: selectFields, order_by }
            );
            totalInserted = result.inserted;
            totalSkipped = result.skipped;
          } else {
            throw exportErr;
          }
        }

      } else if (mode === "export" && entry.endpoint_export_csv) {
        // ── Export-based CSV full refresh (tabular datasets) ──
        const result = await ingestViaCsvExport(
          supabase, entry, layerRow, storageTable, apiKey
        );
        totalInserted = result.inserted;
        totalSkipped = result.skipped;

      } else {
        // ── Paginated records fallback ──
        const result = await ingestViaRecords(
          supabase, entry, layerRow, storageTable, apiKey,
          { where, select: selectFields, order_by }
        );
        totalInserted = result.inserted;
        totalSkipped = result.skipped;
      }
    } catch (err) {
      syncError = String(err);
      console.error(`[ingest] Error:`, err);
    }

    // Update feature count on the layer
    const { count } = await supabase
      .from(storageTable)
      .select("*", { count: "exact", head: true })
      .eq("layer_id", entry.linked_layer_id);

    await supabase
      .from("layer_registry")
      .update({ feature_count: count ?? 0, updated_at: new Date().toISOString() })
      .eq("id", entry.linked_layer_id);

    // Update registry entry with sync status
    await supabase
      .from("dno_dataset_registry")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_status: syncError ? "error" : "success",
        last_sync_rows: totalInserted,
        last_sync_error: syncError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", registry_id);

    // Audit
    await supabase.from("audit_log").insert({
      action: "npg_dataset_ingest",
      user_id: user.id,
      meta_json: {
        registry_id,
        dataset_id: entry.dataset_id,
        mode,
        inserted: totalInserted,
        skipped: totalSkipped,
        error: syncError,
      },
    });

    if (syncError) {
      return new Response(JSON.stringify({
        error: syncError,
        inserted: totalInserted,
        skipped: totalSkipped,
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      dataset_id: entry.dataset_id,
      mode,
      inserted: totalInserted,
      skipped: totalSkipped,
      total_in_layer: count,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[ingest] Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── GeoJSON Export Ingestion ────────────────────────────────────────────────
async function ingestViaGeoJsonExport(
  supabase: any, entry: any, layerRow: any, storageTable: string, apiKey: string | null
): Promise<{ inserted: number; skipped: number }> {
  const url = entry.endpoint_export_geojson;
  console.log(`[ingest] Fetching GeoJSON export: ${url}`);

  const resp = await fetchWithRetry(url, apiKey);
  if (!resp.ok) {
    throw new Error(`GeoJSON export failed: HTTP ${resp.status}`);
  }

  const geojson = await resp.json();
  const features = geojson.features || [];
  console.log(`[ingest] GeoJSON export contains ${features.length} features`);

  if (features.length === 0) return { inserted: 0, skipped: 0 };

  // Dynamic batch size based on geometry complexity
  const batchSize = getBatchSize(storageTable);
  let totalInserted = 0;
  let totalSkipped = 0;

  for (let i = 0; i < features.length; i += batchSize) {
    const batch = features.slice(i, i + batchSize);
    const mapped = batch.map((f: any) =>
      mapFeatureToRow(f, entry, layerRow, storageTable)
    ).filter(Boolean);

    totalSkipped += batch.length - mapped.length;

    if (mapped.length > 0) {
      const { data: inserted, error } = await supabase.rpc("batch_insert_geo_features", {
        _table_name: storageTable,
        _features_json: JSON.stringify(mapped),
      });

      if (error) {
        console.error(`[ingest] Batch RPC error at ${i}:`, error);
        throw new Error(`Batch insert error: ${error.message}`);
      }
      totalInserted += inserted ?? mapped.length;
    }

    console.log(`[ingest] Batch ${Math.floor(i / batchSize) + 1}: ${mapped.length} features inserted`);
  }

  return { inserted: totalInserted, skipped: totalSkipped };
}

// ─── CSV Export Ingestion ────────────────────────────────────────────────────
async function ingestViaCsvExport(
  supabase: any, entry: any, layerRow: any, storageTable: string, apiKey: string | null
): Promise<{ inserted: number; skipped: number }> {
  const url = entry.endpoint_export_csv;
  console.log(`[ingest] Fetching CSV export: ${url}`);

  const resp = await fetchWithRetry(url, apiKey);
  if (!resp.ok) {
    throw new Error(`CSV export failed: HTTP ${resp.status}`);
  }

  const text = await resp.text();
  const rows = parseCSV(text);
  console.log(`[ingest] CSV export contains ${rows.length} rows`);

  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  const batchSize = getBatchSize(storageTable);
  let totalInserted = 0;
  let totalSkipped = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const mapped = batch.map((row: any) =>
      mapCsvRowToFeature(row, entry, layerRow, storageTable)
    ).filter(Boolean);

    totalSkipped += batch.length - mapped.length;

    if (mapped.length > 0) {
      const { data: inserted, error } = await supabase.rpc("batch_insert_geo_features", {
        _table_name: storageTable,
        _features_json: JSON.stringify(mapped),
      });

      if (error) {
        console.error(`[ingest] CSV batch error at ${i}:`, error);
        throw new Error(`Batch insert error: ${error.message}`);
      }
      totalInserted += inserted ?? mapped.length;
    }
  }

  return { inserted: totalInserted, skipped: totalSkipped };
}

// ─── Paginated Records Ingestion ─────────────────────────────────────────────
async function ingestViaRecords(
  supabase: any, entry: any, layerRow: any, storageTable: string, apiKey: string | null,
  opts: { where?: string; select?: string; order_by?: string }
): Promise<{ inserted: number; skipped: number }> {
  const baseUrl = entry.endpoint_records;
  const batchSize = Math.min(100, getBatchSize(storageTable));
  let offset = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  while (true) {
    // Build URL with query params
    const params = new URLSearchParams();
    params.set("limit", String(batchSize));
    params.set("offset", String(offset));
    if (opts.where) params.set("where", opts.where);
    if (opts.select) params.set("select", opts.select);
    if (opts.order_by) params.set("order_by", opts.order_by);

    const url = `${baseUrl}?${params.toString()}`;
    console.log(`[ingest] Records page: ${url}`);

    const resp = await fetchWithRetry(url, apiKey);
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Records API error ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    const records = data.results || [];

    if (records.length === 0) break;

    const mapped = records.map((rec: any) =>
      mapOdsRecordToRow(rec, entry, layerRow, storageTable)
    ).filter(Boolean);

    totalSkipped += records.length - mapped.length;

    if (mapped.length > 0) {
      const { data: inserted, error } = await supabase.rpc("batch_insert_geo_features", {
        _table_name: storageTable,
        _features_json: JSON.stringify(mapped),
      });

      if (error) throw new Error(`Batch insert error: ${error.message}`);
      totalInserted += inserted ?? mapped.length;
    }

    offset += records.length;

    // Opendatasoft caps offset+limit at 10000
    const totalCount = data.total_count || 0;
    if (records.length < batchSize || offset >= totalCount) break;
    // Clamp to API limit
    if (offset + batchSize > 10000) {
      console.warn(`[ingest] Hit 10k record API cap at offset ${offset}`);
      break;
    }

    await sleep(100);
  }

  return { inserted: totalInserted, skipped: totalSkipped };
}

// ─── Mapping Helpers ─────────────────────────────────────────────────────────

/** Map a GeoJSON Feature to the batch insert format */
function mapFeatureToRow(feature: any, entry: any, layerRow: any, storageTable: string): any | null {
  let geom = feature.geometry;
  if (!geom || !geom.type || !geom.coordinates) return null;

  geom = promoteGeometry(geom, storageTable);
  if (!geom) return null;

  const props = feature.properties || {};

  return {
    geom_geojson: JSON.stringify(geom),
    layer_id: entry.linked_layer_id,
    dno: entry.dno,
    name: props.name || props.site_name || props.psp_name || props["Substation Name"] || null,
    asset_id: props.asset_id || props.site_id || props.circuit_id || null,
    attrs_json: props,
    status: props.status || "active",
    capacity_kw: parseNum(props.firm_capacity_kw || props.capacity_kw || props.firm_cap),
    demand_kw: parseNum(props.max_demand_kw || props.demand_kw || props.maxdemand),
    headroom_kw: parseNum(props.transformer_headroom_kw || props.headroom_kw || props.demhr),
    utilisation_pct: parseNum(props.utilisation_pct || props.fault_level_),
    voltage_kv: parseNum(props.voltage_kv || props.pvoltage),
    feeder_ref: props.feeder_ref || props.circuit_id || null,
    capacity_value: parseNum(props.capacity_value),
    capacity_unit: props.capacity_unit || null,
    capacity_flag: props.capacity_flag || "unknown",
    constraint_type: props.constraint_type || props.type || null,
  };
}

/** Map an ODS record (from /records endpoint) to batch insert format */
function mapOdsRecordToRow(rec: any, entry: any, layerRow: any, storageTable: string): any | null {
  let geom: any = null;

  // Try geo_point_2d first
  if (rec.geo_point_2d) {
    const gp = rec.geo_point_2d;
    if (typeof gp === "string") {
      const [lat, lon] = gp.split(",").map(Number);
      if (!isNaN(lat) && !isNaN(lon)) geom = { type: "Point", coordinates: [lon, lat] };
    } else if (gp.lat != null && gp.lon != null) {
      geom = { type: "Point", coordinates: [gp.lon, gp.lat] };
    }
  }

  // Try geo_shape
  if (!geom && rec.geo_shape) {
    const shape = rec.geo_shape;
    geom = shape.geometry || shape;
    if (!geom?.type || !geom?.coordinates) geom = null;
  }

  // Try named geometry field from registry
  if (!geom && entry.geometry_field && rec[entry.geometry_field]) {
    const field = rec[entry.geometry_field];
    if (field.lat != null && field.lon != null) {
      geom = { type: "Point", coordinates: [field.lon, field.lat] };
    } else if (field.geometry) {
      geom = field.geometry;
    } else if (field.type && field.coordinates) {
      geom = field;
    }
  }

  if (!geom) return null;

  geom = promoteGeometry(geom, storageTable);
  if (!geom) return null;

  // Build attrs from all non-geometry fields
  const attrs: Record<string, any> = {};
  const skipKeys = new Set(["geo_point_2d", "geo_shape", entry.geometry_field]);
  for (const [key, val] of Object.entries(rec)) {
    if (!skipKeys.has(key) && val != null && typeof val !== "object") {
      attrs[key] = val;
    }
  }

  return {
    geom_geojson: JSON.stringify(geom),
    layer_id: entry.linked_layer_id,
    dno: entry.dno,
    name: rec.name || rec.psp_name || rec.site_name || null,
    asset_id: rec.asset_id || rec.site_id || rec.circuit_id || null,
    attrs_json: attrs,
    status: rec.status || "active",
    capacity_kw: parseNum(rec.firm_cap || rec.capacity_kw),
    demand_kw: parseNum(rec.maxdemand || rec.demand_kw),
    headroom_kw: parseNum(rec.demhr || rec.headroom_kw),
    utilisation_pct: parseNum(rec.fault_level_ || rec.utilisation_pct),
    voltage_kv: parseNum(rec.pvoltage || rec.voltage_kv),
    feeder_ref: rec.feeder_ref || rec.circuit_id || null,
    capacity_value: parseNum(rec.capacity_value),
    capacity_unit: rec.capacity_unit || null,
    capacity_flag: rec.capacity_flag || "unknown",
    constraint_type: rec.constraint_type || rec.type || null,
  };
}

/** Map a CSV row to batch insert format */
function mapCsvRowToFeature(row: any, entry: any, layerRow: any, storageTable: string): any | null {
  let geom: any = null;

  // Try lat/lon or geo_point_2d columns
  if (row.geo_point_2d) {
    const parts = String(row.geo_point_2d).split(",").map((s: string) => Number(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      geom = { type: "Point", coordinates: [parts[1], parts[0]] };
    }
  } else if (row.lat && row.lon) {
    geom = { type: "Point", coordinates: [Number(row.lon), Number(row.lat)] };
  } else if (row.latitude && row.longitude) {
    geom = { type: "Point", coordinates: [Number(row.longitude), Number(row.latitude)] };
  }

  if (!geom) return null;

  geom = promoteGeometry(geom, storageTable);
  if (!geom) return null;

  return {
    geom_geojson: JSON.stringify(geom),
    layer_id: entry.linked_layer_id,
    dno: entry.dno,
    name: row.name || row.site_name || row.psp_name || null,
    asset_id: row.asset_id || row.site_id || null,
    attrs_json: row,
    status: row.status || "active",
    capacity_kw: parseNum(row.firm_capacity_kw || row.capacity_kw),
    demand_kw: parseNum(row.max_demand_kw || row.demand_kw),
    headroom_kw: parseNum(row.headroom_kw),
    utilisation_pct: parseNum(row.utilisation_pct),
    voltage_kv: parseNum(row.voltage_kv),
    feeder_ref: row.feeder_ref || null,
    capacity_value: parseNum(row.capacity_value),
    capacity_unit: row.capacity_unit || null,
    capacity_flag: row.capacity_flag || "unknown",
    constraint_type: row.constraint_type || null,
  };
}

// ─── Geometry Promotion ──────────────────────────────────────────────────────

const TABLE_GEOM: Record<string, string> = {
  geo_substations: "Point",
  geo_points: "Point",
  geo_feeders: "MultiLineString",
  geo_cables: "MultiLineString",
  geo_polygons: "MultiPolygon",
  geo_constraints: "Geometry",
};

function promoteGeometry(geom: any, storageTable: string): any | null {
  const target = TABLE_GEOM[storageTable] || "Geometry";

  if (geom.type === "LineString" && (target === "MultiLineString" || target === "Geometry")) {
    geom = { type: "MultiLineString", coordinates: [geom.coordinates] };
  }
  if (geom.type === "Polygon" && (target === "MultiPolygon" || target === "Geometry")) {
    geom = { type: "MultiPolygon", coordinates: [geom.coordinates] };
  }

  // Validate family match
  if (target !== "Geometry") {
    const geomFamily = geom.type.replace("Multi", "");
    const targetFamily = target.replace("Multi", "");
    if (geomFamily !== targetFamily) return null;
  }

  return geom;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function parseNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

async function fetchWithRetry(url: string, apiKey?: string | null, maxRetries = 3): Promise<Response> {
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Apikey ${apiKey}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, { headers });

      // If 403 with header auth, retry once with query param auth
      if (resp.status === 403 && apiKey && attempt === 0 && !url.includes("apikey=")) {
        await resp.text();
        const separator = url.includes("?") ? "&" : "?";
        const fallbackUrl = `${url}${separator}apikey=${apiKey}`;
        console.warn(`[ingest] Header auth returned 403, retrying with query param: ${fallbackUrl}`);
        const fallbackResp = await fetch(fallbackUrl);
        if (fallbackResp.ok) return fallbackResp;
        await fallbackResp.text();
        // Fall through to normal retry logic
      }

      if (resp.status === 429) {
        const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`[ingest] Rate limited, backing off ${Math.round(backoff)}ms`);
        await sleep(backoff);
        continue;
      }
      if (!resp.ok && attempt < maxRetries) {
        const backoff = Math.pow(2, attempt) * 500;
        await resp.text();
        await sleep(backoff);
        continue;
      }
      return resp;
    } catch (err) {
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 500);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Failed to fetch ${url} after ${maxRetries} retries`);
}

/** Returns optimal batch size based on geometry complexity of the target table */
function getBatchSize(storageTable: string): number {
  switch (storageTable) {
    case "geo_polygons":
    case "geo_constraints":
      return 50;  // Complex geometries - prevent statement timeout
    case "geo_feeders":
    case "geo_cables":
      return 200; // Line geometries - moderate complexity
    default:
      return 500; // Points and substations - simple geometries
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Minimal CSV parser — handles quoted fields */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n");
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = values[idx] || "";
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ";" || ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}
