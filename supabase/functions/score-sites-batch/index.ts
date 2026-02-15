import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Configurable Phasing Thresholds ──
const VIABILITY_BAND_CUTOFFS = { GREEN: 65, AMBER: 40 }; // >=65 GREEN, >=40 AMBER, else RED
const COST_BAND_BREAKPOINTS = { LOW: 80000, MEDIUM: 250000 }; // <80k=£, <250k=££, else £££
const PHASE_RULES = {
  // Phase 1: Quick Wins — GREEN + Fast Deploy + low cost
  1: (r: ScoredRow) => r.band === "GREEN" && r.deployment_class === "Fast Deploy" && r.cost_band === "£",
  // Phase 2: Moderate Works — AMBER or needs reinforcement but not complex
  2: (r: ScoredRow) => r.band !== "RED" && r.deployment_class !== "Complex",
  // Phase 3: Strategic / Complex — everything else
  3: (_r: ScoredRow) => true,
};

interface SiteInput {
  site_name: string;
  postcode: string;
  proposed_kw: number;
  site_type?: string;
}

interface ScoredRow {
  site_name: string;
  postcode: string;
  proposed_kw: number;
  site_type: string;
  lng: number;
  lat: number;
  viability_index: number;
  band: string;
  grid_readiness: string;
  deployment_class: string;
  reinforcement_probability: number;
  cost_band: string;
  total_estimate: number;
  confidence: string;
  best_poc: string;
  headroom_kw: number | null;
  utilisation_pct: number | null;
  distance_primary_m: number;
  distance_feeder_m: number;
  distance_capacity_m: number;
  phase: number;
  phase_rationale: string;
  error?: string;
}

// ── Scoring helpers (mirrored from client scoringEngine) ──
function clamp(v: number): number { return Math.max(0, Math.min(100, v)); }

function connectionScore(d: number, headroom: number | null, util: number | null, capFlag: string): number {
  const distScore = d <= 500 ? clamp(100 - (d / 500) * 25) : clamp(75 - ((d - 500) / 2500) * 75);
  const headroomScore = headroom === null ? 50 : clamp((headroom / 2000) * 100);
  const utilScore = util === null ? 50 : clamp((1 - util / 100) * 100);
  const capPenalty = capFlag === "constrained" ? 20 : capFlag === "limited" ? 10 : 0;
  return clamp((distScore * 0.3 + headroomScore * 0.35 + utilScore * 0.35) - capPenalty);
}

function civilsScore(constraintCount: number, ndp: boolean, wayleave: boolean): number {
  let s = 100;
  s -= constraintCount * 15;
  if (ndp) s -= 25;
  if (wayleave) s -= 15;
  return clamp(s);
}

function deploymentScore(ratio: number | null, distBand: string): number {
  const ratioScore = ratio === null ? 50 : clamp(ratio * 50);
  const bandScore = distBand === "close" ? 100 : distBand === "medium" ? 60 : 20;
  return clamp(ratioScore * 0.6 + bandScore * 0.4);
}

function getViabilityBand(index: number): string {
  if (index >= VIABILITY_BAND_CUTOFFS.GREEN) return "GREEN";
  if (index >= VIABILITY_BAND_CUTOFFS.AMBER) return "AMBER";
  return "RED";
}

function getCostBand(total: number): string {
  if (total < COST_BAND_BREAKPOINTS.LOW) return "£";
  if (total < COST_BAND_BREAKPOINTS.MEDIUM) return "££";
  return "£££";
}

function getDeploymentClass(headroom: number | null, proposedKw: number, util: number | null, constraintCount: number, ndp: boolean): string {
  if (headroom === null) return "Complex";
  if (headroom >= proposedKw && (util === null || util < 70) && constraintCount === 0 && !ndp) return "Fast Deploy";
  if (headroom < proposedKw || (util !== null && util >= 90)) return "Needs Reinforcement";
  return "Complex";
}

function getGridReadiness(headroom: number | null, util: number | null, proposedKw: number): string {
  if (headroom === null || util === null) return "Moderate";
  if (util < 60 && headroom >= proposedKw * 1.5) return "Strong";
  if (util < 85 && headroom >= proposedKw * 0.5) return "Moderate";
  return "Constrained";
}

function getReinforcementProbability(headroom: number | null, proposedKw: number): number {
  if (headroom === null) return 50;
  const ratio = headroom / Math.max(proposedKw, 1);
  if (ratio >= 2) return 10;
  if (ratio >= 1.5) return 25;
  if (ratio >= 1) return 45;
  if (ratio >= 0.5) return 70;
  return 90;
}

function estimateTotalCost(proposedKw: number, distances: { primary_m: number; feeder_m: number; capacity_segment_m: number }, headroom: number | null): { total: number; confidence: string } {
  const vl = proposedKw <= 80 ? "LV" : proposedKw <= 1500 ? "HV" : "EHV";
  const cableRate = vl === "LV" ? 85 : vl === "HV" ? 145 : 280;
  const rawDist = vl === "LV" ? distances.capacity_segment_m : vl === "HV" ? distances.feeder_m : distances.primary_m;
  const maxDist = vl === "LV" ? 500 : vl === "HV" ? 3000 : 5000;
  const dist = Math.min(rawDist, maxDist);

  const cable = dist * cableRate;
  const excavation = dist * (0.6 * 120 + 0.3 * 210 + 0.1 * 65);
  const joints = Math.max(2, Math.ceil(dist / 250)) * 2800;
  const switchgear = vl !== "LV" ? 18500 : 0;
  const tx = proposedKw <= 500 ? 22000 : proposedKw <= 1000 ? 38000 : Math.ceil(proposedKw / 1500) * 52000;
  const metering = vl === "LV" ? 1200 : 4500;
  let reinforcement = 0;
  if (headroom !== null && proposedKw > headroom) reinforcement = (proposedKw - headroom) * 85;

  const subtotal = cable + excavation + joints + switchgear + tx + metering + reinforcement;
  const total = Math.round(subtotal * 1.24); // 8% design + 6% PM + 10% contingency
  const confidence = dist < 500 ? "high" : dist < 1500 ? "medium" : "low";
  return { total, confidence };
}

function assignPhase(row: ScoredRow): { phase: number; rationale: string } {
  if (PHASE_RULES[1](row)) return { phase: 1, rationale: "Quick Win: Green viability, fast deploy, low cost" };
  if (PHASE_RULES[2](row)) return { phase: 2, rationale: `Moderate: ${row.band} viability, ${row.deployment_class}` };
  return { phase: 3, rationale: `Strategic: ${row.band} viability, ${row.deployment_class}, ${row.cost_band} cost` };
}

// ── Geocode postcode via postcodes.io ──
async function geocodePostcode(postcode: string): Promise<{ lng: number; lat: number } | null> {
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`);
    if (!res.ok) { await res.text(); return null; }
    const json = await res.json();
    if (json.status !== 200 || !json.result) return null;
    return { lng: json.result.longitude, lat: json.result.latitude };
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check admin/engineer role
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
    const userRoles = (roles || []).map((r: { role: string }) => r.role);
    if (!userRoles.includes("admin") && !userRoles.includes("engineer")) {
      return new Response(JSON.stringify({ error: "Forbidden: admin or engineer role required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { sites }: { sites: SiteInput[] } = await req.json();
    if (!Array.isArray(sites) || sites.length === 0) {
      return new Response(JSON.stringify({ error: "sites array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (sites.length > 500) {
      return new Response(JSON.stringify({ error: "Maximum 500 sites per batch" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: ScoredRow[] = [];

    // Process concurrently in batches of 5
    const BATCH_SIZE = 5;
    for (let i = 0; i < sites.length; i += BATCH_SIZE) {
      const batch = sites.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(batch.map(async (site): Promise<ScoredRow> => {
        // Geocode
        const geo = await geocodePostcode(site.postcode);
        if (!geo) {
          return {
            site_name: site.site_name, postcode: site.postcode, proposed_kw: site.proposed_kw,
            site_type: site.site_type || "other", lng: 0, lat: 0,
            viability_index: 0, band: "RED", grid_readiness: "Constrained", deployment_class: "Complex",
            reinforcement_probability: 90, cost_band: "£££", total_estimate: 0, confidence: "low",
            best_poc: "N/A", headroom_kw: null, utilisation_pct: null,
            distance_primary_m: 0, distance_feeder_m: 0, distance_capacity_m: 0,
            phase: 3, phase_rationale: "Could not geocode postcode",
            error: `Invalid postcode: ${site.postcode}`,
          };
        }

        // Call score_site_from_lnglat
        const { data: scoreData, error: scoreError } = await supabase.rpc("score_site_from_lnglat", {
          _lng: geo.lng, _lat: geo.lat, _proposed_kw: site.proposed_kw || 0,
        });

        if (scoreError) {
          return {
            site_name: site.site_name, postcode: site.postcode, proposed_kw: site.proposed_kw,
            site_type: site.site_type || "other", lng: geo.lng, lat: geo.lat,
            viability_index: 0, band: "RED", grid_readiness: "Constrained", deployment_class: "Complex",
            reinforcement_probability: 90, cost_band: "£££", total_estimate: 0, confidence: "low",
            best_poc: "N/A", headroom_kw: null, utilisation_pct: null,
            distance_primary_m: 0, distance_feeder_m: 0, distance_capacity_m: 0,
            phase: 3, phase_rationale: "Scoring failed",
            error: scoreError.message,
          };
        }

        // Search nearest substations
        let substations: any[] = [];
        const radii = [0.02, 0.05, 0.1];
        for (const offset of radii) {
          const poly = { type: "Polygon", coordinates: [[[geo.lng - offset, geo.lat - offset], [geo.lng + offset, geo.lat - offset], [geo.lng + offset, geo.lat + offset], [geo.lng - offset, geo.lat + offset], [geo.lng - offset, geo.lat - offset]]] };
          const { data } = await supabase.rpc("search_substations_in_polygon", { _geojson: JSON.stringify(poly), _limit: 5 });
          substations = data || [];
          if (substations.length > 0) break;
        }

        const nearestSub = substations[0];
        const distances = scoreData?.distances || {};
        const constraints = scoreData?.constraints || {};

        let headroom: number | null = null;
        if (nearestSub?.transformer_headroom_kw != null) headroom = nearestSub.transformer_headroom_kw;
        else if (nearestSub?.firm_capacity_kw != null && nearestSub?.max_demand_kw != null) headroom = nearestSub.firm_capacity_kw - nearestSub.max_demand_kw;

        const util: number | null = nearestSub?.utilisation_pct ?? null;
        const primaryDist = distances.primary_m ?? 9999;
        const feederDist = distances.feeder_m ?? 9999;
        const capacityDist = distances.capacity_segment_m ?? 9999;
        const distBand = primaryDist < 250 ? "close" : primaryDist <= 750 ? "medium" : "far";
        const ndp = constraints.ndp_intersect || false;
        const wayleave = constraints.wayleave_intersect || false;
        const constraintCount = (ndp ? 1 : 0) + (wayleave ? 1 : 0);
        const capFlag = constraints.capacity_flag || "unknown";
        const ratio = headroom !== null && site.proposed_kw > 0 ? headroom / site.proposed_kw : null;

        const conn = connectionScore(primaryDist, headroom, util, capFlag);
        const civ = civilsScore(constraintCount, ndp, wayleave);
        const dep = deploymentScore(ratio, distBand);
        const viabilityIndex = Math.round(conn * 0.55 + civ * 0.35 + dep * 0.10);
        const band = getViabilityBand(viabilityIndex);
        const dc = getDeploymentClass(headroom, site.proposed_kw, util, constraintCount, ndp);
        const gr = getGridReadiness(headroom, util, site.proposed_kw);
        const rp = getReinforcementProbability(headroom, site.proposed_kw);
        const { total, confidence } = estimateTotalCost(site.proposed_kw, { primary_m: primaryDist, feeder_m: feederDist, capacity_segment_m: capacityDist }, headroom);
        const cb = getCostBand(total);
        const bestPoc = nearestSub?.site_name || "Unknown";

        const row: ScoredRow = {
          site_name: site.site_name, postcode: site.postcode, proposed_kw: site.proposed_kw,
          site_type: site.site_type || "other", lng: geo.lng, lat: geo.lat,
          viability_index: viabilityIndex, band, grid_readiness: gr, deployment_class: dc,
          reinforcement_probability: rp, cost_band: cb, total_estimate: total, confidence,
          best_poc: bestPoc, headroom_kw: headroom, utilisation_pct: util,
          distance_primary_m: Math.round(primaryDist), distance_feeder_m: Math.round(feederDist), distance_capacity_m: Math.round(capacityDist),
          phase: 0, phase_rationale: "",
        };

        const phasing = assignPhase(row);
        row.phase = phasing.phase;
        row.phase_rationale = phasing.rationale;

        return row;
      }));

      for (const r of batchResults) {
        if (r.status === "fulfilled") results.push(r.value);
        else {
          results.push({
            site_name: "Unknown", postcode: "", proposed_kw: 0, site_type: "other",
            lng: 0, lat: 0, viability_index: 0, band: "RED", grid_readiness: "Constrained",
            deployment_class: "Complex", reinforcement_probability: 90, cost_band: "£££",
            total_estimate: 0, confidence: "low", best_poc: "N/A", headroom_kw: null,
            utilisation_pct: null, distance_primary_m: 0, distance_feeder_m: 0, distance_capacity_m: 0,
            phase: 3, phase_rationale: "Processing error", error: String(r.reason),
          });
        }
      }
    }

    // Summary
    const summary = {
      total: results.length,
      errors: results.filter(r => r.error).length,
      phase_1: results.filter(r => r.phase === 1).length,
      phase_2: results.filter(r => r.phase === 2).length,
      phase_3: results.filter(r => r.phase === 3).length,
      total_kw: results.reduce((s, r) => s + (r.proposed_kw || 0), 0),
      total_estimate: results.reduce((s, r) => s + r.total_estimate, 0),
    };

    return new Response(JSON.stringify({ results, summary, thresholds: { VIABILITY_BAND_CUTOFFS, COST_BAND_BREAKPOINTS } }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Batch scoring error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
