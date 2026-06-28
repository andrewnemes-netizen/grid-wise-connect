import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets";

const KNOWN: Record<string, { voltage: 132 | 33 }> = {
  "ukpn-132kv-circuit-operational-data-monthly": { voltage: 132 },
  "ukpn-33kv-circuit-operational-data-monthly": { voltage: 33 },
};

const num = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: any): string | null => (v == null || v === "" ? null : String(v));

function mapRow(r: Record<string, any>, fallbackVoltage: number) {
  const circuitId = str(r.ltds_line_name ?? r.ltds_circuit_name ?? r.feeder_description);
  const ts = str(r.timestamp);
  if (!circuitId || !ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const voltage = num(r.nominal_voltage) ?? fallbackVoltage;
  return {
    circuit_id: circuitId,
    voltage_kv: voltage,
    licence_area: str(r.licence_area),
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    peak_mw: num(r.active_power_month_max_mw),
    peak_mvar: num(r.reactive_power_month_max_mvar),
    peak_mva: num(r.apparent_power_month_max_mva),
    peak_amps: num(r.current_month_max_amps),
    rating_mva: num(r.summer_rating_mva ?? r.winter_rating_mva ?? r.rating_mva),
    raw_json: r,
  };
}

async function fetchAllJson(datasetId: string, apiKey: string | null) {
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

    let datasetId: string | null = body.dataset_id ?? null;
    const registryId: string | null = body.registry_id ?? null;
    if (registryId && !datasetId) {
      const { data: reg } = await admin.from("dno_dataset_registry").select("dataset_id").eq("id", registryId).maybeSingle();
      datasetId = reg?.dataset_id ?? null;
    }
    if (!datasetId || !KNOWN[datasetId]) {
      return new Response(JSON.stringify({ error: `Not a known monthly-circuit dataset: ${datasetId}` }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const cfg = KNOWN[datasetId];

    if (registryId) {
      await admin.from("dno_dataset_registry").update({ last_sync_status: "processing", last_sync_at: new Date().toISOString(), last_sync_error: null }).eq("id", registryId);
    }

    console.log(`[circuit-monthly] fetching ${datasetId}`);
    const rows = await fetchAllJson(datasetId, apiKey);
    console.log(`[circuit-monthly] fetched ${rows.length} raw rows`);

    const mapped: Record<string, any>[] = [];
    for (const r of rows) {
      const m = mapRow(r, cfg.voltage);
      if (m) mapped.push(m);
    }

    // Dedupe on PK
    const seen = new Map<string, Record<string, any>>();
    for (const row of mapped) {
      const k = `${row.circuit_id}|${row.voltage_kv}|${row.year}|${row.month}`;
      seen.set(k, row);
    }
    const deduped = Array.from(seen.values());
    console.log(`[circuit-monthly] mapped=${mapped.length} deduped=${deduped.length}`);

    let inserted = 0;
    const batchSize = 1000;
    for (let i = 0; i < deduped.length; i += batchSize) {
      const batch = deduped.slice(i, i + batchSize);
      const { error } = await admin
        .from("npg_circuit_monthly")
        .upsert(batch, { onConflict: "circuit_id,voltage_kv,year,month" });
      if (error) {
        console.error("[circuit-monthly] upsert error:", error);
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

    return new Response(JSON.stringify({ ok: true, dataset_id: datasetId, fetched: rows.length, inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[circuit-monthly] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});