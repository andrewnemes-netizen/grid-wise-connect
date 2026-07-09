import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * NPG Dataset Ingest — Partitioned Records Edition
 *
 * For large datasets (>10k records), uses the Records API partitioned by
 * 2-char hex recordid prefix (256 buckets of ~2k records each).
 * Processes a batch of prefixes per invocation and self-continues.
 */

// 256 two-char hex prefixes for partitioning
const HEX_PREFIXES: string[] = [];
for (let i = 0; i < 256; i++) HEX_PREFIXES.push(i.toString(16).padStart(2, "0"));
const ACTIVE_SYNC_STATUSES = new Set(["processing", "partial"]);
const STALE_INGEST_MS = 20 * 60 * 1000;

type IngestResult = {
  inserted: number;
  skipped: number;
  hasMore?: boolean;
  nextSkipFeatures?: number;
  consumedRows?: number;
  processedRows?: number;
};

function hasFreshIngestLock(lastSyncAt?: string | null) {
  const lastMs = lastSyncAt ? Date.parse(lastSyncAt) : Number.NaN;
  return Number.isFinite(lastMs) && Date.now() - lastMs < STALE_INGEST_MS;
}

function buildAlreadyRunningResponse(status: string | null, lastSyncAt: string | null) {
  return new Response(JSON.stringify({
    accepted: true,
    already_running: true,
    error: "Ingestion already running for this dataset",
    message: "Ingestion already running for this dataset",
    status: status ?? "processing",
    detail: "Please wait for the current run to complete before starting another.",
    last_sync_at: lastSyncAt,
  }), { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

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
    let {
      registry_id,
      mode = "export",
      where,
      select: selectFields,
      order_by,
      // Partition-based continuation
      partition_start = 0,   // index into HEX_PREFIXES to start from
      // Legacy chunk continuation (kept for backward compat)
      skip_features = 0,
      chunk_size,
    } = body;

    if (!registry_id) {
      return new Response(JSON.stringify({ error: "registry_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the registry entry
    let entry: any = null;
    let registryTable = "dno_dataset_registry";

    const { data: dnoEntry } = await supabase
      .from("dno_dataset_registry")
      .select("*")
      .eq("id", registry_id)
      .single();

    if (dnoEntry) {
      entry = dnoEntry;
    } else {
      const { data: gasEntry } = await supabase
        .from("gas_dataset_registry")
        .select("*")
        .eq("id", registry_id)
        .single();
      if (gasEntry) {
        entry = gasEntry;
        registryTable = "gas_dataset_registry";
      }
    }

    if (!entry) {
      return new Response(JSON.stringify({ error: "Registry entry not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!entry.linked_layer_id) {
      return new Response(JSON.stringify({ error: "No linked layer — link a layer_registry entry first" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // ── Auto-resume from persisted cursor ──
    // If the last run left a cursor (was killed mid-way or errored via timeout),
    // pick up from where it stopped instead of restarting the whole dataset.
    const explicitContinuation = partition_start > 0 || skip_features > 0;
    const savedCursor = entry.sync_cursor as { partition_start?: number; skip_features?: number } | null;
    let autoResumed = false;
    if (!explicitContinuation && savedCursor &&
        ["error", "partial", "processing"].includes(entry.last_sync_status) &&
        ((savedCursor.partition_start ?? 0) > 0 || (savedCursor.skip_features ?? 0) > 0)) {
      partition_start = savedCursor.partition_start ?? 0;
      skip_features   = savedCursor.skip_features   ?? 0;
      autoResumed = true;
      console.log(`[ingest] Auto-resuming ${entry.dataset_id} from cursor partition_start=${partition_start}, skip_features=${skip_features}`);
    }

    // Skip non-geospatial datasets linked to spatial layers
    const spatialTables = ["geo_polygons", "geo_feeders", "geo_cables", "geo_constraints", "geo_substations", "geo_points"];
    if (!entry.is_geospatial && spatialTables.includes(layerRow.storage_table)) {
      await supabase
        .from(registryTable)
        .update({
          last_sync_status: "skipped",
          last_sync_error: "Tabular dataset — no geometry to ingest into spatial layer",
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", registry_id);

      return new Response(JSON.stringify({ accepted: false, skipped: true, reason: "Tabular dataset — no geometry" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isContinuation = partition_start > 0 || skip_features > 0;
    if (ACTIVE_SYNC_STATUSES.has(entry.last_sync_status) && !isContinuation) {
      if (hasFreshIngestLock(entry.last_sync_at)) {
        return buildAlreadyRunningResponse(entry.last_sync_status, entry.last_sync_at ?? null);
      }

      const staleNow = new Date().toISOString();
      await supabase.from(registryTable).update({
        last_sync_status: "error",
        last_sync_error: "Previous run timed out or crashed (stale lock auto-cleared)",
        last_sync_at: staleNow,
        updated_at: staleNow,
      }).eq("id", registry_id).in("last_sync_status", ["processing", "partial"]);
    }

    // Allow continuations from partial state OR auto-resume from error
    if (isContinuation && !autoResumed && !ACTIVE_SYNC_STATUSES.has(entry.last_sync_status)) {
      return new Response(JSON.stringify({
        error: "Dataset is not in a partial/processing state for continuation",
        detail: `Current status: ${entry.last_sync_status}`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Mark processing
    const now = new Date().toISOString();
    await supabase.from(registryTable).update({
      last_sync_status: "processing",
      last_sync_error: null,
      last_sync_at: now,
      last_sync_rows: isContinuation ? (entry.last_sync_rows || 0) : 0,
      updated_at: now,
    }).eq("id", registry_id);

    const storageTable = layerRow.storage_table;
    const dnoApiKeyMap: Record<string, string> = {
      NPG: "NPG_API_KEY", ENWL: "ENWL_API_KEY", SPEN: "SPEN_API_KEY",
      NGED: "NGED_API_KEY", UKPN: "UKPN_API_KEY", CADENT: "CADENT_API_KEY",
      SSEN: "SSEN_API_KEY", NIE: "NIE_API_KEY",
    };
    const apiKeyEnvName = dnoApiKeyMap[entry.dno] || null;
    let apiKey = apiKeyEnvName ? (Deno.env.get(apiKeyEnvName) || null) : null;

    // Safety: only forward the SSEN key to SSEN-owned hosts (Opendatasoft / data-api.ssen.co.uk)
    if (entry.dno === "SSEN" && apiKey) {
      const probeUrl = String(
        entry.endpoint_export_geojson || entry.endpoint_records || entry.endpoint_export_csv || ""
      );
      const isSsenHost = /ssentransmission\.opendatasoft\.com|data-api\.ssen\.co\.uk|data\.ssen\.co\.uk/i.test(probeUrl);
      if (!isSsenHost) apiKey = null;
    }

    console.log(`[ingest] Starting ${mode} ingest for ${entry.dataset_id} → ${storageTable} (partition_start=${partition_start})`);

    // Background processing
    EdgeRuntime.waitUntil(
      Promise.race([
        performIngest(supabase, entry, layerRow, storageTable, apiKey, user.id, registry_id, mode,
          { where, select: selectFields, order_by }, registryTable, authHeader, partition_start, skip_features, chunk_size),
        new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Background timeout 240s")), 240000)),
      ]).catch(async (err) => {
        console.error(`[ingest] Background crash for ${entry.dataset_id}:`, err);
        const isLargeDataset = Number(entry.record_count || 0) > 10000;
        const errorTs = new Date().toISOString();
        await supabase.from(registryTable).update({
          last_sync_status: isLargeDataset ? "partial" : "error",
          last_sync_error: isLargeDataset ? "Background chunk timed out; run ingest again to resume from the saved cursor" : String(err),
          last_sync_at: errorTs,
          updated_at: errorTs,
          sync_cursor: isLargeDataset ? { partition_start, skip_features, saved_at: errorTs } : entry.sync_cursor,
        }).eq("id", registry_id);
      })
    );

    return new Response(JSON.stringify({
      accepted: true,
      dataset_id: entry.dataset_id,
      status: "processing",
      message: `Ingestion started (partition_start=${partition_start}).`,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
  mode: string, opts: { where?: string; select?: string; order_by?: string },
  registryTable: string, authHeader: string,
  partitionStart: number, skipFeatures: number, chunkSize?: number,
) {
  let totalInserted = 0;
  let totalSkipped = 0;
  let syncError: string | null = null;
  let hasMore = false;
  let nextPartitionStart = 0;
  let nextSkipFeatures = 0;

  try {
    const isContinuation = partitionStart > 0 || skipFeatures > 0;
    const isSsenDistribution = entry.dno === "SSEN" && String(entry.dataset_id || "").startsWith("dx-");
    const isCkan = entry.dno === "NGED" || isSsenDistribution;
    const recordCount = entry.record_count ?? 0;
    const isLargeDataset = recordCount > 5000;
    const isVeryLargeDataset = recordCount > 10000;

    // SSEN Distribution exports can be restarted after edge timeouts.  On a new
    // run, replace the layer contents so a failed partial run cannot leave
    // duplicate map features behind (especially point datasets with null IDs).
    if (isSsenDistribution && !isContinuation) {
      const { error: clearError } = await supabase
        .from(storageTable)
        .delete()
        .eq("layer_id", entry.linked_layer_id);
      if (clearError) throw new Error(`Failed to clear existing SSEN layer rows: ${clearError.message}`);
    }

    if (isCkan) {
      const result = await ingestViaCkan(supabase, entry, layerRow, storageTable, apiKey, {
        skipFeatures,
        maxFeatures: chunkSize || getDefaultChunkRowLimit(storageTable),
      });
      totalInserted = result.inserted;
      totalSkipped = result.skipped;
      if (result.hasMore) {
        hasMore = true;
        nextSkipFeatures = result.nextSkipFeatures ?? skipFeatures;
      }
    } else if (isVeryLargeDataset && entry.endpoint_records) {
      // ── PARTITIONED RECORDS API ──
      // Use recordid prefix partitioning to stay under the 10k offset+limit cap.
      // Each 2-char hex prefix covers ~recordCount/256 records.
      // Process PREFIXES_PER_RUN prefixes per invocation, then self-continue.
      const PREFIXES_PER_RUN = 1; // Keep large ODS/NIE runs below the edge execution budget.
      const endIndex = Math.min(partitionStart + PREFIXES_PER_RUN, HEX_PREFIXES.length);

      console.log(`[ingest] Partitioned records: prefixes ${partitionStart}..${endIndex - 1} of ${HEX_PREFIXES.length} (est ${recordCount} total)`);

      for (let i = partitionStart; i < endIndex; i++) {
        const prefix = HEX_PREFIXES[i];
        try {
          const result = await ingestPartition(supabase, entry, layerRow, storageTable, apiKey, prefix, opts);
          totalInserted += result.inserted;
          totalSkipped += result.skipped;
          console.log(`[ingest] Partition ${prefix} done: +${result.inserted} inserted, +${result.skipped} skipped`);
        } catch (partErr) {
          console.error(`[ingest] Partition ${prefix} error:`, partErr);
          // Continue with next partition rather than failing entire ingest
        }
      }

      if (endIndex < HEX_PREFIXES.length) {
        hasMore = true;
        nextPartitionStart = endIndex;
      }
    } else if (isLargeDataset && entry.is_geospatial && entry.endpoint_export_geojson) {
      // Medium datasets (5k-10k): use GeoJSON export streaming
      try {
        const result = await ingestViaGeoJsonExport(supabase, entry, layerRow, storageTable, apiKey, {
          skipFeatures,
          maxFeatures: chunkSize || getDefaultChunkRowLimit(storageTable),
        });
        totalInserted = result.inserted;
        totalSkipped = result.skipped;
        if (result.hasMore) {
          hasMore = true;
          nextSkipFeatures = result.nextSkipFeatures ?? skipFeatures;
        }
      } catch (exportErr) {
        console.warn(`[ingest] Export failed (${exportErr}), falling back to records`);
        const result = await ingestViaRecords(supabase, entry, layerRow, storageTable, apiKey, opts);
        totalInserted = result.inserted;
        totalSkipped = result.skipped;
      }
    } else if (entry.endpoint_export_csv && !entry.is_geospatial) {
      const result = await ingestViaCsvExport(supabase, entry, layerRow, storageTable, apiKey, {
        skipFeatures,
        maxFeatures: chunkSize || getDefaultChunkRowLimit(storageTable),
      });
      totalInserted = result.inserted;
      totalSkipped = result.skipped;
      if (result.hasMore) {
        hasMore = true;
        nextSkipFeatures = result.nextSkipFeatures ?? skipFeatures;
      }
    } else if (entry.is_geospatial && entry.endpoint_export_geojson) {
      try {
        const result = await ingestViaGeoJsonExport(supabase, entry, layerRow, storageTable, apiKey, {
          skipFeatures,
          maxFeatures: chunkSize || getDefaultChunkRowLimit(storageTable),
        });
        totalInserted = result.inserted;
        totalSkipped = result.skipped;
        if (result.hasMore) {
          hasMore = true;
          nextSkipFeatures = result.nextSkipFeatures ?? skipFeatures;
        }
      } catch (exportErr) {
        console.warn(`[ingest] Export failed (${exportErr}), falling back to records`);
        const result = await ingestViaRecords(supabase, entry, layerRow, storageTable, apiKey, opts);
        totalInserted = result.inserted;
        totalSkipped = result.skipped;
      }
    } else {
      const result = await ingestViaRecords(supabase, entry, layerRow, storageTable, apiKey, opts);
      totalInserted = result.inserted;
      totalSkipped = result.skipped;
    }
  } catch (err) {
    syncError = String(err);
    console.error(`[ingest] Error:`, err);
  }

  // Update feature count
  try {
    const { count } = await supabase
      .from(storageTable)
      .select("*", { count: "exact", head: true })
      .eq("layer_id", entry.linked_layer_id);
    await supabase.from("layer_registry").update({
      feature_count: count ?? 0,
      updated_at: new Date().toISOString(),
    }).eq("id", entry.linked_layer_id);
  } catch (e) {
    console.error("[ingest] Failed to update feature count:", e);
  }

  // Final status
  const finalStatus = syncError ? "error" : (hasMore ? "partial" : "success");
  const prevRows = (partitionStart > 0 || skipFeatures > 0) ? (entry.last_sync_rows || 0) : 0;
  const cumulativeInserted = prevRows + totalInserted;

  const finalTs = new Date().toISOString();
  // Soft-failure: if the source advertises records but we ingested zero, surface as an error
  // so silent auth/empty-export issues stop masquerading as successes.
  let effectiveStatus = finalStatus;
  let effectiveError = syncError;
  const sourceCount = Number(entry.record_count || 0);
  if (
    !syncError && !hasMore && sourceCount > 0 &&
    cumulativeInserted === 0 && totalSkipped === 0
  ) {
    effectiveStatus = "error";
    effectiveError =
      `Source returned 0 features but record_count=${sourceCount}. ` +
      `Likely cause: missing/invalid API key for ${entry.dno} or the export endpoint is gated.`;
  } else if (
    !syncError && !hasMore && cumulativeInserted === 0 && totalSkipped > 0
  ) {
    effectiveStatus = "error";
    effectiveError =
      `Read ${totalSkipped.toLocaleString()} source rows but could not map any geometry. ` +
      `Likely cause: unsupported coordinate/geometry columns for ${entry.dataset_id}.`;
  } else if (
    !syncError && !hasMore && cumulativeInserted === 0 && totalSkipped === 0 && sourceCount === 0
  ) {
    effectiveStatus = "skipped";
    effectiveError =
      `No ingestible API resource found for ${entry.dataset_id} ` +
      `(source only exposes PDF/zip/non-tabular files).`;
  }

  await supabase.from(registryTable).update({
    last_sync_at: finalTs,
    last_sync_status: effectiveStatus,
    last_sync_rows: cumulativeInserted,
    last_sync_error: effectiveError,
    sync_cursor: hasMore
      ? { partition_start: nextPartitionStart, skip_features: nextSkipFeatures, saved_at: finalTs }
      : null,
    updated_at: finalTs,
  }).eq("id", registryId);

  // Self-continue if more partitions remain
  if (hasMore && !syncError && authHeader) {
    console.log(`[ingest] Partial complete (${cumulativeInserted} cumulative). Continuing from partition ${nextPartitionStart}, skip ${nextSkipFeatures}…`);
    // Give the edge runtime breathing room before self-continuation to avoid
    // 503 "Service is temporarily unavailable" from worker contention.
    await sleep(3000);
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      await fetch(`${supabaseUrl}/functions/v1/npg-dataset-ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": authHeader },
        body: JSON.stringify({
          registry_id: registryId,
          mode: "export",
          partition_start: nextPartitionStart,
          skip_features: nextSkipFeatures,
          chunk_size: chunkSize || getDefaultChunkRowLimit(storageTable),
        }),
      });
      console.log(`[ingest] Self-continuation dispatched for partition_start=${nextPartitionStart}, skip_features=${nextSkipFeatures}`);
    } catch (e) {
      console.error(`[ingest] Self-continuation failed:`, e);
    }
  }

  // Audit on completion or error
  if (!hasMore || syncError) {
    await supabase.from("audit_log").insert({
      action: "npg_dataset_ingest",
      user_id: userId,
      meta_json: { registry_id: registryId, dataset_id: entry.dataset_id, mode, inserted: cumulativeInserted, skipped: totalSkipped, error: syncError },
    });
  }

  console.log(`[ingest] Done. Dataset: ${entry.dataset_id}, Chunk inserted: ${totalInserted}, Cumulative: ${cumulativeInserted}, Status: ${finalStatus}`);
}

// ─── Partitioned Records Ingestion (for datasets >10k) ─────────────────────

async function ingestPartition(
  supabase: any, entry: any, layerRow: any, storageTable: string,
  apiKey: string | null, hexPrefix: string,
  opts: { where?: string; select?: string; order_by?: string },
): Promise<{ inserted: number; skipped: number }> {
  const baseUrl = entry.endpoint_records;
  // Opendatasoft wildcard: recordid like 'ab*' matches all records starting with "ab"
  const partitionWhere = `recordid like '${hexPrefix}*'`;
  const combinedWhere = opts.where ? `(${opts.where}) AND ${partitionWhere}` : partitionWhere;

  let offset = 0;
  const pageSize = 100; // Opendatasoft records API max per page
  let totalInserted = 0;
  let totalSkipped = 0;

  while (true) {
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("offset", String(offset));
    params.set("where", combinedWhere);
    if (opts.select) params.set("select", opts.select);
    if (opts.order_by) params.set("order_by", opts.order_by);

    const url = `${baseUrl}?${params.toString()}`;
    const resp = await fetchWithRetry(url, apiKey);

    if (resp.status === 403) {
      console.warn(`[ingest] 403 on partition ${hexPrefix} for ${entry.dataset_id}`);
      // Mark as skipped on first partition only
      if (hexPrefix === "00") {
        await supabase.from(getRegTable(entry.dno)).update({
          last_sync_status: "skipped",
          last_sync_error: "403 Forbidden — restricted dataset, API key may be required",
          last_sync_at: new Date().toISOString(),
        }).eq("id", entry.id);
      }
      return { inserted: 0, skipped: 0 };
    }

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Records API error ${resp.status}: ${errText.slice(0, 200)}`);
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
    if (records.length < pageSize || offset >= totalCount) break;

    // Safety: offset+limit must be <= 10000 for Opendatasoft
    if (offset + pageSize > 9900) {
      console.warn(`[ingest] Partition ${hexPrefix}: approaching 10k cap at offset ${offset}, stopping partition`);
      break;
    }

    await sleep(50);
  }

  return { inserted: totalInserted, skipped: totalSkipped };
}

function getRegTable(dno: string): string {
  return ["CADENT", "NGN", "SGN", "WWU"].includes(dno) ? "gas_dataset_registry" : "dno_dataset_registry";
}

// ─── Streaming GeoJSON Feature Extractor ────────────────────────────────────

async function* streamGeoJsonFeatures(resp: Response): AsyncGenerator<any> {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let inFeatures = false;
  let depth = 0;
  let featureStart = -1;
  let inString = false;
  let escape = false;

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
      inString = false;
      escape = false;
    }

    let i = 0;
    while (i < buffer.length) {
      const ch = buffer[i];
      if (escape) {
        escape = false;
      } else if (inString) {
        if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
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

// ─── GeoJSON Export Ingestion (Streaming, for medium datasets) ──────────────

async function ingestViaGeoJsonExport(
  supabase: any, entry: any, layerRow: any, storageTable: string, apiKey: string | null,
  options: { skipFeatures?: number; maxFeatures?: number } = {},
): Promise<{ inserted: number; skipped: number; hasMore?: boolean; nextSkipFeatures?: number }> {
  const url = entry.endpoint_export_geojson;
  console.log(`[ingest] Fetching GeoJSON export (streaming): ${url}`);

  const resp = await fetchWithRetry(url, apiKey);
  if (!resp.ok) throw new Error(`GeoJSON export failed: HTTP ${resp.status}`);

  const batchSize = getBatchSize(storageTable);
  let totalInserted = 0;
  let totalSkipped = 0;
  let batch: any[] = [];
  const skipFeatures = Math.max(0, Number(options.skipFeatures || 0));
  const maxFeatures = Math.max(0, Number(options.maxFeatures || 0));
  let seen = 0;
  let processed = 0;
  let hasMore = false;

  for await (const feature of streamGeoJsonFeatures(resp)) {
    if (seen < skipFeatures) { seen++; continue; }
    seen++;
    if (maxFeatures > 0 && processed >= maxFeatures) { hasMore = true; break; }
    processed++;
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

  try { await resp.body?.cancel(); } catch { /* ignore */ }
  const nextSkipFeatures = skipFeatures + processed;
  console.log(`[ingest] GeoJSON streaming done: ${totalInserted} inserted, ${totalSkipped} skipped, hasMore=${hasMore}, nextSkip=${nextSkipFeatures}`);
  return { inserted: totalInserted, skipped: totalSkipped, hasMore, nextSkipFeatures: hasMore ? nextSkipFeatures : undefined };
}

// ─── CSV Export Ingestion (Streaming) ───────────────────────────────────────

async function ingestViaCsvExport(
  supabase: any, entry: any, layerRow: any, storageTable: string, apiKey: string | null,
  options: { skipFeatures?: number; maxFeatures?: number } = {},
): Promise<IngestResult> {
  const url = entry.endpoint_export_csv;
  console.log(`[ingest] Fetching CSV export (streaming): ${url}`);

  const resp = await fetchWithRetry(url, apiKey);
  if (!resp.ok) throw new Error(`CSV export failed: HTTP ${resp.status}`);

  let headers: string[] | null = null;
  const batchSize = getBatchSize(storageTable);
  let totalInserted = 0;
  let totalSkipped = 0;
  let batch: any[] = [];
  const skipFeatures = Math.max(0, Number(options.skipFeatures || 0));
  const maxFeatures = Math.max(0, Number(options.maxFeatures || 0));
  let dataRowIndex = 0;
  let processedRows = 0;
  let hitLimit = false;

  for await (const values of streamCsvRows(resp)) {
    if (values.length === 0 || values.every((v) => !String(v || "").trim())) continue;
    if (!headers) {
      headers = values.map(cleanHeader);
      continue;
    }

    dataRowIndex++;
    if (dataRowIndex <= skipFeatures) continue;
    if (maxFeatures > 0 && processedRows >= maxFeatures) {
      hitLimit = true;
      break;
    }
    processedRows++;

    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
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

  if (batch.length > 0) {
    const { data: inserted, error } = await supabase.rpc("batch_insert_geo_features", {
      _table_name: storageTable, _features_json: JSON.stringify(batch),
    });
    if (error) throw new Error(`Batch insert error: ${error.message}`);
    totalInserted += inserted ?? batch.length;
  }

  console.log(`[ingest] CSV streaming done: ${totalInserted} inserted, ${totalSkipped} skipped, processed ${processedRows}, hasMore=${hitLimit}`);
  return {
    inserted: totalInserted,
    skipped: totalSkipped,
    hasMore: hitLimit,
    nextSkipFeatures: skipFeatures + processedRows,
    consumedRows: dataRowIndex,
    processedRows,
  };
}

async function* streamCsvRows(resp: Response): AsyncGenerator<string[]> {
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let pendingQuote = false;

  const emitField = () => {
    row.push(field);
    field = "";
  };

  const emitRow = () => {
    emitField();
    const out = row;
    row = [];
    return out;
  };

  while (true) {
    const { done, value } = await reader.read();
    const chunk = done ? "" : decoder.decode(value, { stream: true });

    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];

      if (pendingQuote) {
        pendingQuote = false;
        if (ch === '"') {
          field += '"';
          continue;
        }
        inQuotes = false;
      }

      if (inQuotes) {
        if (ch === '"') pendingQuote = true;
        else field += ch;
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
      } else if (ch === "," || ch === ";") {
        emitField();
      } else if (ch === "\n") {
        yield emitRow();
      } else if (ch !== "\r") {
        field += ch;
      }
    }

    if (done) break;
  }

  if (pendingQuote) {
    pendingQuote = false;
    inQuotes = false;
  }
  if (field.length > 0 || row.length > 0) yield emitRow();
}

// ─── Paginated Records Ingestion (for small datasets <10k) ──────────────────

async function ingestViaRecords(
  supabase: any, entry: any, layerRow: any, storageTable: string, apiKey: string | null,
  opts: { where?: string; select?: string; order_by?: string }
): Promise<{ inserted: number; skipped: number }> {
  const baseUrl = entry.endpoint_records;
  const pageSize = 100;
  let offset = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  while (true) {
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("offset", String(offset));
    if (opts.where) params.set("where", opts.where);
    if (opts.select) params.set("select", opts.select);
    if (opts.order_by) params.set("order_by", opts.order_by);

    const url = `${baseUrl}?${params.toString()}`;
    const resp = await fetchWithRetry(url, apiKey);

    if (resp.status === 403) {
      console.warn(`[ingest] 403 Forbidden for ${entry.dataset_id} — marking as skipped`);
      await supabase.from(getRegTable(entry.dno)).update({
        last_sync_status: "skipped",
        last_sync_error: "403 Forbidden — restricted dataset",
        last_sync_at: new Date().toISOString(),
      }).eq("id", entry.id);
      return { inserted: 0, skipped: 0 };
    }
    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Records API error ${resp.status}: ${errText.slice(0, 200)}`);
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
        _table_name: storageTable, _features_json: JSON.stringify(mapped),
      });
      if (error) throw new Error(`Batch insert error: ${error.message}`);
      totalInserted += inserted ?? mapped.length;
    }

    offset += records.length;
    const totalCount = data.total_count || 0;
    if (records.length < pageSize || offset >= totalCount) break;
    if (offset + pageSize > 9900) {
      console.warn(`[ingest] Approaching 10k offset cap at ${offset}`);
      break;
    }

    await sleep(100);
  }

  return { inserted: totalInserted, skipped: totalSkipped };
}

// ─── CKAN (NGED) Ingestion ───────────────────────────────────────────────────

async function ingestViaCkan(
  supabase: any, entry: any, layerRow: any, storageTable: string, apiKey: string | null,
  options: { skipFeatures?: number; maxFeatures?: number } = {},
): Promise<IngestResult> {
  const isSsenDistribution = entry.dno === "SSEN" && String(entry.dataset_id || "").startsWith("dx-");
  const recordsUrl = String(entry.endpoint_records || "");
  const hasDatastoreRecordsUrl = !!recordsUrl && (recordsUrl.includes("datastore_search") || recordsUrl.includes("/api/3/action/"));

  if (isSsenDistribution) {
    const resourceUrls = getSsenDistributionResourceUrls(entry, storageTable);
    if (resourceUrls.length > 0) {
      let inserted = 0;
      let skipped = 0;
      let remainingSkip = Math.max(0, Number(options.skipFeatures || 0));
      const maxFeatures = Math.max(0, Number(options.maxFeatures || 0));
      let processedRows = 0;
      console.log(`[ingest] CKAN: Using ${resourceUrls.length} SSEN Distribution resource(s) for ${entry.dataset_id}`);
      for (const resource of resourceUrls) {
        if (maxFeatures > 0 && processedRows >= maxFeatures) {
          return {
            inserted,
            skipped,
            hasMore: true,
            nextSkipFeatures: Math.max(0, Number(options.skipFeatures || 0)) + processedRows,
            processedRows,
          };
        }
        const scopedEntry = {
          ...entry,
          endpoint_export_geojson: resource.type === "geojson" ? resource.url : null,
          endpoint_export_csv: resource.type === "csv" ? resource.url : null,
        };
        const result = resource.type === "geojson"
          ? await ingestViaCkanGeoJson(supabase, scopedEntry, layerRow, storageTable, apiKey)
          : await ingestViaCsvExport(supabase, scopedEntry, layerRow, storageTable, apiKey, {
            skipFeatures: remainingSkip,
            maxFeatures: maxFeatures > 0 ? maxFeatures - processedRows : 0,
          });
        inserted += result.inserted;
        skipped += result.skipped;
        processedRows += result.processedRows ?? (result.inserted + result.skipped);
        remainingSkip = Math.max(0, remainingSkip - (result.consumedRows ?? 0));
        if (result.hasMore) {
          return {
            inserted,
            skipped,
            hasMore: true,
            nextSkipFeatures: Math.max(0, Number(options.skipFeatures || 0)) + processedRows,
            processedRows,
          };
        }
      }
      return { inserted, skipped, hasMore: false, nextSkipFeatures: Math.max(0, Number(options.skipFeatures || 0)) + processedRows, processedRows };
    }
  }

  if (entry.endpoint_export_geojson) {
    console.log(`[ingest] CKAN: Using GeoJSON resource for ${entry.dataset_id}`);
    try {
      return await ingestViaCkanGeoJson(supabase, entry, layerRow, storageTable, apiKey);
    } catch (err) {
      console.warn(`[ingest] CKAN GeoJSON failed: ${err}, trying datastore...`);
    }
  }

  if (entry.endpoint_records && (!isSsenDistribution || hasDatastoreRecordsUrl)) {
    console.log(`[ingest] CKAN: Using datastore_search for ${entry.dataset_id}`);
    return await ingestViaCkanDatastore(supabase, entry, layerRow, storageTable, apiKey);
  }

  console.log(`[ingest] CKAN: No JSON/GeoJSON endpoint for ${entry.dataset_id} — marking as skipped (API-only mode)`);
  await supabase.from("dno_dataset_registry").update({
    last_sync_status: "skipped",
    last_sync_error: "No JSON/GeoJSON API endpoint available (CSV ingestion disabled)",
    last_sync_at: new Date().toISOString(),
  }).eq("id", entry.id);
  return { inserted: 0, skipped: 0 };
}

function getSsenDistributionResourceUrls(entry: any, storageTable: string): Array<{ type: "geojson" | "csv"; url: string }> {
  const resources = Array.isArray(entry.fields_json) ? entry.fields_json : [];
  const candidates = resources
    .map((r: any) => ({
      type: String(r.type || "").toLowerCase(),
      url: String(r.url || ""),
      label: String(r.label || r.name || ""),
    }))
    .filter((r) => r.url.startsWith("https://data-api.ssen.co.uk/"));

  const datasetId = String(entry.dataset_id || "").toLowerCase();
  // SSEN Distribution serves data as HTTP CSV/GeoJSON files from data-api.ssen.co.uk
  // (this IS their API — no JSON records endpoint exists). Prefer GeoJSON, fall back to CSV.
  const wantsPolygon = storageTable === "geo_polygons" || storageTable === "geo_constraints";
  let matches = candidates.filter((r) => r.type === "geojson");
  if (matches.length === 0) {
    matches = candidates.filter((r) => r.type === "csv");
  }

  // The SSEN ESA datasets keep older and current-year resources in one package.
  // Prefer the current 2025 licence-area resources, and take both SEPD + SHEPD.
  if (datasetId.includes("substation") && matches.some((r) => /2025/.test(r.label + r.url))) {
    matches = matches.filter((r) => /2025/.test(r.label + r.url));
  }

  const seen = new Set<string>();
  return matches
    .filter((r) => {
      if (!r.url || seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    })
    .slice(0, 4)
    .map((r) => ({ type: (r.type === "geojson" ? "geojson" : "csv") as "geojson" | "csv", url: r.url }));
}

async function ingestViaCkanGeoJson(
  supabase: any, entry: any, layerRow: any, storageTable: string, apiKey: string | null
): Promise<{ inserted: number; skipped: number }> {
  const url = entry.endpoint_export_geojson;
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = apiKey.startsWith("Apikey ") ? apiKey : `Apikey ${apiKey}`;

  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`GeoJSON fetch failed: HTTP ${resp.status}`);

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

  return { inserted: totalInserted, skipped: totalSkipped };
}

async function ingestViaCkanDatastore(
  supabase: any, entry: any, layerRow: any, storageTable: string, apiKey: string | null
): Promise<{ inserted: number; skipped: number }> {
  const baseUrl = entry.endpoint_records;
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = apiKey.startsWith("Apikey ") ? apiKey : `Apikey ${apiKey}`;

  let offset = 0;
  const limit = 100;
  let totalInserted = 0;
  let totalSkipped = 0;

  while (true) {
    const url = `${baseUrl}&limit=${limit}&offset=${offset}`;
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
        _table_name: storageTable, _features_json: JSON.stringify(mapped),
      });
      if (error) throw new Error(`Batch insert error: ${error.message}`);
      totalInserted += inserted ?? mapped.length;
    }

    offset += records.length;
    if (records.length < limit) break;
    if (offset >= 500000) {
      console.warn(`[ingest] CKAN: Safety cap at ${offset} records`);
      break;
    }

    await sleep(200);
  }

  return { inserted: totalInserted, skipped: totalSkipped };
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
    name: props.name || props.site_name || props.psp_name || props["Substation Name"] || props.number || props.outageid || null,
    asset_id: props.asset_id || props.site_id || props.circuit_id || props.number || props.outageid || null,
    attrs_json: props,
    status: props.status || "active",
    capacity_kw: parseNum(props.firm_capacity_kw || props.capacity_kw || props.firm_cap),
    demand_kw: parseNum(props.max_demand_kw || props.demand_kw || props.maxdemand),
    headroom_kw: parseNum(props.transformer_headroom_kw || props.headroom_kw || props.demhr),
    utilisation_pct: parseNum(props.utilisation_pct || props.fault_level_),
    voltage_kv: normaliseVoltageKv(props.voltage_kv || props.pvoltage || props.hv_voltage || props.voltage),
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
    name: rec.name || rec.psp_name || rec.site_name || rec.number || rec.outageid || null,
    asset_id: rec.asset_id || rec.site_id || rec.circuit_id || rec.number || rec.outageid || null,
    attrs_json: attrs,
    status: rec.status || "active",
    capacity_kw: parseNum(rec.firm_cap || rec.capacity_kw),
    demand_kw: parseNum(rec.maxdemand || rec.demand_kw),
    headroom_kw: parseNum(rec.demhr || rec.headroom_kw),
    utilisation_pct: parseNum(rec.fault_level_ || rec.utilisation_pct),
    voltage_kv: (() => {
      const kv = normaliseVoltageKv(rec.voltage_kv || rec.pvoltage || rec.nominal_voltage_kv || rec["voltage_kv"] || rec.hv_voltage);
      if (kv != null) return kv;
      const v = parseNum(rec.voltage || rec.voltage_v || rec.operating_voltage || rec.nominal_voltage);
      if (v != null) return v >= 1000 ? v / 1000 : v;
      // Derive from layer slug (e.g. ukpn-lv-cables / ukpn-hv-cables / ukpn-ehv-cables)
      const slug = (layerRow?.slug || entry?.dataset_id || "").toLowerCase();
      if (slug.includes("ehv")) return 33;
      if (/\bhv\b/.test(slug) || slug.includes("11kv")) return 11;
      if (/\blv\b/.test(slug)) return 0.4;
      return null;
    })(),
    feeder_ref: rec.feeder_ref || rec.circuit_id || null,
    capacity_value: parseNum(rec.capacity_value),
    capacity_unit: rec.capacity_unit || null,
    capacity_flag: rec.capacity_flag || "unknown",
    constraint_type: rec.constraint_type || rec.type || null,
  };
}

function mapCkanRecordToRow(rec: any, entry: any, layerRow: any, storageTable: string): any | null {
  let geom: any = null;

  const lat = parseNum(rec.Latitude || rec.latitude || rec.lat || rec.LATITUDE);
  const lon = parseNum(rec.Longitude || rec.longitude || rec.lon || rec.lng || rec.LONGITUDE);
  const easting = parseNum(rec.Easting || rec.easting || rec.EASTING || rec.x);
  const northing = parseNum(rec.Northing || rec.northing || rec.NORTHING || rec.y);

  if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    geom = { type: "Point", coordinates: [lon, lat] };
  } else if (easting != null && northing != null && easting > 100000 && northing > 100000) {
    const wgs = bngToWgs84Approx(easting, northing);
    if (wgs) geom = { type: "Point", coordinates: [wgs.lon, wgs.lat] };
  }

  if (!geom && rec.geojson) {
    try {
      const g = typeof rec.geojson === "string" ? JSON.parse(rec.geojson) : rec.geojson;
      if (g.type && g.coordinates) geom = g;
    } catch {}
  }

  if (!geom) return null;

  geom = promoteGeometry(geom, storageTable);
  if (!geom) return null;

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
    voltage_kv: (() => {
      const kv = parseNum(rec.Voltage || rec.voltage_kv || rec["Voltage (kV)"]);
      if (kv != null) return kv;
      const v = parseNum(rec.voltage_v || rec["Voltage (V)"] || rec.OperatingVoltage);
      if (v != null) return v >= 1000 ? v / 1000 : v;
      const slug = (layerRow?.slug || entry?.dataset_id || "").toLowerCase();
      if (slug.includes("ehv")) return 33;
      if (/\bhv\b/.test(slug) || slug.includes("11kv")) return 11;
      if (/\blv\b/.test(slug)) return 0.4;
      return null;
    })(),
    feeder_ref: rec.FeederRef || rec.feeder_ref || rec.CircuitID || null,
    capacity_value: parseNum(rec.capacity_value),
    capacity_unit: rec.capacity_unit || null,
    capacity_flag: rec.capacity_flag || "unknown",
    constraint_type: rec.constraint_type || null,
  };
}

function mapCsvRowToFeature(row: any, entry: any, layerRow: any, storageTable: string): any | null {
  let geom: any = null;
  const datasetId = String(entry.dataset_id || "").toLowerCase();

  const easting = firstNum(row,
    "easting", "eastings", "Easting", "EASTING", "x", "X", "location_x_m",
    "Location (X-coordinate):\nEastings (where data is held)",
    "Location (X-coordinate): Eastings (where data is held)"
  ) ?? (() => {
    const mm = firstNum(row, "location_x_mm");
    return mm != null ? mm / 1000 : null;
  })();
  const northing = firstNum(row,
    "northing", "northings", "Northing", "NORTHING", "y", "Y", "location_y_m",
    "Location (y-coordinate):\nNorthings (where data is held)",
    "Location (y-coordinate): Northings (where data is held)"
  ) ?? (() => {
    const mm = firstNum(row, "location_y_mm");
    return mm != null ? mm / 1000 : null;
  })();

  const geoPoint = firstText(row, "geo_point_2d");
  const lat = firstNum(row, "lat", "latitude", "Latitude", "LATITUDE", "Location Latitude");
  const lon = firstNum(row, "lon", "lng", "longitude", "Longitude", "LONGITUDE", "Location Longitude");
  const geometryText = firstText(row, "geometry", "Geometry", "GEOMETRY", "geojson", "GeoJSON");

  if (geometryText) {
    geom = parseGeometryText(geometryText);
  }

  if (!geom && geoPoint) {
    const parts = String(geoPoint).split(",").map((s: string) => Number(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      geom = { type: "Point", coordinates: [parts[1], parts[0]] };
    }
  } else if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
    geom = { type: "Point", coordinates: [lon, lat] };
  }

  if (!geom && easting != null && northing != null) {
    const wgs = bngToWgs84Approx(easting, northing);
    if (wgs) geom = { type: "Point", coordinates: [wgs.lon, wgs.lat] };
  }

  if (!geom) return null;
  geom = promoteGeometry(geom, storageTable);
  if (!geom) return null;

  return {
    geom_geojson: JSON.stringify(geom),
    layer_id: entry.linked_layer_id,
    dno: entry.dno,
    name: firstText(row, "name", "site_name", "psp_name", "Substation", "Primary", "PRIMARY_NAME_2025", "GSP_NAME", "Customer Site ", "locality", "number") || null,
    asset_id: datasetId === "dx-ssen-substation-data"
      ? null
      : firstText(row, "asset_id", "site_id", "AssetID", "number", "Unique ID", "Export MPAN / MSID", "Import MPAN / MSID") || null,
    attrs_json: row,
    status: firstText(row, "status", "Status", "Connection Status ") || "active",
    capacity_kw: parseNum(row.firm_capacity_kw || row.capacity_kw || row["Connected Generation (MW)"]) != null ? parseNum(row.firm_capacity_kw || row.capacity_kw || row["Connected Generation (MW)"])! * (row["Connected Generation (MW)"] ? 1000 : 1) : null,
    demand_kw: parseNum(row.max_demand_kw || row.demand_kw || row["Maximum Observed Gross Demand (MVA)"]) != null ? parseNum(row.max_demand_kw || row.demand_kw || row["Maximum Observed Gross Demand (MVA)"])! * (row["Maximum Observed Gross Demand (MVA)"] ? 1000 : 1) : null,
    headroom_kw: parseNum(row.headroom_kw || row["Estimated Demand Headroom (MVA)"]) != null ? parseNum(row.headroom_kw || row["Estimated Demand Headroom (MVA)"])! * (row["Estimated Demand Headroom (MVA)"] ? 1000 : 1) : null,
    utilisation_pct: parseNum(row.utilisation_pct),
    voltage_kv: parseNum(row.voltage_kv || row["Voltage (kV)"] || row["Point of Connection (POC)\nVoltage (kV)"] || row["Point of Connection (POC) Voltage (kV)"]),
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

  geom.coordinates = stripZ(geom.coordinates);
  return geom;
}

function stripZ(coords: any): any {
  if (typeof coords[0] === "number") {
    return coords.slice(0, 2);
  }
  return coords.map(stripZ);
}

// Approximate BNG (OSGB36) to WGS84 conversion
function bngToWgs84Approx(e: number, n: number): { lat: number; lon: number } | null {
  const latApprox = (n - (-100000)) / 111320 + 49.0;
  const lonApprox = (e - 400000) / (111320 * Math.cos(54.0 * Math.PI / 180)) + (-2.0);
  if (latApprox < 49 || latApprox > 61 || lonApprox < -9 || lonApprox > 3) return null;
  return { lat: latApprox, lon: lonApprox };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function parseNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return isNaN(n) ? null : n;
}

function normaliseVoltageKv(v: any): number | null {
  const text = String(v ?? "").toLowerCase();
  const n = parseNum(text.replace(/kv|v/g, ""));
  if (n == null) return null;
  return text.includes("kv") || n < 1000 ? n : n / 1000;
}

function cleanHeader(header: string): string {
  return String(header || "").replace(/^\uFEFF/, "").trim();
}

function normaliseKey(key: string): string {
  return cleanHeader(key).toLowerCase().replace(/\s+/g, " ");
}

function firstText(row: Record<string, any>, ...keys: string[]): string | null {
  const normalised = new Map<string, any>();
  for (const [key, value] of Object.entries(row)) normalised.set(normaliseKey(key), value);
  for (const key of keys) {
    const direct = row[key];
    const value = direct ?? normalised.get(normaliseKey(key));
    if (value !== null && value !== undefined && String(value).trim() !== "") return String(value).trim();
  }
  return null;
}

function firstNum(row: Record<string, any>, ...keys: string[]): number | null {
  for (const key of keys) {
    const text = firstText(row, key);
    const num = parseNum(text);
    if (num != null) return num;
  }
  return null;
}

function parseGeometryText(value: string): any | null {
  const text = String(value || "").trim();
  if (!text) return null;
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      if (parsed?.type === "Feature") return parsed.geometry || null;
      if (parsed?.type && parsed?.coordinates) return parsed;
    } catch {}
  }
  if (/^MULTIPOLYGON\s*\(/i.test(text)) return parseWktMultiPolygon(text);
  if (/^POLYGON\s*\(/i.test(text)) return parseWktPolygon(text);
  if (/^MULTILINESTRING\s*\(/i.test(text)) return parseWktMultiLineString(text);
  if (/^LINESTRING\s*\(/i.test(text)) return parseWktLineString(text);
  if (/^POINT\s*\(/i.test(text)) return parseWktPoint(text);
  return null;
}

function parseWktPoint(wkt: string): any | null {
  const inner = extractFirstParen(wkt);
  const pair = parseCoordPair(inner);
  return pair ? { type: "Point", coordinates: pair } : null;
}

function parseWktLineString(wkt: string): any | null {
  const line = parseCoordList(extractFirstParen(wkt));
  return line.length ? { type: "LineString", coordinates: line } : null;
}

function parseWktMultiLineString(wkt: string): any | null {
  const inner = extractFirstParen(wkt);
  const lines = splitTopLevelGroups(inner).map((group) => parseCoordList(stripOuterParens(group))).filter((line) => line.length);
  return lines.length ? { type: "MultiLineString", coordinates: lines } : null;
}

function parseWktPolygon(wkt: string): any | null {
  const rings = parsePolygonBody(extractFirstParen(wkt));
  return rings.length ? { type: "Polygon", coordinates: rings } : null;
}

function parseWktMultiPolygon(wkt: string): any | null {
  const inner = extractFirstParen(wkt);
  const polygons = splitTopLevelGroups(inner)
    .map((group) => parsePolygonBody(stripSingleOuterParens(group)))
    .filter((poly) => poly.length);
  return polygons.length ? { type: "MultiPolygon", coordinates: polygons } : null;
}

function parsePolygonBody(body: string): number[][][] {
  const ringsBody = stripSingleOuterParens(body);
  return splitTopLevelGroups(ringsBody)
    .map((ring) => parseCoordList(stripSingleOuterParens(ring)))
    .filter((ring) => ring.length);
}

function parseCoordList(text: string): number[][] {
  return text.split(",").map(parseCoordPair).filter(Boolean) as number[][];
}

function parseCoordPair(text: string): number[] | null {
  const parts = String(text || "").trim().split(/\s+/).map(Number);
  return parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1]) ? [parts[0], parts[1]] : null;
}

function extractFirstParen(text: string): string {
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  return start >= 0 && end > start ? text.slice(start + 1, end) : "";
}

function stripOuterParens(text: string): string {
  let out = text.trim();
  while (out.startsWith("(") && out.endsWith(")")) {
    out = out.slice(1, -1).trim();
  }
  return out;
}

function stripSingleOuterParens(text: string): string {
  const out = text.trim();
  return outerParensWrapEntireString(out) ? out.slice(1, -1).trim() : out;
}

function outerParensWrapEntireString(text: string): boolean {
  if (!text.startsWith("(") || !text.endsWith(")")) return false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (depth === 0 && i < text.length - 1) return false;
  }
  return depth === 0;
}

function splitTopLevelGroups(text: string): string[] {
  const groups: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0 && start >= 0) {
        groups.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return groups;
}

async function fetchWithRetry(url: string, apiKey?: string | null, maxRetries = 3): Promise<Response> {
  let effectiveUrl = url;
  const headers: Record<string, string> = {};
  if (apiKey && !url.includes("apikey=")) {
    const rawKey = apiKey.startsWith("Apikey ") ? apiKey.slice(7) : apiKey;
    headers["Authorization"] = `Apikey ${rawKey}`;
    const separator = url.includes("?") ? "&" : "?";
    effectiveUrl = `${url}${separator}apikey=${encodeURIComponent(rawKey)}`;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(effectiveUrl, { headers });
      if (resp.status === 429) {
        const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`[ingest] Rate limited, backing off ${Math.round(backoff)}ms`);
        await sleep(backoff);
        continue;
      }
      if (!resp.ok && attempt < maxRetries) {
        await resp.text();
        await sleep(Math.pow(2, attempt) * 500);
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

function getDefaultChunkRowLimit(storageTable: string): number {
  switch (storageTable) {
    case "geo_polygons":
    case "geo_constraints":
      return 750;
    case "geo_feeders":
    case "geo_cables":
      return 2000;
    default:
      return 5000;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
