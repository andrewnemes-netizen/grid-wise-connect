import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets";

type LtdsKind = "2a" | "2b" | "3a" | "3b" | "4a" | "4b";

interface TableSpec {
  dataset_id: string;
  table: string;
  map: (row: Record<string, any>) => Record<string, any> | Record<string, any>[] | null;
  conflict: string;
}

const num = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: any): string | null => (v == null ? null : String(v));
const yr = (v: any): number | null => {
  if (v == null || v === "") return null;
  const m = String(v).match(/(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
};
const pick = (row: Record<string, any>, ...keys: string[]) => {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
    const lk = k.toLowerCase();
    for (const rk of Object.keys(row)) {
      if (rk.toLowerCase() === lk && row[rk] !== null && row[rk] !== "") return row[rk];
    }
  }
  return null;
};

const SPECS: Record<LtdsKind, TableSpec> = {
  "2a": {
    dataset_id: "ukpn-ltds-table-2a-transformer-2w",
    table: "ukpn_ltds_transformers_2w",
    conflict: "sitefunctionallocation,voltage_kv,year",
    map: (r) => {
      const sfl = str(pick(r, "sitefunctionallocation", "site_functional_location", "functionallocation"));
      if (!sfl) return null;
      // UKPN 2a (current schema) uses transformer_rating_mva_winter as the
      // firm (N-1) rating and transformer_rating_mva_summer as nameplate.
      const winter = num(pick(r, "transformer_rating_mva_winter"));
      const summer = num(pick(r, "transformer_rating_mva_summer"));
      return {
        sitefunctionallocation: sfl,
        site_name: str(pick(r, "hv_substation", "sitename", "site_name", "substation_name")),
        voltage_kv: num(pick(r, "voltage_hv", "voltage_kv", "primary_voltage_kv", "hv_voltage_kv", "voltage")),
        firm_capacity_mva: num(pick(r, "firm_capacity_mva", "firmcapacity_mva", "firm_capacity", "firm_rating_mva")) ?? winter,
        cyclic_rating_mva: num(pick(r, "cyclic_rating_mva", "cyclic_mva", "cyclic_rating")),
        nameplate_mva: num(pick(r, "nameplate_rating_mva", "nameplate_mva", "rating_mva")) ?? summer,
        year: yr(pick(r, "year", "data_year", "reporting_year")),
        raw_json: r,
      };
    },
  },
  "2b": {
    dataset_id: "ukpn-ltds-table-2b-transformer-data-3w",
    table: "ukpn_ltds_transformers_3w",
    conflict: "sitefunctionallocation,voltage_kv,year",
    map: (r) => {
      const sfl = str(pick(r, "sitefunctionallocation", "functionallocation"));
      if (!sfl) return null;
      return {
        sitefunctionallocation: sfl,
        site_name: str(pick(r, "hv_substation", "sitename", "site_name", "substation_name")),
        voltage_kv: num(pick(r, "voltage_hv", "primary_voltage_kv", "hv_voltage_kv", "voltage_kv")),
        firm_capacity_mva: num(pick(r, "firm_capacity_mva", "firm_rating_mva"))
          ?? num(pick(r, "transformer_rating_mva_winter_hv")),
        cyclic_rating_mva: num(pick(r, "cyclic_rating_mva")),
        nameplate_mva: num(pick(r, "nameplate_rating_mva", "rating_mva"))
          ?? num(pick(r, "transformer_rating_mva_summer_hv")),
        tertiary_voltage_kv: num(pick(r, "tertiary_voltage_kv", "voltage_lv_2")),
        tertiary_rating_mva: num(pick(r, "tertiary_rating_mva", "transformer_rating_mva_winter_lv2")),
        year: yr(pick(r, "year", "data_year")),
        raw_json: r,
      };
    },
  },
  "3a": {
    dataset_id: "ukpn-ltds-table-3a-load-data-observed",
    table: "ukpn_ltds_peak_demand_observed",
    conflict: "sitefunctionallocation,voltage_kv,year,season",
    map: (r) => {
      const sfl = str(pick(r, "sitefunctionallocation", "functional_location", "functionallocation"));
      if (!sfl) return null;
      return expandLoadRows(r, sfl);
    },
  },
  "3b": {
    dataset_id: "ukpn-ltds-table-3b-load-data-true",
    table: "ukpn_ltds_peak_demand_true",
    conflict: "sitefunctionallocation,voltage_kv,year,season",
    map: (r) => {
      const sfl = str(pick(r, "sitefunctionallocation", "functional_location", "functionallocation"));
      if (!sfl) return null;
      return expandLoadRows(r, sfl);
    },
  },
  "4a": {
    dataset_id: "ltds-table-4a-3ph-fault-level",
    table: "ukpn_ltds_fault_3ph",
    conflict: "sitefunctionallocation,voltage_kv,year",
    map: (r) => {
      const sfl = str(pick(r, "sitefunctionallocation", "functionallocation"));
      if (!sfl) return null;
      return {
        sitefunctionallocation: sfl,
        site_name: str(pick(r, "sitename", "substation_name", "site_name")),
        voltage_kv: num(pick(r, "voltage_kv", "voltage")),
        fault_level_ka: num(pick(r, "fault_level_ka", "three_phase_fault_level_ka", "3ph_fault_level_ka", "fault_ka")),
        x_r_ratio: num(pick(r, "x_r_ratio", "xr_ratio")),
        year: yr(pick(r, "year", "data_year")),
        raw_json: r,
      };
    },
  },
  "4b": {
    dataset_id: "ltds-table-4b-earth-fault-level",
    table: "ukpn_ltds_fault_earth",
    conflict: "sitefunctionallocation,voltage_kv,year",
    map: (r) => {
      const sfl = str(pick(r, "sitefunctionallocation", "functionallocation"));
      if (!sfl) return null;
      return {
        sitefunctionallocation: sfl,
        site_name: str(pick(r, "sitename", "substation_name", "site_name")),
        voltage_kv: num(pick(r, "voltage_kv", "voltage")),
        fault_level_ka: num(pick(r, "fault_level_ka", "earth_fault_level_ka", "fault_ka")),
        year: yr(pick(r, "year", "data_year")),
        raw_json: r,
      };
    },
  },
};

// UKPN 3a/3b are wide-format: one row per substation/season with columns for
// current year's observed/true peak plus forecast years. Fan out into one
// row per year so headroom = firm_capacity_mw - peak_mw is queryable per year.
function expandLoadRows(r: Record<string, any>, sfl: string): Record<string, any>[] {
  const siteName = str(pick(r, "substation", "sitename", "site_name"));
  const season = str(pick(r, "season")) ?? "annual";
  const firmMw = num(pick(r, "firm_capacity_mw", "firm_capacity"));
  const out: Record<string, any>[] = [];

  // Collect every column that looks like maximum_demand_YY_YY_mw or forecast_m_d_mw_YY_YY.
  for (const key of Object.keys(r)) {
    const lk = key.toLowerCase();
    let year: number | null = null;
    let mw: number | null = null;
    let mMax = lk.match(/^maximum_demand_(\d{2})_(\d{2})_mw$/);
    if (mMax) {
      year = 2000 + parseInt(mMax[1], 10);
      mw = num(r[key]);
    } else {
      const mFc = lk.match(/^forecast_m_d_mw_(\d{2})_(\d{2})$/);
      if (mFc) {
        year = 2000 + parseInt(mFc[1], 10);
        mw = num(r[key]);
      }
    }
    if (year == null || mw == null) continue;
    out.push({
      sitefunctionallocation: sfl,
      site_name: siteName,
      voltage_kv: null,
      peak_mw: mw,
      peak_mvar: null,
      year,
      season,
      raw_json: { ...r, _firm_capacity_mw: firmMw },
    });
  }

  // Fallback: if no year-shaped columns matched (older schema), emit a single row.
  if (out.length === 0) {
    out.push({
      sitefunctionallocation: sfl,
      site_name: siteName,
      voltage_kv: num(pick(r, "voltage_kv", "voltage")),
      peak_mw: num(pick(r, "peak_mw", "observed_peak_mw", "true_peak_mw", "peak_demand_mw", "mw")),
      peak_mvar: num(pick(r, "peak_mvar", "observed_peak_mvar", "true_peak_mvar", "mvar")),
      year: yr(pick(r, "year", "data_year")),
      season,
      raw_json: r,
    });
  }
  return out;
}

function specForDatasetId(id: string): { kind: LtdsKind; spec: TableSpec } | null {
  for (const [k, s] of Object.entries(SPECS)) {
    if (s.dataset_id === id) return { kind: k as LtdsKind, spec: s };
  }
  return null;
}

async function fetchAll(datasetId: string, apiKey: string | null) {
  const url = `${BASE}/${datasetId}/exports/json?limit=-1`;
  const headers: Record<string, string> = {};
  if (apiKey) headers["Authorization"] = `Apikey ${apiKey}`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`Opendatasoft export failed: ${resp.status} ${await resp.text()}`);
  return (await resp.json()) as any[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const admin = createClient(supabaseUrl, service);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return new Response(JSON.stringify({ error: "Admin role required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const apiKey = body.api_key || Deno.env.get("UKPN_API_KEY") || null;

    // Accept either { table: '2a' } or { dataset_id: 'ltds-...' } or { registry_id }
    let kind: LtdsKind | null = body.table ?? null;
    let datasetId: string | null = body.dataset_id ?? null;
    let registryId: string | null = body.registry_id ?? null;

    if (registryId && !datasetId) {
      const { data: reg } = await admin.from("dno_dataset_registry").select("dataset_id").eq("id", registryId).maybeSingle();
      datasetId = reg?.dataset_id ?? null;
    }
    if (datasetId && !kind) {
      const found = specForDatasetId(datasetId);
      if (!found) return new Response(JSON.stringify({ error: `Not a known LTDS dataset: ${datasetId}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      kind = found.kind;
    }
    if (!kind || !SPECS[kind]) return new Response(JSON.stringify({ error: "Provide table (2a|2b|3a|3b|4a|4b) or dataset_id" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const spec = SPECS[kind];
    console.log(`[ltds] ingesting ${spec.dataset_id} -> ${spec.table}`);

    // Mark registry processing
    if (registryId) {
      await admin.from("dno_dataset_registry").update({ last_sync_status: "processing", last_sync_at: new Date().toISOString(), last_sync_error: null }).eq("id", registryId);
    }

    const rows = await fetchAll(spec.dataset_id, apiKey);
    console.log(`[ltds] fetched ${rows.length} raw rows`);

    const mapped = rows.map(spec.map).filter((x): x is Record<string, any> => !!x);
    console.log(`[ltds] mapped ${mapped.length} valid rows`);

    // Dedupe in-memory on conflict key to avoid upsert "cannot affect row a second time"
    const keyFields = spec.conflict.split(",");
    const seen = new Map<string, Record<string, any>>();
    for (const row of mapped) {
      const k = keyFields.map((f) => row[f] ?? "").join("|");
      seen.set(k, row);
    }
    const deduped = Array.from(seen.values());

    let inserted = 0;
    const batchSize = 500;
    for (let i = 0; i < deduped.length; i += batchSize) {
      const batch = deduped.slice(i, i + batchSize);
      const { error } = await admin.from(spec.table).upsert(batch, { onConflict: spec.conflict });
      if (error) {
        console.error("[ltds] upsert error:", error);
        if (registryId) {
          await admin.from("dno_dataset_registry").update({ last_sync_status: "error", last_sync_error: error.message, last_sync_at: new Date().toISOString() }).eq("id", registryId);
        }
        return new Response(JSON.stringify({ error: error.message, inserted }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      inserted += batch.length;
    }

    if (registryId) {
      await admin.from("dno_dataset_registry").update({
        last_sync_status: "success",
        last_sync_rows: inserted,
        last_sync_at: new Date().toISOString(),
        last_sync_error: null,
        active: true,
      }).eq("id", registryId);
    }

    return new Response(JSON.stringify({ ok: true, table: spec.table, dataset_id: spec.dataset_id, fetched: rows.length, inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[ltds] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});