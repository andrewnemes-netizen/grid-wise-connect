// Gridwise Advisor — natural-language grid search chatbot
// Uses Lovable AI Gateway (chat completions) with a search_grid_assets tool
// that queries PostGIS network tables.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const MODEL = "google/gemini-3-flash-preview";

const SYSTEM_PROMPT = `You are the Gridwise Advisor — an AI grid-connection assistant for UK EV infrastructure planners.

Users ask natural-language questions about UK distribution network assets. You have a tool "search_grid_assets" that queries the PostGIS database of substations, LV feeders, HV feeders and cables.

Rules:
- ALWAYS call search_grid_assets when the user asks to find/list/show/rank sites, substations, feeders or cables.
- Convert free-text location ("Leeds", "SW1A 1AA", "Cambridge city centre") into the location argument as-is; the tool geocodes it.
- Default radius_km = 10 unless the user gives a distance.
- Interpret "headroom" as min_headroom_kw; "lightly loaded" as max_utilisation_pct <= 60; "spare capacity" implies min_headroom_kw >= 100.
- Voltage cues: LV = <1kV, HV = 6.6/11/20/33kV, EHV = 66/132kV. Map to voltage_min_kv / voltage_max_kv.
- After the tool returns, write a SHORT summary (max 4 bullet points) of the top matches — name, DNO, headroom, distance. Never repeat all fields; the UI shows the table.
- If the user asks about export or study creation, tell them to use the Export / Assess buttons on each row.
- If the tool returns zero results, suggest widening radius or relaxing filters.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_grid_assets",
      description: "Search UK grid assets (substations, LV feeders, HV feeders) near a location with filters.",
      parameters: {
        type: "object",
        properties: {
          location: { type: "string", description: "Place name, postcode, or 'lat,lng'." },
          radius_km: { type: "number", description: "Search radius in km (default 10)." },
          asset_types: {
            type: "array",
            items: { type: "string", enum: ["substation", "lv_feeder", "hv_feeder"] },
            description: "Which asset types to include. Defaults to all.",
          },
          min_headroom_kw: { type: "number" },
          max_utilisation_pct: { type: "number" },
          voltage_min_kv: { type: "number" },
          voltage_max_kv: { type: "number" },
          local_authority: { type: "string", description: "Local authority name filter (substations only)." },
          rank_by: { type: "string", enum: ["headroom_desc", "distance_asc", "utilisation_asc"] },
          limit: { type: "number", description: "Max results (default 25, max 100)." },
        },
        required: ["location"],
      },
    },
  },
];

// ── Location resolution ─────────────────────────────
async function geocode(q: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const m = q.trim().match(/^(-?\d+(\.\d+)?)\s*,\s*(-?\d+(\.\d+)?)$/);
  if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[3]), label: q };
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gb&q=${encodeURIComponent(q)}`;
    const r = await fetch(url, { headers: { "User-Agent": "gridwise-advisor/1.0" } });
    if (!r.ok) return null;
    const j = await r.json();
    if (!Array.isArray(j) || j.length === 0) return null;
    return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon), label: j[0].display_name };
  } catch {
    return null;
  }
}

// ── Tool executor ───────────────────────────────────
interface SearchArgs {
  location: string;
  radius_km?: number;
  asset_types?: string[];
  min_headroom_kw?: number;
  max_utilisation_pct?: number;
  voltage_min_kv?: number;
  voltage_max_kv?: number;
  local_authority?: string;
  rank_by?: "headroom_desc" | "distance_asc" | "utilisation_asc";
  limit?: number;
}

interface Result {
  asset_type: string;
  source_table: string;
  id: string;
  name: string | null;
  dno: string | null;
  voltage_kv: number | null;
  headroom_kw: number | null;
  utilisation_pct: number | null;
  local_authority: string | null;
  distance_m: number;
  lat: number;
  lng: number;
  score: number;
}

async function runSearch(args: SearchArgs) {
  const loc = await geocode(args.location);
  if (!loc) return { error: `Could not geocode "${args.location}".`, results: [] };

  const radiusM = Math.max(100, Math.min(100_000, (args.radius_km ?? 10) * 1000));
  const limit = Math.max(1, Math.min(100, args.limit ?? 25));
  const types = args.asset_types?.length ? args.asset_types : ["substation", "lv_feeder", "hv_feeder"];
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  const point = `SRID=4326;POINT(${loc.lng} ${loc.lat})`;
  const results: Result[] = [];

  // Substations — merge site_utilisation (rich attrs) + geo_substations (broad coverage)
  if (types.includes("substation")) {
    // 1) site_utilisation — richest metadata
    let q = `
      select id::text as id, site_name as name, licence_area as dno,
             null::numeric as voltage_kv,
             transformer_headroom_kw as headroom_kw,
             utilisation_pct::numeric as utilisation_pct,
             local_authority,
             ST_Distance(geom::geography, ST_GeogFromText('${point}')) as distance_m,
             ST_Y(geom::geometry) as lat, ST_X(geom::geometry) as lng
      from public.site_utilisation
      where geom is not null
        and ST_DWithin(geom::geography, ST_GeogFromText('${point}'), ${radiusM})`;
    if (args.min_headroom_kw != null) q += ` and transformer_headroom_kw >= ${Number(args.min_headroom_kw)}`;
    if (args.max_utilisation_pct != null) q += ` and utilisation_pct <= ${Number(args.max_utilisation_pct)}`;
    if (args.local_authority) q += ` and local_authority ilike '%${args.local_authority.replace(/'/g, "''")}%'`;
    q += ` order by distance_m asc limit ${limit}`;
    const { data, error } = await supabase.rpc("exec_advisor_sql", { sql_text: q }).select();
    // Fallback: use direct query via postgres-meta unavailable — use REST select with filters instead
    if (error || !data) {
      // graceful degrade: query without spatial filter via ORM won't work — try geo_substations
    } else {
      for (const r of data as any[]) {
        results.push({
          asset_type: "substation",
          source_table: "site_utilisation",
          id: r.id, name: r.name, dno: r.dno,
          voltage_kv: r.voltage_kv, headroom_kw: r.headroom_kw,
          utilisation_pct: r.utilisation_pct, local_authority: r.local_authority,
          distance_m: Math.round(r.distance_m), lat: r.lat, lng: r.lng, score: 0,
        });
      }
    }

    // 2) geo_substations — capacity_value/capacity_flag when headroom unknown
    let q2 = `
      select id::text as id, name, dno,
             voltage_kv,
             capacity_value as headroom_kw,
             null::numeric as utilisation_pct,
             null::text as local_authority,
             ST_Distance(geom::geography, ST_GeogFromText('${point}')) as distance_m,
             ST_Y(geom::geometry) as lat, ST_X(geom::geometry) as lng
      from public.geo_substations
      where geom is not null
        and ST_DWithin(geom::geography, ST_GeogFromText('${point}'), ${radiusM})`;
    if (args.voltage_min_kv != null) q2 += ` and voltage_kv >= ${Number(args.voltage_min_kv)}`;
    if (args.voltage_max_kv != null) q2 += ` and voltage_kv <= ${Number(args.voltage_max_kv)}`;
    q2 += ` order by distance_m asc limit ${limit}`;
    const { data: d2 } = await supabase.rpc("exec_advisor_sql", { sql_text: q2 }).select();
    if (Array.isArray(d2)) {
      for (const r of d2 as any[]) {
        results.push({
          asset_type: "substation",
          source_table: "geo_substations",
          id: r.id, name: r.name, dno: r.dno,
          voltage_kv: r.voltage_kv, headroom_kw: r.headroom_kw,
          utilisation_pct: null, local_authority: null,
          distance_m: Math.round(r.distance_m), lat: r.lat, lng: r.lng, score: 0,
        });
      }
    }
  }

  if (types.includes("lv_feeder") || types.includes("hv_feeder")) {
    let q = `
      select id::text as id, name, dno, voltage_kv,
             ST_Distance(geom::geography, ST_GeogFromText('${point}')) as distance_m,
             ST_Y(ST_Centroid(geom::geometry)) as lat, ST_X(ST_Centroid(geom::geometry)) as lng
      from public.geo_feeders
      where geom is not null
        and ST_DWithin(geom::geography, ST_GeogFromText('${point}'), ${radiusM})`;
    if (!types.includes("lv_feeder")) q += ` and voltage_kv >= 6`;
    if (!types.includes("hv_feeder")) q += ` and (voltage_kv is null or voltage_kv < 6)`;
    if (args.voltage_min_kv != null) q += ` and voltage_kv >= ${Number(args.voltage_min_kv)}`;
    if (args.voltage_max_kv != null) q += ` and voltage_kv <= ${Number(args.voltage_max_kv)}`;
    q += ` order by distance_m asc limit ${limit}`;
    const { data } = await supabase.rpc("exec_advisor_sql", { sql_text: q }).select();
    if (Array.isArray(data)) {
      for (const r of data as any[]) {
        const isHv = (r.voltage_kv ?? 0) >= 6;
        results.push({
          asset_type: isHv ? "hv_feeder" : "lv_feeder",
          source_table: "geo_feeders",
          id: r.id, name: r.name, dno: r.dno,
          voltage_kv: r.voltage_kv, headroom_kw: null, utilisation_pct: null,
          local_authority: null, distance_m: Math.round(r.distance_m),
          lat: r.lat, lng: r.lng, score: 0,
        });
      }
    }
  }

  // Ranking
  const rankBy = args.rank_by ?? "headroom_desc";
  const maxDist = Math.max(1, ...results.map((r) => r.distance_m));
  const maxHead = Math.max(1, ...results.map((r) => r.headroom_kw ?? 0));
  for (const r of results) {
    const dNorm = 1 - r.distance_m / maxDist;
    const hNorm = (r.headroom_kw ?? 0) / maxHead;
    const uNorm = 1 - (r.utilisation_pct ?? 50) / 100;
    r.score = Math.round((0.5 * hNorm + 0.3 * dNorm + 0.2 * uNorm) * 100);
  }
  results.sort((a, b) => {
    if (rankBy === "distance_asc") return a.distance_m - b.distance_m;
    if (rankBy === "utilisation_asc") return (a.utilisation_pct ?? 999) - (b.utilisation_pct ?? 999);
    return (b.headroom_kw ?? 0) - (a.headroom_kw ?? 0);
  });

  return {
    query: { ...args, resolved_location: loc },
    total: results.length,
    results: results.slice(0, limit),
  };
}

// ── Gateway call ────────────────────────────────────
async function callGateway(messages: any[]) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": LOVABLE_API_KEY ?? "",
      "X-Lovable-AIG-SDK": "raw",
    },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: "auto" }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Gateway ${r.status}: ${t.slice(0, 500)}`);
  }
  return r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages: userMessages } = await req.json();
    if (!Array.isArray(userMessages)) throw new Error("messages array required");

    let messages: any[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...userMessages.slice(-20),
    ];
    let lastResults: any = null;

    for (let step = 0; step < 3; step++) {
      const resp = await callGateway(messages);
      const msg = resp.choices?.[0]?.message;
      if (!msg) throw new Error("Empty gateway response");
      messages.push(msg);

      if (msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          let out: any;
          try {
            const args = JSON.parse(tc.function.arguments || "{}");
            out = await runSearch(args);
            lastResults = out;
          } catch (e) {
            out = { error: String((e as Error).message) };
          }
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(out).slice(0, 12000),
          });
        }
        continue;
      }
      // Final assistant text
      return new Response(
        JSON.stringify({ text: msg.content ?? "", results: lastResults }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ text: "Sorry — could not resolve the query in time.", results: lastResults }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = (e as Error).message ?? "error";
    const status = msg.includes("429") ? 429 : msg.includes("402") ? 402 : 500;
    return new Response(JSON.stringify({ error: msg }), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});