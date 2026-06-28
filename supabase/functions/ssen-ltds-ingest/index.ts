import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SSEN_BASE = "https://data-api.ssen.co.uk/api/3/action/package_show";

/** Map a CKAN dataset_id (registry value) → SSEN region tag. */
const DATASET_TO_REGION: Record<string, "SEPD" | "SHEPD"> = {
  "dx-sepd_long_term_development_statement": "SEPD",
  "dx-shepd_long_term_development_statement": "SHEPD",
};

const CKAN_PACKAGE: Record<"SEPD" | "SHEPD", string> = {
  SEPD: "sepd_long_term_development_statement",
  SHEPD: "shepd_long_term_development_statement",
};

const UA = "Mozilla/5.0 (Lovable Gridwise SSEN LTDS Ingest)";

const num = (v: any): number | null => {
  if (v === null || v === undefined || v === "" || v === "N/A" || v === "n/a") return null;
  const n = Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};
const str = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
};
const normaliseName = (s: string | null): string =>
  (s ?? "").toUpperCase().replace(/\s+/g, " ").trim();

/** Pull the latest XLSX resource for a CKAN package. */
async function getLatestXlsxUrl(pkg: string): Promise<{ url: string; date: string | null }> {
  const resp = await fetch(`${SSEN_BASE}?id=${pkg}`, { headers: { "User-Agent": UA } });
  if (!resp.ok) throw new Error(`CKAN package_show failed: ${resp.status}`);
  const json = await resp.json();
  const resources: any[] = json?.result?.resources ?? [];
  // Prefer the newest "tables"/"long term development statement tables" XLSX, ignoring CIM/Schematic/Geographic.
  const xlsx = resources
    .filter((r) => String(r.format).toUpperCase() === "XLSX")
    .filter((r) => /tables/i.test(r.name || ""))
    .filter((r) => !/schematic|geographic|cim/i.test(r.name || ""))
    .sort((a, b) => String(b.created || "").localeCompare(String(a.created || "")));
  if (!xlsx.length) throw new Error(`No XLSX 'tables' resource found in CKAN package ${pkg}`);
  return { url: xlsx[0].url, date: xlsx[0].created ?? null };
}

/** Download an XLSX (following redirects) and parse into a SheetJS workbook. */
async function fetchWorkbook(url: string): Promise<XLSX.WorkBook> {
  const resp = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!resp.ok) throw new Error(`XLSX download failed: ${resp.status}`);
  const buf = new Uint8Array(await resp.arrayBuffer());
  return XLSX.read(buf, { type: "array" });
}

/** Find the row index (0-based) where actual data starts, by scanning the first column for non-header text. */
function findDataStartRow(rows: any[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const c0 = rows[i]?.[0];
    const c1 = rows[i]?.[1];
    // Data row: column 0 is a non-empty string AND column 2+ has numeric voltage value
    if (typeof c0 === "string" && c0.length > 0 && c1 != null) {
      // numeric somewhere in cols 2-12
      const hasNum = rows[i].slice(2, 12).some((v) => typeof v === "number");
      if (hasNum && !/^(grid|s\/s|node|voltage|recorded|forecast|firm|three|single|number|tap)/i.test(c0)) {
        return i;
      }
    }
  }
  return 4; // safe default
}

/** Parse Table 3 "Demand Data": returns one row per (site, voltage). */
function parseDemandSheet(ws: XLSX.WorkSheet, region: "SEPD" | "SHEPD"): any[] {
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, blankrows: false });
  const start = findDataStartRow(rows);
  const out: any[] = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((v) => v == null || v === "")) continue;
    const gsp = str(r[0]);
    const siteName = str(r[1]);
    const voltage = num(r[2]);
    const recorded = num(r[3]);
    const pf = num(r[4]);
    // forecast in cols 5..10 (6 years)
    const forecast: Record<string, number | null> = {};
    const years = ["2024/25", "2025/26", "2026/27", "2027/28", "2028/29", "2029/30"];
    for (let j = 0; j < years.length; j++) forecast[years[j]] = num(r[5 + j]);
    // firm capacity is the last non-null numeric on the row (cols 11..14)
    let firm: number | null = null;
    for (let j = 11; j < Math.min(r.length, 16); j++) {
      const n = num(r[j]);
      if (n != null) { firm = n; break; }
    }
    if (!siteName) continue;
    out.push({
      region,
      gsp_group: gsp,
      site_name: siteName,
      site_name_normalised: normaliseName(siteName),
      voltage_kv: voltage,
      recorded_demand_mva: recorded,
      power_factor: pf,
      firm_capacity_mva: firm,
      forecast_json: forecast,
      raw_json: { row: r },
    });
  }
  return out;
}

/** Parse Table 4a/4b "Fault Level": returns one row per (site, voltage). */
function parseFaultSheet(ws: XLSX.WorkSheet, region: "SEPD" | "SHEPD"): any[] {
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null, blankrows: false });
  const start = findDataStartRow(rows);
  const out: any[] = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((v) => v == null || v === "")) continue;
    const gsp = str(r[0]);
    const siteName = str(r[1]);
    const voltage = num(r[2]);
    // cols: 3..5 R/X/XR, 6 peak make kA, 7 rms break kA, 8 Eq MVA, 9 CB make, 10 CB break
    const peakMake = num(r[6]);
    const rmsBreak = num(r[7]);
    const eqMva = num(r[8]);
    const cbMake = num(r[9]);
    const cbBreak = num(r[10]);
    if (!siteName || voltage == null) continue;
    out.push({
      region,
      gsp_group: gsp,
      site_name: siteName,
      site_name_normalised: normaliseName(siteName),
      voltage_kv: voltage,
      three_phase_peak_make_ka: peakMake,
      three_phase_break_ka: rmsBreak,
      fault_eq_mva: eqMva,
      cb_make_ka: cbMake,
      cb_break_ka: cbBreak,
      raw_json: { row: r },
    });
  }
  return out;
}

function pickSheet(wb: XLSX.WorkBook, regex: RegExp): XLSX.WorkSheet | null {
  const name = wb.SheetNames.find((n) => regex.test(n));
  return name ? wb.Sheets[name] : null;
}

/** Dedupe rows in-memory on a key list so upsert never hits the same row twice. */
function dedupe<T extends Record<string, any>>(rows: T[], keys: string[]): T[] {
  const seen = new Map<string, T>();
  for (const row of rows) {
    const k = keys.map((f) => row[f] ?? "").join("|");
    seen.set(k, row);
  }
  return Array.from(seen.values());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, service);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const registryId: string | null = body.registry_id ?? null;
    let datasetId: string | null = body.dataset_id ?? null;

    if (registryId && !datasetId) {
      const { data: reg } = await admin.from("dno_dataset_registry").select("dataset_id").eq("id", registryId).maybeSingle();
      datasetId = reg?.dataset_id ?? null;
    }

    if (!datasetId || !(datasetId in DATASET_TO_REGION)) {
      return new Response(JSON.stringify({
        error: "Provide registry_id or dataset_id for an SSEN LTDS dataset",
        accepted: Object.keys(DATASET_TO_REGION),
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const region = DATASET_TO_REGION[datasetId];
    const pkg = CKAN_PACKAGE[region];
    console.log(`[ssen-ltds] ingesting region=${region} dataset=${datasetId}`);

    if (registryId) {
      await admin.from("dno_dataset_registry").update({
        last_sync_status: "processing",
        last_sync_at: new Date().toISOString(),
        last_sync_error: null,
      }).eq("id", registryId);
    }

    const { url, date } = await getLatestXlsxUrl(pkg);
    console.log(`[ssen-ltds] resource: ${url}`);
    const wb = await fetchWorkbook(url);
    console.log(`[ssen-ltds] sheets: ${wb.SheetNames.join(" | ")}`);

    const demandSheet = pickSheet(wb, /demand/i);
    const fault132Sheet = pickSheet(wb, /4a|132.*fault/i);
    const fault33Sheet = pickSheet(wb, /4b|66.*fault|33.*fault/i);

    const sourceDate = date ? date.slice(0, 10) : null;

    let demandInserted = 0;
    if (demandSheet) {
      const rows = parseDemandSheet(demandSheet, region).map((r) => ({ ...r, source_date: sourceDate }));
      const deduped = dedupe(rows, ["region", "site_name_normalised", "voltage_kv"]);
      console.log(`[ssen-ltds] demand: parsed=${rows.length} deduped=${deduped.length}`);
      for (let i = 0; i < deduped.length; i += 500) {
        const batch = deduped.slice(i, i + 500);
        const { error } = await admin.from("ssen_ltds_demand").upsert(batch, {
          onConflict: "region,site_name_normalised,voltage_kv",
        });
        if (error) throw new Error(`demand upsert: ${error.message}`);
        demandInserted += batch.length;
      }
    }

    let faultInserted = 0;
    for (const ws of [fault132Sheet, fault33Sheet]) {
      if (!ws) continue;
      const rows = parseFaultSheet(ws, region).map((r) => ({ ...r, source_date: sourceDate }));
      const deduped = dedupe(rows, ["region", "site_name_normalised", "voltage_kv"]);
      console.log(`[ssen-ltds] fault: parsed=${rows.length} deduped=${deduped.length}`);
      for (let i = 0; i < deduped.length; i += 500) {
        const batch = deduped.slice(i, i + 500);
        const { error } = await admin.from("ssen_ltds_fault").upsert(batch, {
          onConflict: "region,site_name_normalised,voltage_kv",
        });
        if (error) throw new Error(`fault upsert: ${error.message}`);
        faultInserted += batch.length;
      }
    }

    const total = demandInserted + faultInserted;

    if (registryId) {
      await admin.from("dno_dataset_registry").update({
        last_sync_status: "success",
        last_sync_rows: total,
        last_sync_at: new Date().toISOString(),
        last_sync_error: null,
        active: true,
      }).eq("id", registryId);
    }

    return new Response(JSON.stringify({
      ok: true,
      region,
      dataset_id: datasetId,
      source_url: url,
      source_date: sourceDate,
      demand_rows: demandInserted,
      fault_rows: faultInserted,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ssen-ltds] error:", msg);
    try {
      const body = await req.clone().json().catch(() => ({}));
      if (body?.registry_id) {
        const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        await admin.from("dno_dataset_registry").update({
          last_sync_status: "error",
          last_sync_error: msg,
          last_sync_at: new Date().toISOString(),
        }).eq("id", body.registry_id);
      }
    } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});