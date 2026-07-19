import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CORS = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/* ---------------- Column detection ---------------- */

type CanonicalKey =
  | "site_name" | "address" | "postcode" | "uprn"
  | "lat" | "lng" | "client_ref" | "charger_type"
  | "proposed_kw" | "kw_per_socket" | "socket_count" | "dno" | "lpa" | "notes";

const SYNONYMS: Record<CanonicalKey, string[]> = {
  site_name: ["site name", "name", "site", "location name", "site title"],
  address: ["address", "site address", "street", "location", "full address"],
  postcode: ["postcode", "post code", "zip", "postal code", "pc"],
  uprn: ["uprn"],
  lat: ["lat", "latitude", "y"],
  lng: ["lng", "long", "longitude", "lon", "x"],
  client_ref: ["client ref", "client reference", "reference", "ref", "site ref", "external id"],
  charger_type: ["charger", "charger type", "type", "ev type", "connector"],
  proposed_kw: ["total kw", "site kw", "proposed kw", "total demand", "site load", "total site kw", "kva"],
  kw_per_socket: ["kw per socket", "kw each", "kw/socket", "socket kw", "socket power", "power per socket", "power rating", "rating", "charger kw", "charger power", "kw", "power"],
  socket_count: ["sockets", "socket count", "chargers", "no. of chargers", "num chargers"],
  dno: ["dno", "network operator"],
  lpa: ["lpa", "local authority", "council"],
  notes: ["notes", "comments", "remarks"],
};

function detectMapping(headers: string[]): Record<string, CanonicalKey | null> {
  const out: Record<string, CanonicalKey | null> = {};
  const usedKeys = new Set<CanonicalKey>();
  for (const h of headers) {
    const norm = h.toLowerCase().trim().replace(/[._\-]+/g, " ").replace(/\s+/g, " ");
    let match: CanonicalKey | null = null;
    for (const [key, list] of Object.entries(SYNONYMS) as [CanonicalKey, string[]][]) {
      if (usedKeys.has(key)) continue;
      if (list.some((s) => norm === s || norm.includes(s))) {
        match = key;
        break;
      }
    }
    if (match) usedKeys.add(match);
    out[h] = match;
  }
  return out;
}

/* ---------------- Row mapping + validation ---------------- */

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;

function applyMapping(row: Record<string, unknown>, mapping: Record<string, CanonicalKey | null>) {
  const mapped: Record<string, unknown> = {};
  for (const [header, canonical] of Object.entries(mapping)) {
    if (!canonical) continue;
    const v = row[header];
    if (v === undefined || v === null || v === "") continue;
    mapped[canonical] = typeof v === "string" ? v.trim() : v;
  }
  return mapped;
}

function normalizeCoords(lat: unknown, lng: unknown): { lat?: number; lng?: number; swapped?: boolean } {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return {};
  // UK envelope
  const inUK = (y: number, x: number) => y >= 49 && y <= 61 && x >= -8.7 && x <= 2;
  if (inUK(la, ln)) return { lat: la, lng: ln };
  if (inUK(ln, la)) return { lat: ln, lng: la, swapped: true };
  return { lat: la, lng: ln };
}

function validateRow(mapped: Record<string, any>): { status: "ok" | "warning" | "error"; errors: string[]; warnings: string[]; dedupe_key: string | null; lat?: number; lng?: number } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!mapped.site_name && !mapped.address) errors.push("Missing site name and address");
  if (mapped.postcode && !UK_POSTCODE.test(String(mapped.postcode))) warnings.push("Postcode format looks invalid");
  if (mapped.proposed_kw !== undefined) {
    const kw = Number(mapped.proposed_kw);
    if (!Number.isFinite(kw)) errors.push("Proposed kW is not a number");
    else if (kw <= 0 || kw > 20000) warnings.push("Proposed kW outside expected range");
    else mapped.proposed_kw = kw;
  }
  if (mapped.kw_per_socket !== undefined) {
    const kw = Number(mapped.kw_per_socket);
    if (!Number.isFinite(kw)) errors.push("kW per socket is not a number");
    else if (kw <= 0 || kw > 1000) warnings.push("kW per socket outside expected range");
    else mapped.kw_per_socket = kw;
  }
  if (mapped.socket_count !== undefined) {
    const s = parseInt(String(mapped.socket_count), 10);
    if (Number.isFinite(s)) mapped.socket_count = s; else warnings.push("Socket count is not a whole number");
  }
  // If per-socket kW is provided, derive the total site kW so downstream summaries
  // (and the sites.proposed_kw column) reflect actual site demand rather than a
  // single-socket rating that was accidentally treated as total.
  if (typeof mapped.kw_per_socket === "number") {
    const qty = typeof mapped.socket_count === "number" && mapped.socket_count > 0 ? mapped.socket_count : 1;
    const derived = Number((mapped.kw_per_socket * qty).toFixed(2));
    if (mapped.proposed_kw === undefined) {
      mapped.proposed_kw = derived;
    } else if (Math.abs(Number(mapped.proposed_kw) - derived) > 0.5) {
      warnings.push(`Total kW (${mapped.proposed_kw}) differs from ${qty} × ${mapped.kw_per_socket}kW per socket (${derived}) — using per-socket total`);
      mapped.proposed_kw = derived;
    }
  }

  let lat: number | undefined;
  let lng: number | undefined;
  if (mapped.lat !== undefined && mapped.lng !== undefined) {
    const c = normalizeCoords(mapped.lat, mapped.lng);
    if (c.lat === undefined) errors.push("Coordinates could not be parsed");
    else {
      lat = c.lat; lng = c.lng;
      if (c.swapped) warnings.push("Lat/Lng appeared swapped — auto-corrected");
      mapped.lat = lat; mapped.lng = lng;
    }
  } else if (!mapped.postcode && !mapped.address) {
    warnings.push("No postcode or coordinates — geocoding needed");
  }

  const dedupeParts = [
    mapped.uprn ? `uprn:${String(mapped.uprn).trim()}` : null,
    mapped.postcode && mapped.address ? `pc:${String(mapped.postcode).replace(/\s+/g, "").toUpperCase()}|addr:${String(mapped.address).toLowerCase().replace(/\s+/g, " ").trim()}` : null,
  ].filter(Boolean);
  const dedupe_key = dedupeParts[0] as string | null;

  const status: "ok" | "warning" | "error" = errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ok";
  return { status, errors, warnings, dedupe_key, lat, lng };
}

/* ---------------- File parsing ---------------- */

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const splitLine = (line: string) => {
    const out: string[] = [];
    let cur = ""; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
      }
    }
    out.push(cur);
    return out;
  };
  const headers = splitLine(lines[0]).map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = (cells[idx] ?? "").trim(); });
    rows.push(row);
  }
  return { headers, rows };
}

async function parseXlsx(bytes: Uint8Array): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  const wb = XLSX.read(bytes, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
  const headers = json.length > 0 ? Object.keys(json[0]) : [];
  return { headers, rows: json };
}

/* ---------------- Auth helpers ---------------- */

async function getAuth(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user) return null;
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  return { userId: data.user.id, userClient, admin };
}

async function assertBatchAccess(admin: SupabaseClient, batchId: string, userId: string) {
  const { data, error } = await admin.from("import_batches").select("*").eq("id", batchId).maybeSingle();
  if (error || !data) return null;
  if (data.created_by !== userId) {
    const { data: staff } = await admin.rpc("is_gridwise_staff", { _user_id: userId });
    if (!staff) return null;
  }
  return data;
}

async function audit(admin: SupabaseClient, batchId: string, actorId: string, action: string, diff: unknown = {}) {
  await admin.from("import_audit").insert({ batch_id: batchId, actor_id: actorId, action, diff_json: diff as any });
}

/* ---------------- Handlers ---------------- */

async function handleParse(req: Request, ctx: NonNullable<Awaited<ReturnType<typeof getAuth>>>) {
  const body = await req.json();
  const { file_path, source, filename, pasted_text } = body as { file_path?: string; source: string; filename?: string; pasted_text?: string };
  if (!["csv", "xlsx", "paste"].includes(source)) return json({ error: `Source '${source}' not yet supported in Phase A` }, 400);

  const { data: orgId } = await ctx.admin.rpc("get_user_org_id", { _user_id: ctx.userId });

  let headers: string[] = [];
  let rows: Record<string, unknown>[] = [];

  if (source === "paste") {
    if (!pasted_text) return json({ error: "pasted_text required" }, 400);
    const parsed = parseCsv(pasted_text);
    headers = parsed.headers; rows = parsed.rows;
  } else {
    if (!file_path) return json({ error: "file_path required" }, 400);
    const dl = await ctx.admin.storage.from("imports").download(file_path);
    if (dl.error || !dl.data) return json({ error: `Cannot read upload: ${dl.error?.message ?? "not found"}` }, 400);
    const buf = new Uint8Array(await dl.data.arrayBuffer());
    if (source === "csv") {
      const text = new TextDecoder("utf-8").decode(buf);
      const parsed = parseCsv(text);
      headers = parsed.headers; rows = parsed.rows;
    } else {
      const parsed = await parseXlsx(buf);
      headers = parsed.headers; rows = parsed.rows;
    }
  }

  if (rows.length === 0) return json({ error: "No data rows found in file" }, 400);
  if (rows.length > 10000) return json({ error: "File exceeds 10,000 rows" }, 400);

  const mapping = detectMapping(headers);

  const { data: batch, error: batchErr } = await ctx.admin.from("import_batches").insert({
    org_id: orgId ?? null,
    created_by: ctx.userId,
    source,
    filename: filename ?? null,
    file_path: file_path ?? null,
    mapping_json: mapping,
    total_rows: rows.length,
    status: "draft",
  }).select().single();
  if (batchErr) return json({ error: batchErr.message }, 500);

  const rowInserts = rows.map((r, i) => ({
    batch_id: batch.id,
    row_index: i,
    raw_json: r,
    mapped_json: applyMapping(r, mapping),
    status: "pending",
  }));

  for (let i = 0; i < rowInserts.length; i += 500) {
    const chunk = rowInserts.slice(i, i + 500);
    const { error } = await ctx.admin.from("import_rows").insert(chunk);
    if (error) return json({ error: `Row insert failed: ${error.message}` }, 500);
  }

  await audit(ctx.admin, batch.id, ctx.userId, "create", { source, total_rows: rows.length });
  return json({ batch_id: batch.id, headers, mapping, total_rows: rows.length });
}

async function handleRemap(req: Request, ctx: NonNullable<Awaited<ReturnType<typeof getAuth>>>) {
  const { batch_id, mapping } = await req.json();
  const batch = await assertBatchAccess(ctx.admin, batch_id, ctx.userId);
  if (!batch) return json({ error: "Batch not found" }, 404);

  await ctx.admin.from("import_batches").update({ mapping_json: mapping }).eq("id", batch_id);

  const { data: allRows } = await ctx.admin.from("import_rows").select("id, raw_json").eq("batch_id", batch_id);
  if (allRows) {
    for (const r of allRows) {
      const mapped = applyMapping(r.raw_json as Record<string, unknown>, mapping);
      await ctx.admin.from("import_rows").update({ mapped_json: mapped, status: "pending", errors_json: [], warnings_json: [] }).eq("id", r.id);
    }
  }
  await audit(ctx.admin, batch_id, ctx.userId, "remap", { mapping });
  return json({ ok: true, updated: allRows?.length ?? 0 });
}

async function handleValidate(req: Request, ctx: NonNullable<Awaited<ReturnType<typeof getAuth>>>) {
  const { batch_id } = await req.json();
  const batch = await assertBatchAccess(ctx.admin, batch_id, ctx.userId);
  if (!batch) return json({ error: "Batch not found" }, 404);

  await ctx.admin.from("import_batches").update({ status: "validating" }).eq("id", batch_id);

  const { data: rows } = await ctx.admin.from("import_rows").select("id, mapped_json").eq("batch_id", batch_id);
  if (!rows) return json({ error: "No rows" }, 500);

  // Load existing sites for dedupe lookup (postcode index)
  const dedupeKeys = new Set<string>();
  const seenInBatch = new Map<string, string>();

  let ok = 0, warn = 0, err = 0, dupe = 0;

  for (const r of rows) {
    const mapped = { ...(r.mapped_json as Record<string, any>) };
    const v = validateRow(mapped);
    let status: string = v.status;
    if (v.dedupe_key) {
      if (seenInBatch.has(v.dedupe_key)) {
        status = "duplicate";
        v.warnings.push(`Duplicate of row ${seenInBatch.get(v.dedupe_key)}`);
      } else {
        seenInBatch.set(v.dedupe_key, r.id);
      }
      dedupeKeys.add(v.dedupe_key);
    }
    if (status === "ok") ok++;
    else if (status === "warning") warn++;
    else if (status === "duplicate") dupe++;
    else if (status === "error") err++;

    await ctx.admin.from("import_rows").update({
      mapped_json: mapped,
      status,
      errors_json: v.errors,
      warnings_json: v.warnings,
      dedupe_key: v.dedupe_key,
      lat: v.lat ?? null,
      lng: v.lng ?? null,
    }).eq("id", r.id);
  }

  await ctx.admin.from("import_batches").update({
    status: "ready",
    error_rows: err,
    duplicate_rows: dupe,
    summary_json: { ok, warn, err, dupe },
  }).eq("id", batch_id);

  await audit(ctx.admin, batch_id, ctx.userId, "validate", { ok, warn, err, dupe });
  return json({ ok, warnings: warn, errors: err, duplicates: dupe });
}

async function geocodePostcode(pc: string): Promise<{ lat: number; lng: number } | null> {
  const url = `https://api.postcodes.io/postcodes/${encodeURIComponent(pc.replace(/\s+/g, ""))}`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    if (j?.result?.latitude && j?.result?.longitude) return { lat: j.result.latitude, lng: j.result.longitude };
    return null;
  } catch { return null; }
}

async function handleGeocode(req: Request, ctx: NonNullable<Awaited<ReturnType<typeof getAuth>>>) {
  const { batch_id } = await req.json();
  const batch = await assertBatchAccess(ctx.admin, batch_id, ctx.userId);
  if (!batch) return json({ error: "Batch not found" }, 404);

  await ctx.admin.from("import_batches").update({ status: "geocoding" }).eq("id", batch_id);

  const { data: rows } = await ctx.admin.from("import_rows")
    .select("id, mapped_json, lat, lng")
    .eq("batch_id", batch_id)
    .is("lat", null);

  let succeeded = 0, failed = 0;
  const pcCache = new Map<string, { lat: number; lng: number } | null>();

  for (const r of (rows ?? [])) {
    const mapped = r.mapped_json as Record<string, any>;
    const pc = mapped.postcode ? String(mapped.postcode).trim() : "";
    if (!pc) { failed++; continue; }
    let hit = pcCache.get(pc);
    if (hit === undefined) {
      hit = await geocodePostcode(pc);
      pcCache.set(pc, hit);
    }
    if (hit) {
      succeeded++;
      mapped.lat = hit.lat; mapped.lng = hit.lng;
      await ctx.admin.from("import_rows").update({
        lat: hit.lat, lng: hit.lng, geocode_source: "postcodes.io", geocode_confidence: 0.8,
        mapped_json: mapped,
      }).eq("id", r.id);
    } else {
      failed++;
    }
  }

  await ctx.admin.from("import_batches").update({ status: "ready" }).eq("id", batch_id);
  await audit(ctx.admin, batch_id, ctx.userId, "geocode", { succeeded, failed });
  return json({ succeeded, failed });
}

async function handleApprove(req: Request, ctx: NonNullable<Awaited<ReturnType<typeof getAuth>>>) {
  const { batch_id } = await req.json();
  const batch = await assertBatchAccess(ctx.admin, batch_id, ctx.userId);
  if (!batch) return json({ error: "Batch not found" }, 404);
  if (batch.status === "approved") return json({ error: "Already approved" }, 400);
  if (batch.error_rows > 0) return json({ error: `Batch has ${batch.error_rows} errors — fix before approving` }, 400);

  await ctx.admin.from("import_batches").update({ status: "approving" }).eq("id", batch_id);

  const created: { entity_type: string; entity_id: string }[] = [];
  const track = async (entity_type: string, entity_id: string) => {
    created.push({ entity_type, entity_id });
    await ctx.admin.from("import_created_records").insert({ batch_id, entity_type, entity_id });
  };

  // Resolve or create client
  let clientId = batch.target_client_id as string | null;
  if (!clientId && batch.new_client_name) {
    const { data: c, error } = await ctx.admin.from("clients").insert({
      name: batch.new_client_name,
      tenant_org_id: batch.org_id,
      created_by: ctx.userId,
    }).select().single();
    if (error) { await ctx.admin.from("import_batches").update({ status: "failed" }).eq("id", batch_id); return json({ error: `Client create failed: ${error.message}` }, 500); }
    clientId = c.id;
    await track("client", c.id);
  }

  // Resolve or create programme
  let programmeId = batch.target_programme_id as string | null;
  if (!programmeId) {
    const cfg = (batch.new_programme_json ?? {}) as any;
    if (!clientId) { await ctx.admin.from("import_batches").update({ status: "failed" }).eq("id", batch_id); return json({ error: "Programme creation requires a client account" }, 400); }
    // Programme.account_id refers to accounts table. Look up or create an account for the client.
    let { data: acct } = await ctx.admin.from("accounts").select("id").eq("client_id", clientId).limit(1).maybeSingle();
    if (!acct) {
      const { data: newAcct, error } = await ctx.admin.from("accounts").insert({
        client_id: clientId,
        name: batch.new_client_name ?? "Default account",
      }).select().single();
      if (error) { await ctx.admin.from("import_batches").update({ status: "failed" }).eq("id", batch_id); return json({ error: `Account create failed: ${error.message}` }, 500); }
      acct = newAcct;
    }
    const { data: p, error } = await ctx.admin.from("programmes").insert({
      account_id: acct.id,
      name: cfg.name ?? `Import ${new Date().toISOString().slice(0, 10)}`,
      code: cfg.code ?? null,
      start_date: cfg.start_date ?? null,
      end_date: cfg.end_date ?? null,
      status: "planning",
      import_batch_id: batch_id,
    }).select().single();
    if (error) { await ctx.admin.from("import_batches").update({ status: "failed" }).eq("id", batch_id); return json({ error: `Programme create failed: ${error.message}` }, 500); }
    programmeId = p.id;
    await track("programme", p.id);
  }

  // Resolve or create work package
  let wpId = batch.target_wp_id as string | null;
  if (!wpId) {
    const cfg = (batch.new_wp_json ?? {}) as any;
    const { data: w, error } = await ctx.admin.from("work_packages").insert({
      programme_id: programmeId,
      name: cfg.name ?? `Imported Sites ${new Date().toISOString().slice(0, 10)}`,
      code: cfg.code ?? `WP-${Date.now().toString(36).toUpperCase()}`,
      status: "planning",
      created_by: ctx.userId,
      import_batch_id: batch_id,
    }).select().single();
    if (error) { await ctx.admin.from("import_batches").update({ status: "failed" }).eq("id", batch_id); return json({ error: `Work package create failed: ${error.message}` }, 500); }
    wpId = w.id;
    await track("work_package", w.id);
  }

  // Create sites
  const { data: rows } = await ctx.admin.from("import_rows")
    .select("id, mapped_json, lat, lng, status")
    .eq("batch_id", batch_id)
    .in("status", ["ok", "warning"]);

  let createdCount = 0;
  for (const r of (rows ?? [])) {
    const m = r.mapped_json as any;
    const siteName = m.site_name ?? m.address ?? `Site ${createdCount + 1}`;
    const insertRow: any = {
      site_name: String(siteName).slice(0, 255),
      postcode: m.postcode ?? null,
      proposed_kw: m.proposed_kw ?? null,
      site_type: m.charger_type ?? null,
      socket_count: m.socket_count ?? null,
      client_org: batch.new_client_name ?? null,
      status: "planning",
      created_by: ctx.userId,
      org_id: batch.org_id,
      import_batch_id: batch_id,
      import_row_id: r.id,
    };
    const { data: site, error } = await ctx.admin.from("sites").insert(insertRow).select().single();
    if (error) {
      await ctx.admin.from("import_rows").update({ status: "error", errors_json: [error.message] }).eq("id", r.id);
      continue;
    }
    // Create a canonical Socket Group so the phase-balance / PoC pipeline
    // treats imported sites the same as manually-entered ones.
    {
      const qty = Number(m.socket_count) > 0 ? Number(m.socket_count) : (m.kw_per_socket ? 1 : 0);
      let kwEach = Number(m.kw_per_socket);
      if (!Number.isFinite(kwEach) || kwEach <= 0) {
        // Fall back to total kW / sockets if only proposed_kw was supplied.
        if (Number(m.proposed_kw) > 0 && qty > 0) {
          kwEach = Number((Number(m.proposed_kw) / qty).toFixed(2));
        }
      }
      if (qty > 0 && Number.isFinite(kwEach) && kwEach > 0) {
        const phases = kwEach >= 10 ? 3 : 1;
        const { error: grpErr } = await ctx.admin.from("site_socket_groups").insert({
          site_id: site.id,
          quantity: qty,
          power_rating_kw: kwEach,
          phases,
          sort_order: 0,
        });
        if (grpErr) console.warn("socket group insert failed", grpErr.message);
      }
    }
    if (r.lat != null && r.lng != null) {
      // sites.geom is SRID 27700 — use RPC helper to transform WGS84 → BNG.
      const { error: geomErr } = await ctx.admin.rpc("set_site_geom_wgs84", {
        _site_id: site.id, _lng: r.lng, _lat: r.lat,
      });
      if (geomErr) console.warn("geom update failed", geomErr.message);
    }
    await track("site", site.id);
    createdCount++;

    const { error: linkErr } = await ctx.admin.from("wp_sites").insert({ work_package_id: wpId, site_id: site.id });
    if (!linkErr) await track("wp_site", site.id); // link tracked via site
    await ctx.admin.from("import_rows").update({ resolved_site_id: site.id, status: "ok" }).eq("id", r.id);
  }

  await ctx.admin.from("import_batches").update({
    status: "approved",
    approved_at: new Date().toISOString(),
    target_client_id: clientId,
    target_programme_id: programmeId,
    target_wp_id: wpId,
    summary_json: { ...(batch.summary_json ?? {}), sites_created: createdCount },
  }).eq("id", batch_id);

  await audit(ctx.admin, batch_id, ctx.userId, "approve", { sites_created: createdCount });
  return json({ ok: true, sites_created: createdCount, work_package_id: wpId, programme_id: programmeId, client_id: clientId });
}

async function handleRollback(req: Request, ctx: NonNullable<Awaited<ReturnType<typeof getAuth>>>) {
  const { batch_id } = await req.json();
  const batch = await assertBatchAccess(ctx.admin, batch_id, ctx.userId);
  if (!batch) return json({ error: "Batch not found" }, 404);

  const { data: recs } = await ctx.admin.from("import_created_records")
    .select("*").eq("batch_id", batch_id).order("created_at", { ascending: false });

  const order = ["wp_site", "site", "work_package", "programme", "client", "geo_point"];
  const sorted = [...(recs ?? [])].sort((a, b) => order.indexOf(a.entity_type) - order.indexOf(b.entity_type));

  const tableMap: Record<string, string> = {
    site: "sites", programme: "programmes", work_package: "work_packages",
    client: "clients", wp_site: "wp_sites", geo_point: "geo_points",
  };

  let removed = 0;
  for (const rec of sorted) {
    const tbl = tableMap[rec.entity_type];
    if (!tbl) continue;
    const col = rec.entity_type === "wp_site" ? "site_id" : "id";
    const { error } = await ctx.admin.from(tbl).delete().eq(col, rec.entity_id);
    if (!error) removed++;
  }

  await ctx.admin.from("import_batches").update({ status: "rolled_back", rolled_back_at: new Date().toISOString() }).eq("id", batch_id);
  await audit(ctx.admin, batch_id, ctx.userId, "rollback", { removed });
  return json({ ok: true, removed });
}

/* ---------------- Router ---------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const url = new URL(req.url);
    const action = url.pathname.split("/").pop() ?? "";
    const ctx = await getAuth(req);
    if (!ctx) return json({ error: "Unauthorized" }, 401);

    switch (action) {
      case "parse":    return await handleParse(req, ctx);
      case "remap":    return await handleRemap(req, ctx);
      case "validate": return await handleValidate(req, ctx);
      case "geocode":  return await handleGeocode(req, ctx);
      case "approve":  return await handleApprove(req, ctx);
      case "rollback": return await handleRollback(req, ctx);
      default: return json({ error: `Unknown action '${action}'` }, 400);
    }
  } catch (e) {
    console.error("import-wizard error", e);
    return json({ error: (e as Error).message }, 500);
  }
});