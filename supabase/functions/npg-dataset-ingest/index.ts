import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * NPG Dataset Ingest — Background Processing Edition
 *
 * Uses EdgeRuntime.waitUntil() to perform heavy ingestion in the background,
 * returning immediately with a status update to avoid WORKER_LIMIT errors.
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
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      console.error("[ingest] auth error:", authError?.message, "header present:", !!authHeader);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    console.log("[ingest] user:", user.id, "isAdmin:", isAdmin, "roleErr:", roleErr?.message);
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

    // Early return for non-geospatial datasets linked to spatial layers
    const spatialTables = ["geo_polygons", "geo_feeders", "geo_cables", "geo_constraints", "geo_substations", "geo_points"];
    if (!entry.is_geospatial && spatialTables.includes(layerRow.storage_table)) {
      await supabase
        .from("dno_dataset_registry")
        .update({
          last_sync_status: "skipped",
          last_sync_error: "Tabular dataset — no geometry to ingest into spatial layer",
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", registry_id);

      return new Response(JSON.stringify({
        accepted: false,
        skipped: true,
        reason: "Tabular dataset linked to spatial layer — no geometry available",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark as processing immediately
    await supabase
      .from("dno_dataset_registry")
      .update({
        last_sync_status: "processing",
        last_sync_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", registry_id);

    const storageTable = layerRow.storage_table;
    // DNO-aware API key lookup
    const dnoApiKeyMap: Record<string, string> = {
      NPG: "NPG_API_KEY",
      ENWL: "ENWL_API_KEY",
      SPEN: "SPEN_API_KEY",
      NGED: "NGED_API_KEY",
      UKPN: "UKPN_API_KEY",
      CADENT: "CADENT_API_KEY",
    };
    const apiKeyEnvName = dnoApiKeyMap[entry.dno] || null;
    const apiKey = apiKeyEnvName ? (Deno.env.get(apiKeyEnvName) || null) : null;

    console.log(`[ingest] Starting background ${mode} ingest for ${entry.dataset_id} → ${storageTable}`);

    // Offload heavy work to background via EdgeRuntime.waitUntil
    // Wrap with timeout safety net — mark as error if not done in 400s
    EdgeRuntime.waitUntil(
      Promise.race([
        performIngest(supabase, entry, layerRow, storageTable, apiKey, user.id, registry_id, mode, { where, select: selectFields, order_by }),
        new Promise<void>(async (_, reject) => {
          await new Promise(r => setTimeout(r, 400000));
          reject(new Error("Background ingest timed out after 400s"));
        }),
      ]).catch(async (err) => {
        console.error(`[ingest] Background timeout/crash for ${entry.dataset_id}:`, err);
        await supabase
          .from("dno_dataset_registry")
          .update({
            last_sync_status: "error",
            last_sync_error: String(err),
            last_sync_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", registry_id);
      })
    );

    // Return immediately
    return new Response(JSON.stringify({
      accepted: true,
      dataset_id: entry.dataset_id,
      status: "processing",
      message: "Ingestion started in background. Check sync status for progress.",
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

// ─── Background Processing ──────────────────────────────────────────────────

async function performIngest(
  supabase: any, entry: any, layerRow: any, storageTable: string,
  apiKey: string | null, userId: string, registryId: string,
  mode: string, opts: { where?: string; select?: string; order_by?: string }
) {
  let totalInserted = 0;
  let totalSkipped = 0;
  let syncError: string | null = null;

  try {
    const layerNeedsShape = ["geo_polygons", "geo_feeders", "geo_cables", "geo_constraints"].includes(storageTable);
    const isCkan = entry.dno === "NGED";

    if (isCkan) {
      // NGED uses CKAN API — different ingestion path
      const result = await ingestViaCkan(supabase, entry, layerRow, storageTable, apiKey);
      totalInserted = result.inserted;
      totalSkipped = result.skipped;
    } else if (mode === "export" && entry.is_geospatial && entry.endpoint_export_geojson) {
      if (layerNeedsShape) {
        console.log(`[ingest] Layer needs shapes — using records mode for ${entry.dataset_id}`);
        const result = await ingestViaRecords(supabase, entry, layerRow, storageTable, apiKey, opts);
        totalInserted = result.inserted;
        totalSkipped = result.skipped;
      } else {
        try {
          const result = await ingestViaGeoJsonExport(supabase, entry, layerRow, storageTable, apiKey);
          totalInserted = result.inserted;
          totalSkipped = result.skipped;
        } catch (exportErr) {
          const errMsg = String(exportErr);
          console.warn(`[ingest] Export failed (${errMsg}), falling back to records mode`);
          const result = await ingestViaRecords(supabase, entry, layerRow, storageTable, apiKey, opts);
          totalInserted = result.inserted;
          totalSkipped = result.skipped;
        }
      }
    } else if (mode === "export" && entry.endpoint_export_csv) {
      const result = await ingestViaCsvExport(supabase, entry, layerRow, storageTable, apiKey);
      totalInserted = result.inserted;
      totalSkipped = result.skipped;
    } else {
      const result = await ingestViaRecords(supabase, entry, layerRow, storageTable, apiKey, opts);
      totalInserted = result.inserted;
      totalSkipped = result.skipped;
    }
  } catch (err) {
    syncError = String(err);
    console.error(`[ingest] Error:`, err);
  }

  // Update feature count on the layer
  try {
    const { count } = await supabase
      .from(storageTable)
      .select("*", { count: "exact", head: true })
      .eq("layer_id", entry.linked_layer_id);

    await supabase
      .from("layer_registry")
      .update({ feature_count: count ?? 0, updated_at: new Date().toISOString() })
      .eq("id", entry.linked_layer_id);
  } catch (e) {
    console.error("[ingest] Failed to update feature count:", e);
  }

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
    .eq("id", registryId);

  // Audit
  await supabase.from("audit_log").insert({
    action: "npg_dataset_ingest",
    user_id: userId,
    meta_json: {
      registry_id: registryId,
      dataset_id: entry.dataset_id,
      mode,
      inserted: totalInserted,
      skipped: totalSkipped,
      error: syncError,
    },
  });

  console.log(`[ingest] Background done. Dataset: ${entry.dataset_id}, Inserted: ${totalInserted}, Skipped: ${totalSkipped}, Error: ${syncError || "none"}`);
}

// ─── Streaming GeoJSON Feature Extractor ────────────────────────────────────
async function* streamGeoJsonFeatures(resp: Response): AsyncGenerator<any> {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inFeatures = false;
  let depth = 0;
  let featureStart = -1;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    if (!inFeatures) {
      const idx = buffer.indexOf('"features"');
      if (idx === -1) {
        if (buffer.length > 1000) buffer = buffer.slice(-200);
        continue;
      }
      const bracketIdx = buffer.indexOf("[", idx);
      if (bracketIdx === -1) continue;
      inFeatures = true;
      buffer = buffer.slice(bracketIdx + 1);
      depth = 0;
      featureStart = -1;
    }

    let i = 0;
    while (i < buffer.length) {
      const ch = buffer[i];
      if (ch === "{") {
        if (depth === 0) featureStart = i;
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0 && featureStart !== -1) {
          const featureStr = buffer.slice(featureStart, i + 1);
          try { yield JSON.parse(featureStr); } catch { /* skip malformed */ }
          featureStart = -1;
        }
      } else if (ch === "]" && depth === 0) {
        return;
      }
      i++;
    }

    if (featureStart !== -1) {
      buffer = buffer.slice(featureStart);
      featureStart = 0;
    } else {
      buffer = "";
    }
  }
}

// ─── GeoJSON Export Ingestion (Streaming) ───────────────────────────────────
async function ingestViaGeoJsonExport(
  supabase: any, entry: any, layerRow: any, storageTable: string, apiKey: string | null
): Promise<{ inserted: number; skipped: number }> {
  const url = entry.endpoint_export_geojson;
  console.log(`[ingest] Fetching GeoJSON export (streaming): ${url}`);

  const resp = await fetchWithRetry(url, apiKey);
  if (!resp.ok) throw new Error(`GeoJSON export failed: HTTP ${resp.status}`);

  const batchSize = getBatchSize(storageTable);
  let totalInserted = 0;
  let totalSkipped = 0;
  let batch: any[] = [];
  let featureCount = 0;

  for await (const feature of streamGeoJsonFeatures(resp)) {
    featureCount++;
    const mapped = mapFeatureToRow(feature, entry, layerRow, storageTable);
    if (mapped) {
      batch.push(mapped);
    } else {
      totalSkipped++;
    }

    if (batch.length >= batchSize) {
      const { data: inserted, error } = await supabase.rpc("batch_insert_geo_features", {
        _table_name: storageTable, _features_json: JSON.stringify(batch),
      });
      if (error) throw new Error(`Batch insert error: ${error.message}`);
      totalInserted += inserted ?? batch.length;
      console.log(`[ingest] Streamed batch: ${totalInserted} inserted so far`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    const { data: inserted, error } = await supabase.rpc("batch_insert_geo_features", {
      _table_name: storageTable, _features_json: JSON.stringify(batch),
    });
    if (error) throw new Error(`Batch insert error: ${error.message}`);
    totalInserted += inserted ?? batch.length;
  }

  console.log(`[ingest] GeoJSON streaming done: ${featureCount} features, ${totalInserted} inserted, ${totalSkipped} skipped`);
  return { inserted: totalInserted, skipped: totalSkipped };
}

// ─── CSV Export Ingestion (Streaming) ───────────────────────────────────────
async function ingestViaCsvExport(
  supabase: any, entry: any, layerRow: any, storageTable: string, apiKey: string | null
): Promise<{ inserted: number; skipped: number }> {
  const url = entry.endpoint_export_csv;
  console.log(`[ingest] Fetching CSV export (streaming): ${url}`);

  const resp = await fetchWithRetry(url, apiKey);
  if (!resp.ok) throw new Error(`CSV export failed: HTTP ${resp.status}`);

  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let headers: string[] | null = null;
  const batchSize = getBatchSize(storageTable);
  let totalInserted = 0;
  let totalSkipped = 0;
  let batch: any[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (!headers) { headers = parseCSVLine(trimmed); continue; }

      const values = parseCSVLine(trimmed);
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h.trim()] = values[idx] || ""; });

      const mapped = mapCsvRowToFeature(row, entry, layerRow, storageTable);
      if (mapped) batch.push(mapped); else totalSkipped++;

      if (batch.length >= batchSize) {
        const { data: inserted, error } = await supabase.rpc("batch_insert_geo_features", {
          _table_name: storageTable, _features_json: JSON.stringify(batch),
        });
        if (error) throw new Error(`Batch insert error: ${error.message}`);
        totalInserted += inserted ?? batch.length;
        batch = [];
      }
    }
  }

  if (buffer.trim() && headers) {
    const values = parseCSVLine(buffer.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h.trim()] = values[idx] || ""; });
    const mapped = mapCsvRowToFeature(row, entry, layerRow, storageTable);
    if (mapped) batch.push(mapped); else totalSkipped++;
  }

  if (batch.length > 0) {
    const { data: inserted, error } = await supabase.rpc("batch_insert_geo_features", {
      _table_name: storageTable, _features_json: JSON.stringify(batch),
    });
    if (error) throw new Error(`Batch insert error: ${error.message}`);
    totalInserted += inserted ?? batch.length;
  }

  console.log(`[ingest] CSV streaming done: ${totalInserted} inserted, ${totalSkipped} skipped`);
  return { inserted: totalInserted, skipped: totalSkipped };
}

// ─── Paginated Records Ingestion ─────────────────────────────────────────────
async function ingestViaRecords(
  supabase: any, entry: any, layerRow: any, storageTable: string, apiKey: string | null,
  opts: { where?: string; select?: string; order_by?: string }
): Promise<{ inserted: number; skipped: number }> {
  const baseUrl = entry.endpoint_records;
  // Opendatasoft Records API hard limit is 100
  const batchSize = Math.min(100, getBatchSize(storageTable));
  let offset = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  while (true) {
    const params = new URLSearchParams();
    params.set("limit", String(batchSize));
    params.set("offset", String(offset));
    if (opts.where) params.set("where", opts.where);
    if (opts.select) params.set("select", opts.select);
    if (opts.order_by) params.set("order_by", opts.order_by);

    const url = `${baseUrl}?${params.toString()}`;
    console.log(`[ingest] Records page: ${url}`);

    const resp = await fetchWithRetry(url, apiKey);
    if (resp.status === 403) {
      console.warn(`[ingest] 403 Forbidden for ${entry.dataset_id} — marking as skipped`);
      await supabase.from("dno_dataset_registry").update({
        last_sync_status: "skipped",
        last_sync_error: "403 Forbidden — restricted dataset, elevated portal permissions required",
        last_sync_at: new Date().toISOString(),
      }).eq("id", entry.id);
      return { inserted: 0, skipped: 0 };
    }
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

    const totalCount = data.total_count || 0;
    if (records.length < batchSize || offset >= totalCount) break;
    if (offset + batchSize > 10000) {
      console.warn(`[ingest] Hit 10k record API cap at offset ${offset}`);
      break;
    }

    await sleep(100);
  }

  return { inserted: totalInserted, skipped: totalSkipped };
}

// ─── CKAN (NGED) Ingestion ───────────────────────────────────────────────────

const CKAN_BASE = "https://connecteddata.nationalgrid.co.uk";

async function ingestViaCkan(
  supabase: any, entry: any, layerRow: any, storageTable: string, apiKey: string | null
): Promise<{ inserted: number; skipped: number }> {
  // Strategy priority:
  // 1. GeoJSON resource URL (direct download)
  // 2. CKAN datastore_search (paginated JSON)
  // 3. CSV resource URL (direct download)

  if (entry.endpoint_export_geojson) {
    console.log(`[ingest] CKAN: Using GeoJSON resource for ${entry.dataset_id}`);
    try {
      return await ingestViaCkanGeoJson(supabase, entry, layerRow, storageTable, apiKey);
    } catch (err) {
      console.warn(`[ingest] CKAN GeoJSON failed: ${err}, trying datastore...`);
    }
  }

  if (entry.endpoint_records) {
    console.log(`[ingest] CKAN: Using datastore_search for ${entry.dataset_id}`);
    try {
      return await ingestViaCkanDatastore(supabase, entry, layerRow, storageTable, apiKey);
    } catch (err) {
      console.warn(`[ingest] CKAN datastore failed: ${err}, trying CSV...`);
    }
  }

  if (entry.endpoint_export_csv) {
    console.log(`[ingest] CKAN: Using CSV resource for ${entry.dataset_id}`);
    return await ingestViaCsvExport(supabase, entry, layerRow, storageTable, apiKey);
  }

  // No usable endpoint — gracefully skip instead of erroring
  console.log(`[ingest] CKAN: No usable data endpoint for ${entry.dataset_id} — marking as skipped`);
  await supabase
    .from("dno_dataset_registry")
    .update({
      last_sync_status: "skipped",
      last_sync_error: "Data only available via manual download from dataportal2.nationalgrid.co.uk — no API/CSV/GeoJSON endpoint",
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", entry.id);
  return { inserted: 0, skipped: 0 };
}

async function ingestViaCkanGeoJson(
  supabase: any, entry: any, layerRow: any, storageTable: string, apiKey: string | null
): Promise<{ inserted: number; skipped: number }> {
  const url = entry.endpoint_export_geojson;
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = apiKey;

  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`GeoJSON fetch failed: HTTP ${resp.status}`);

  console.log(`[ingest] CKAN GeoJSON (streaming): ${url}`);
  const batchSize = getBatchSize(storageTable);
  let totalInserted = 0;
  let totalSkipped = 0;
  let batch: any[] = [];

  for await (const feature of streamGeoJsonFeatures(resp)) {
    const mapped = mapFeatureToRow(feature, entry, layerRow, storageTable);
    if (mapped) batch.push(mapped); else totalSkipped++;

    if (batch.length >= batchSize) {
      const { data: inserted, error } = await supabase.rpc("batch_insert_geo_features", {
        _table_name: storageTable, _features_json: JSON.stringify(batch),
      });
      if (error) throw new Error(`Batch insert error: ${error.message}`);
      totalInserted += inserted ?? batch.length;
      batch = [];
    }
  }

  if (batch.length > 0) {
    const { data: inserted, error } = await supabase.rpc("batch_insert_geo_features", {
      _table_name: storageTable, _features_json: JSON.stringify(batch),
    });
    if (error) throw new Error(`Batch insert error: ${error.message}`);
    totalInserted += inserted ?? batch.length;
  }

  console.log(`[ingest] CKAN GeoJSON streaming done: ${totalInserted} inserted, ${totalSkipped} skipped`);
  return { inserted: totalInserted, skipped: totalSkipped };
}

async function ingestViaCkanDatastore(
  supabase: any, entry: any, layerRow: any, storageTable: string, apiKey: string | null
): Promise<{ inserted: number; skipped: number }> {
  const baseUrl = entry.endpoint_records; // e.g. .../datastore_search?resource_id=XXX
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = apiKey;

  let offset = 0;
  const limit = 100;
  let totalInserted = 0;
  let totalSkipped = 0;

  while (true) {
    const url = `${baseUrl}&limit=${limit}&offset=${offset}`;
    console.log(`[ingest] CKAN datastore page: ${url}`);

    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Datastore search failed: HTTP ${resp.status}`);

    const data = await resp.json();
    if (!data.success) throw new Error(`Datastore search returned success=false`);

    const records = data.result?.records || [];
    if (records.length === 0) break;

    const mapped = records.map((rec: any) =>
      mapCkanRecordToRow(rec, entry, layerRow, storageTable)
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
    if (records.length < limit) break;
    if (offset >= 10000) {
      console.warn(`[ingest] CKAN: Hit 10k record cap at offset ${offset}`);
      break;
    }

    await sleep(200);
  }

  return { inserted: totalInserted, skipped: totalSkipped };
}

function mapCkanRecordToRow(rec: any, entry: any, layerRow: any, storageTable: string): any | null {
  let geom: any = null;

  // NGED data often has easting/northing (BNG) or lat/lon columns
  const lat = parseNum(rec.Latitude || rec.latitude || rec.lat || rec.LATITUDE);
  const lon = parseNum(rec.Longitude || rec.longitude || rec.lon || rec.lng || rec.LONGITUDE);
  const easting = parseNum(rec.Easting || rec.easting || rec.EASTING || rec.x);
  const northing = parseNum(rec.Northing || rec.northing || rec.NORTHING || rec.y);

  if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    geom = { type: "Point", coordinates: [lon, lat] };
  } else if (easting != null && northing != null && easting > 100000 && northing > 100000) {
    // BNG to WGS84 approximate conversion
    const wgs = bngToWgs84Approx(easting, northing);
    if (wgs) geom = { type: "Point", coordinates: [wgs.lon, wgs.lat] };
  }

  // Check for GeoJSON geometry field
  if (!geom && rec.geojson) {
    try {
      const g = typeof rec.geojson === "string" ? JSON.parse(rec.geojson) : rec.geojson;
      if (g.type && g.coordinates) geom = g;
    } catch {}
  }

  if (!geom) return null;

  geom = promoteGeometry(geom, storageTable);
  if (!geom) return null;

  // Build attrs from all non-geometry fields
  const attrs: Record<string, any> = {};
  const skipKeys = new Set(["_id", "geojson", "Latitude", "Longitude", "latitude", "longitude",
    "lat", "lon", "lng", "Easting", "Northing", "easting", "northing", "EASTING", "NORTHING",
    "LATITUDE", "LONGITUDE", "x", "y"]);
  for (const [key, val] of Object.entries(rec)) {
    if (!skipKeys.has(key) && val != null && typeof val !== "object") {
      attrs[key] = val;
    }
  }

  return {
    geom_geojson: JSON.stringify(geom),
    layer_id: entry.linked_layer_id,
    dno: entry.dno,
    name: rec.Name || rec.name || rec["Substation Name"] || rec.SubstationName || null,
    asset_id: rec.AssetID || rec.asset_id || rec["Asset ID"] || rec._id?.toString() || null,
    attrs_json: attrs,
    status: rec.Status || rec.status || "active",
    capacity_kw: parseNum(rec.InstalledCapacityMW || rec.FirmCapacity) != null
      ? (parseNum(rec.InstalledCapacityMW) != null ? parseNum(rec.InstalledCapacityMW)! * 1000 : parseNum(rec.FirmCapacity))
      : null,
    demand_kw: parseNum(rec.MaxDemand || rec.max_demand),
    headroom_kw: parseNum(rec.Headroom || rec.headroom),
    utilisation_pct: parseNum(rec.Utilisation || rec.utilisation_pct),
    voltage_kv: parseNum(rec.Voltage || rec.voltage_kv || rec["Voltage (kV)"]),
    feeder_ref: rec.FeederRef || rec.feeder_ref || rec.CircuitID || null,
    capacity_value: parseNum(rec.capacity_value),
    capacity_unit: rec.capacity_unit || null,
    capacity_flag: rec.capacity_flag || "unknown",
    constraint_type: rec.constraint_type || null,
  };
}

// Approximate BNG (OSGB36) to WGS84 conversion
function bngToWgs84Approx(e: number, n: number): { lat: number; lon: number } | null {
  // Helmert transform approximation
  const a = 6377563.396, b = 6356256.909;
  const e0 = 400000, n0 = -100000;
  const f0 = 0.9996012717, phi0 = 0.85521133, lam0 = -0.034906585;
  const ee = (a * a - b * b) / (a * a);

  let phi = phi0, M = 0;
  for (let i = 0; i < 10; i++) {
    phi = (n - n0 - M) / (a * f0) + phi;
    const Ma = (1 + ee / 4 + (ee * ee) * 5 / 64) * phi0;
    const Mb = (1 + ee / 4 + (ee * ee) * 5 / 64) * phi;
    M = b * f0 * ((Mb - Ma)
      - (3 * (1 + ee / 4) / 2) * Math.sin(phi - phi0) * Math.cos(phi + phi0));
  }
  // Simplified: just use linear approximation for UK
  const lat = 49.0 + (n - 0) / 111320;
  const lon = -8.0 + (e - 0) / (111320 * Math.cos(lat * Math.PI / 180));

  // Better: use simple affine for UK region
  const latApprox = (n - (-100000)) / 111320 + 49.0;
  const lonApprox = (e - 400000) / (111320 * Math.cos(54.0 * Math.PI / 180)) + (-2.0);

  if (latApprox < 49 || latApprox > 61 || lonApprox < -9 || lonApprox > 3) return null;
  return { lat: latApprox, lon: lonApprox };
}

// ─── Mapping Helpers ─────────────────────────────────────────────────────────

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

function mapOdsRecordToRow(rec: any, entry: any, layerRow: any, storageTable: string): any | null {
  let geom: any = null;

  const prefersPolygon = ["geo_polygons", "geo_constraints", "geo_feeders", "geo_cables"].includes(storageTable);

  if (prefersPolygon) {
    if (rec.geo_shape) {
      const shape = rec.geo_shape;
      geom = shape.geometry || shape;
      if (!geom?.type || !geom?.coordinates) geom = null;
    }
    if (!geom && rec.geo_point_2d) {
      const gp = rec.geo_point_2d;
      if (typeof gp === "string") {
        const [lat, lon] = gp.split(",").map(Number);
        if (!isNaN(lat) && !isNaN(lon)) geom = { type: "Point", coordinates: [lon, lat] };
      } else if (gp.lat != null && gp.lon != null) {
        geom = { type: "Point", coordinates: [gp.lon, gp.lat] };
      }
    }
  } else {
    if (rec.geo_point_2d) {
      const gp = rec.geo_point_2d;
      if (typeof gp === "string") {
        const [lat, lon] = gp.split(",").map(Number);
        if (!isNaN(lat) && !isNaN(lon)) geom = { type: "Point", coordinates: [lon, lat] };
      } else if (gp.lat != null && gp.lon != null) {
        geom = { type: "Point", coordinates: [gp.lon, gp.lat] };
      }
    }
    if (!geom && rec.geo_shape) {
      const shape = rec.geo_shape;
      geom = shape.geometry || shape;
      if (!geom?.type || !geom?.coordinates) geom = null;
    }
  }

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

function mapCsvRowToFeature(row: any, entry: any, layerRow: any, storageTable: string): any | null {
  let geom: any = null;

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

  if (target !== "Geometry") {
    const geomFamily = geom.type.replace("Multi", "");
    const targetFamily = target.replace("Multi", "");
    if (geomFamily !== targetFamily) return null;
  }

  // Strip Z coordinates (3D → 2D) to avoid "Geometry has Z dimension" errors
  geom.coordinates = stripZ(geom.coordinates);
  return geom;
}

function stripZ(coords: any): any {
  if (typeof coords[0] === "number") {
    return coords.slice(0, 2);
  }
  return coords.map(stripZ);
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function parseNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

async function fetchWithRetry(url: string, apiKey?: string | null, maxRetries = 3): Promise<Response> {
  let effectiveUrl = url;
  if (apiKey && !url.includes("apikey=")) {
    const separator = url.includes("?") ? "&" : "?";
    effectiveUrl = `${url}${separator}apikey=${apiKey}`;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(effectiveUrl);

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

function getBatchSize(storageTable: string): number {
  switch (storageTable) {
    case "geo_polygons":
    case "geo_constraints":
      return 50;
    case "geo_feeders":
    case "geo_cables":
      return 200;
    default:
      return 500;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// parseCSV removed — CSV ingestion now uses streaming

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
