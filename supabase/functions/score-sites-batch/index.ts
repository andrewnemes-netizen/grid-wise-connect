import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Configurable Phasing Thresholds ──
const VIABILITY_BAND_CUTOFFS = { GREEN: 65, AMBER: 40 };
const COST_BAND_BREAKPOINTS = { LOW: 80000, MEDIUM: 250000 };
const PHASE_RULES = {
  1: (r: ScoredRow) => r.band === "GREEN" && r.deployment_class === "Fast Deploy" && r.cost_band === "£",
  2: (r: ScoredRow) => r.band !== "RED" && r.deployment_class !== "Complex",
  3: (_r: ScoredRow) => true,
};

// Master score weights (same as UnifiedIntelligencePanel)
const WEIGHTS = { traffic: 0.35, accessibility: 0.25, grid: 0.25, safety: 0.10, civils: 0.05 };

interface SiteInput {
  site_name: string;
  postcode: string;
  proposed_kw: number;
  site_type?: string;
  lat?: number;
  lng?: number;
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
  // 4-pillar fields
  traffic_aadf: number;
  nearby_bus_stops: number;
  nearby_rail_stations: number;
  accident_count: number;
  master_score: number;
  // OSM enrichment fields
  surface_split: { footway_pct: number; carriageway_pct: number; verge_pct: number };
  nearby_crossings: number;
  nearby_signals: number;
  route_constraints: string[];
  osm_coverage: "cached" | "none";
  error?: string;
}

// ── OSM tile cache helpers ──
function lngLatToTile(lng: number, lat: number, zoom: number): string {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return `${zoom}/${x}/${y}`;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface OsmContext {
  split: { footway_pct: number; carriageway_pct: number; verge_pct: number };
  crossings: number;
  signals: number;
  constraints: string[];
  found: boolean;
}

async function queryOsmContext(supabase: any, lng: number, lat: number): Promise<OsmContext> {
  const RADIUS_M = 200;
  const fallback: OsmContext = { split: { footway_pct: 60, carriageway_pct: 30, verge_pct: 10 }, crossings: 0, signals: 0, constraints: [], found: false };

  try {
    const tileId = lngLatToTile(lng, lat, 14);
    const slugs = ["osm_major_roads", "osm_minor_roads", "osm_footways", "osm_crossings", "osm_traffic_signals", "osm_railways", "osm_water_bodies"];

    const { data: tiles, error } = await supabase
      .from("osm_tile_cache")
      .select("layer_slug, geojson")
      .eq("tile_id", tileId)
      .in("layer_slug", slugs);

    if (error || !tiles || tiles.length === 0) return fallback;

    let footwayCount = 0, carriagewayCount = 0, crossings = 0, signals = 0;
    const constraints: string[] = [];

    for (const tile of tiles) {
      const geojson = tile.geojson as any;
      if (!geojson?.features) continue;

      for (const f of geojson.features) {
        // Check proximity — use centroid of first coord for lines/points
        const coords = f.geometry?.coordinates;
        if (!coords) continue;

        let fLng: number, fLat: number;
        if (f.geometry.type === "Point") {
          [fLng, fLat] = coords;
        } else if (f.geometry.type === "LineString" && coords.length > 0) {
          const mid = coords[Math.floor(coords.length / 2)];
          [fLng, fLat] = mid;
        } else if (f.geometry.type === "Polygon" && coords[0]?.length > 0) {
          [fLng, fLat] = coords[0][0];
        } else continue;

        const dist = haversineM(lat, lng, fLat, fLng);
        if (dist > RADIUS_M) continue;

        // Classify
        if (tile.layer_slug === "osm_footways") footwayCount++;
        else if (tile.layer_slug === "osm_major_roads" || tile.layer_slug === "osm_minor_roads") carriagewayCount++;
        else if (tile.layer_slug === "osm_crossings") crossings++;
        else if (tile.layer_slug === "osm_traffic_signals") signals++;
        else if (tile.layer_slug === "osm_railways") {
          if (!constraints.includes("RAILWAY_NEARBY")) constraints.push("RAILWAY_NEARBY");
        } else if (tile.layer_slug === "osm_water_bodies") {
          if (!constraints.includes("WATER_NEARBY")) constraints.push("WATER_NEARBY");
        }
      }
    }

    if (signals > 2 && !constraints.includes("SIGNAL_CONTROLLED")) constraints.push("SIGNAL_CONTROLLED");

    const totalRoad = footwayCount + carriagewayCount;
    if (totalRoad === 0) return { ...fallback, crossings, signals, constraints, found: tiles.length > 0 };

    const footPct = Math.round((footwayCount / totalRoad) * 100);
    const carrPct = Math.round((carriagewayCount / totalRoad) * 100);
    const vergePct = Math.max(0, 100 - footPct - carrPct);

    return { split: { footway_pct: footPct, carriageway_pct: carrPct, verge_pct: vergePct }, crossings, signals, constraints, found: true };
  } catch (e) {
    console.warn("OSM context query failed:", e);
    return fallback;
  }
}

// ── Scoring helpers ──
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

// Unit rates type matching the DB table / client-side engine
interface UnitRatesRow {
  cable_lv_per_m: number; cable_hv_per_m: number; cable_ehv_per_m: number;
  duct_per_m: number;
  excavation_footway_per_m: number; excavation_carriageway_per_m: number; excavation_verge_per_m: number;
  jointing_each: number; jointing_lv_each: number; termination_each: number;
  switchgear_ring_main: number; switchgear_circuit_breaker: number;
  transformer_500kva: number; transformer_1000kva: number; transformer_1500kva: number;
  metering_ct: number; metering_wc: number;
  feeder_pillar_each: number; cutout_100a_3ph: number;
  earthing_lot: number; transformer_plinth_each: number; cable_marker_tape_per_m: number;
  design_fee_pct: number; project_management_pct: number; contingency_pct: number;
  reinforcement_per_kw_over_capacity: number;
  lv_joint_team_day: number;
  joint_bay_soft: number; joint_bay_footway: number; joint_bay_carriageway: number;
  cable_joint_kit_185mm: number; cable_joint_kit_pot_end: number;
  service_cable_35mm_per_m: number; mains_extension_threshold_m: number;
}

// Hardcoded defaults matching src/lib/connectionCosts.ts DEFAULT_UNIT_RATES
const FALLBACK_RATES: UnitRatesRow = {
  cable_lv_per_m: 85, cable_hv_per_m: 145, cable_ehv_per_m: 280,
  duct_per_m: 12,
  excavation_footway_per_m: 120, excavation_carriageway_per_m: 210, excavation_verge_per_m: 65,
  jointing_each: 2800, jointing_lv_each: 366, termination_each: 450,
  switchgear_ring_main: 18500, switchgear_circuit_breaker: 35000,
  transformer_500kva: 22000, transformer_1000kva: 38000, transformer_1500kva: 52000,
  metering_ct: 4500, metering_wc: 1200,
  feeder_pillar_each: 3200, cutout_100a_3ph: 850,
  earthing_lot: 3500, transformer_plinth_each: 4200, cable_marker_tape_per_m: 2,
  design_fee_pct: 0.08, project_management_pct: 0.06, contingency_pct: 0.10,
  reinforcement_per_kw_over_capacity: 85,
  lv_joint_team_day: 1620,
  joint_bay_soft: 850, joint_bay_footway: 1330, joint_bay_carriageway: 2360,
  cable_joint_kit_185mm: 366.23, cable_joint_kit_pot_end: 182.53,
  service_cable_35mm_per_m: 8.50, mains_extension_threshold_m: 25,
};

/**
 * Mirrors estimateConnectionCost from src/lib/connectionCosts.ts
 * Uses admin-configured unit_rates from the database.
 */
function estimateTotalCost(
  proposedKw: number,
  distances: { primary_m: number; feeder_m: number; capacity_segment_m: number },
  headroom: number | null,
  r: UnitRatesRow,
  surfaceSplit?: { footway_pct: number; carriageway_pct: number; verge_pct: number },
): { total: number; confidence: string } {
  const vl = proposedKw <= 80 ? "LV" : proposedKw <= 1500 ? "HV" : "EHV";
  const rawDist = vl === "LV" ? distances.capacity_segment_m : vl === "HV" ? distances.feeder_m : distances.primary_m;
  const maxDist = vl === "LV" ? 500 : vl === "HV" ? 3000 : 5000;
  const dist = Math.min(rawDist, maxDist);

  // Surface split: use OSM-derived or fallback 60/30/10
  const sp = surfaceSplit || { footway_pct: 60, carriageway_pct: 30, verge_pct: 10 };
  const footwayM = Math.round(dist * sp.footway_pct / 100);
  const carriagewayM = Math.round(dist * sp.carriageway_pct / 100);
  const vergeM = Math.round(dist * sp.verge_pct / 100);

  const threshold = r.mains_extension_threshold_m;
  const needsMainsExtension = vl === "LV" && dist > threshold;

  // --- CABLE (material) ---
  let cableCost = 0;
  if (vl === "LV") {
    const serviceCableLen = needsMainsExtension ? threshold : dist;
    cableCost += serviceCableLen * r.service_cable_35mm_per_m;
    if (needsMainsExtension) {
      const mainsLen = dist - threshold;
      cableCost += mainsLen * 48.0; // 185mm² 4c XLPE/SWA mains extension
    }
  } else {
    const cableRate = vl === "HV" ? r.cable_hv_per_m : r.cable_ehv_per_m;
    cableCost = dist * cableRate;
  }
  // Ducting
  cableCost += dist * r.duct_per_m;

  // --- EXCAVATION ---
  const excavation = footwayM * r.excavation_footway_per_m
    + carriagewayM * r.excavation_carriageway_per_m
    + vergeM * r.excavation_verge_per_m;

  // --- EQUIPMENT ---
  let equipment = 0;

  // Joint bay + cable joint kit (LV mains extension only)
  if (needsMainsExtension) {
    equipment += r.joint_bay_footway; // dominant surface
    equipment += r.cable_joint_kit_185mm;
  }

  // Joints
  if (vl !== "LV") {
    const jointCount = Math.max(2, Math.ceil(dist / 250));
    equipment += jointCount * r.jointing_each;
  } else {
    equipment += r.cable_joint_kit_pot_end; // pot end
  }

  // Terminations
  equipment += 2 * r.termination_each;

  // Switchgear — HV/EHV only
  if (vl !== "LV") equipment += r.switchgear_ring_main;

  // LV endpoint equipment
  if (vl === "LV") equipment += r.feeder_pillar_each + r.cutout_100a_3ph;

  // Transformer — HV/EHV ONLY (NOT LV)
  if (vl !== "LV") {
    if (proposedKw <= 500) equipment += r.transformer_500kva;
    else if (proposedKw <= 1000) equipment += r.transformer_1000kva;
    else equipment += Math.ceil(proposedKw / 1500) * r.transformer_1500kva;
  }

  // Metering
  equipment += vl === "LV" ? r.metering_wc : r.metering_ct;

  // Earthing & plinth — HV/EHV only
  if (vl !== "LV") {
    equipment += r.earthing_lot;
    equipment += r.transformer_plinth_each;
  }

  // Cable marker tape
  equipment += dist * r.cable_marker_tape_per_m;

  // --- LABOUR ---
  let labourDays = Math.max(0.5, (dist / 100) * 0.5); // cable pulling
  const jointCount = vl !== "LV" ? Math.max(2, Math.ceil(dist / 250)) : 1;
  labourDays += (jointCount + (needsMainsExtension ? 1 : 0)) * 0.5; // jointing
  labourDays += 2 * 0.25; // terminations
  labourDays += 0.5; // testing
  if (needsMainsExtension) labourDays += 0.5;
  labourDays = Math.round(labourDays * 2) / 2;
  const labourCost = Math.round(labourDays * r.lv_joint_team_day);

  // --- REINFORCEMENT ---
  let reinforcement = 0;
  if (headroom !== null && proposedKw > headroom) {
    reinforcement = (proposedKw - headroom) * r.reinforcement_per_kw_over_capacity;
  }

  const subtotal = cableCost + excavation + equipment + labourCost + reinforcement;
  const designFee = Math.round(subtotal * r.design_fee_pct);
  const pmFee = Math.round(subtotal * r.project_management_pct);
  const contingency = Math.round(subtotal * r.contingency_pct);
  const total = Math.round(subtotal + designFee + pmFee + contingency);
  const confidence = dist < 500 ? "high" : dist < 1500 ? "medium" : "low";
  return { total, confidence };
}

function assignPhase(row: ScoredRow): { phase: number; rationale: string } {
  // Constraint penalty: railway/water nearby forces at least Phase 2
  const hasHardConstraint = row.route_constraints.includes("RAILWAY_NEARBY") || row.route_constraints.includes("WATER_NEARBY");
  if (!hasHardConstraint && PHASE_RULES[1](row)) return { phase: 1, rationale: "Quick Win: Green viability, fast deploy, low cost" };
  if (hasHardConstraint && PHASE_RULES[1](row)) return { phase: 2, rationale: `Constraint penalty: ${row.route_constraints.join(", ")}` };
  if (PHASE_RULES[2](row)) return { phase: 2, rationale: `Moderate: ${row.band} viability, ${row.deployment_class}` };
  return { phase: 3, rationale: `Strategic: ${row.band} viability, ${row.deployment_class}, ${row.cost_band} cost` };
}

// Traffic pillar score (0-100)
function trafficPillarScore(aadf: number): number {
  if (aadf >= 30000) return 100;
  if (aadf >= 15000) return 80;
  if (aadf >= 5000) return 60;
  if (aadf >= 1000) return 40;
  if (aadf > 0) return 20;
  return 0;
}

// Accessibility pillar score (0-100)
function accessibilityPillarScore(busStops: number, railStations: number): number {
  let s = 0;
  s += Math.min(busStops * 10, 60);
  s += Math.min(railStations * 30, 40);
  return clamp(s);
}

// Safety pillar score (penalty, 0-100 where 100 = worst)
function safetyPenaltyScore(accidents: number): number {
  if (accidents >= 10) return 100;
  if (accidents >= 5) return 60;
  if (accidents >= 1) return 30;
  return 0;
}

// Compute master score using 4-pillar weighting
function computeMasterScore(gridScore: number, trafficScore: number, accessScore: number, safetyPenalty: number, civilsPenalty: number): number {
  return clamp(Math.round(
    trafficScore * WEIGHTS.traffic +
    accessScore * WEIGHTS.accessibility +
    gridScore * WEIGHTS.grid -
    safetyPenalty * WEIGHTS.safety -
    civilsPenalty * WEIGHTS.civils
  ));
}

async function geocodePostcode(postcode: string): Promise<{ lng: number; lat: number } | null> {
  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`);
    if (!res.ok) { await res.text(); return null; }
    const json = await res.json();
    if (json.status !== 200 || !json.result) return null;
    return { lng: json.result.longitude, lat: json.result.latitude };
  } catch { return null; }
}

// ── Spatial query helpers ──
async function queryNearbyPoints(supabase: any, slug: string, lng: number, lat: number, radiusM: number, limit = 50): Promise<any[]> {
  try {
    const { data, error } = await supabase.rpc("nearby_geo_points_by_slug", {
      p_slug: slug,
      p_lng: lng,
      p_lat: lat,
      p_radius_m: radiusM,
      p_limit: limit,
    });
    if (error) {
      console.error(`nearby query error for ${slug}:`, error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.error(`nearby query exception for ${slug}:`, e);
    return [];
  }
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

    // Fetch admin-configured unit rates from the database (one query, reused for all sites)
    let unitRates: UnitRatesRow = FALLBACK_RATES;
    try {
      const { data: ratesRow } = await supabase.from("unit_rates").select("*").limit(1).single();
      if (ratesRow) {
        unitRates = {
          cable_lv_per_m: Number(ratesRow.cable_lv_per_m), cable_hv_per_m: Number(ratesRow.cable_hv_per_m), cable_ehv_per_m: Number(ratesRow.cable_ehv_per_m),
          duct_per_m: Number(ratesRow.duct_per_m),
          excavation_footway_per_m: Number(ratesRow.excavation_footway_per_m), excavation_carriageway_per_m: Number(ratesRow.excavation_carriageway_per_m), excavation_verge_per_m: Number(ratesRow.excavation_verge_per_m),
          jointing_each: Number(ratesRow.jointing_each), jointing_lv_each: Number(ratesRow.jointing_lv_each), termination_each: Number(ratesRow.termination_each),
          switchgear_ring_main: Number(ratesRow.switchgear_ring_main), switchgear_circuit_breaker: Number(ratesRow.switchgear_circuit_breaker),
          transformer_500kva: Number(ratesRow.transformer_500kva), transformer_1000kva: Number(ratesRow.transformer_1000kva), transformer_1500kva: Number(ratesRow.transformer_1500kva),
          metering_ct: Number(ratesRow.metering_ct), metering_wc: Number(ratesRow.metering_wc),
          feeder_pillar_each: Number(ratesRow.feeder_pillar_each), cutout_100a_3ph: Number(ratesRow.cutout_100a_3ph),
          earthing_lot: Number(ratesRow.earthing_lot), transformer_plinth_each: Number(ratesRow.transformer_plinth_each), cable_marker_tape_per_m: Number(ratesRow.cable_marker_tape_per_m),
          design_fee_pct: Number(ratesRow.design_fee_pct), project_management_pct: Number(ratesRow.project_management_pct), contingency_pct: Number(ratesRow.contingency_pct),
          reinforcement_per_kw_over_capacity: Number(ratesRow.reinforcement_per_kw_over_capacity),
          lv_joint_team_day: Number(ratesRow.lv_joint_team_day),
          joint_bay_soft: Number(ratesRow.joint_bay_soft), joint_bay_footway: Number(ratesRow.joint_bay_footway), joint_bay_carriageway: Number(ratesRow.joint_bay_carriageway),
          cable_joint_kit_185mm: Number(ratesRow.cable_joint_kit_185mm), cable_joint_kit_pot_end: Number(ratesRow.cable_joint_kit_pot_end),
          service_cable_35mm_per_m: Number(ratesRow.service_cable_35mm_per_m), mains_extension_threshold_m: Number(ratesRow.mains_extension_threshold_m),
        };
      }
    } catch (e) {
      console.warn("Failed to fetch unit_rates, using defaults:", e);
    }

    // No need to look up layer IDs — we use slugs directly with nearby_geo_points_by_slug
    const DFT_SLUG = "dft_traffic_count_points";
    const NAPTAN_SLUG = "naptan_transport_nodes";
    const STATS19_SLUG = "stats19_accidents";

    const results: ScoredRow[] = [];

    const BATCH_SIZE = 5;
    for (let i = 0; i < sites.length; i += BATCH_SIZE) {
      const batch = sites.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(batch.map(async (site): Promise<ScoredRow> => {
        // Use provided lat/lng if available, otherwise geocode the postcode
        const geo = (site.lat && site.lng)
          ? { lng: site.lng, lat: site.lat }
          : await geocodePostcode(site.postcode);
        if (!geo) {
          return {
            site_name: site.site_name, postcode: site.postcode, proposed_kw: site.proposed_kw,
            site_type: site.site_type || "other", lng: 0, lat: 0,
            viability_index: 0, band: "RED", grid_readiness: "Constrained", deployment_class: "Complex",
            reinforcement_probability: 90, cost_band: "£££", total_estimate: 0, confidence: "low",
            best_poc: "N/A", headroom_kw: null, utilisation_pct: null,
            distance_primary_m: 0, distance_feeder_m: 0, distance_capacity_m: 0,
            phase: 3, phase_rationale: "Could not geocode postcode",
            traffic_aadf: 0, nearby_bus_stops: 0, nearby_rail_stations: 0, accident_count: 0, master_score: 0,
            error: `Invalid postcode: ${site.postcode}`,
          };
        }

        // Run grid scoring + spatial enrichment + OSM context in parallel
        const [scoreResult, substationResult, trafficResult, naptanResult, stats19Result, osmCtxResult] = await Promise.allSettled([
          supabase.rpc("score_site_from_lnglat", { _lng: geo.lng, _lat: geo.lat, _proposed_kw: site.proposed_kw || 0 }),
          (async () => {
            let substations: any[] = [];
            const radii = [0.02, 0.05, 0.1];
            for (const offset of radii) {
              const poly = { type: "Polygon", coordinates: [[[geo.lng - offset, geo.lat - offset], [geo.lng + offset, geo.lat - offset], [geo.lng + offset, geo.lat + offset], [geo.lng - offset, geo.lat + offset], [geo.lng - offset, geo.lat - offset]]] };
              const { data } = await supabase.rpc("search_substations_in_polygon", { _geojson: JSON.stringify(poly), _limit: 5 });
              substations = data || [];
              if (substations.length > 0) break;
            }
            return substations;
          })(),
          queryNearbyPoints(supabase, DFT_SLUG, geo.lng, geo.lat, 2000, 20),
          queryNearbyPoints(supabase, NAPTAN_SLUG, geo.lng, geo.lat, 500, 50),
          queryNearbyPoints(supabase, STATS19_SLUG, geo.lng, geo.lat, 200, 50),
          queryOsmContext(supabase, geo.lng, geo.lat),
        ]);

        const scoreData = scoreResult.status === "fulfilled" ? (scoreResult.value as any)?.data : null;
        const scoreError = scoreResult.status === "fulfilled" ? (scoreResult.value as any)?.error : scoreResult.reason;
        const substations = substationResult.status === "fulfilled" ? (substationResult.value as any) : [];
        const trafficPoints = trafficResult.status === "fulfilled" ? (trafficResult.value as any[]) : [];
        const naptanPoints = naptanResult.status === "fulfilled" ? (naptanResult.value as any[]) : [];
        const stats19Points = stats19Result.status === "fulfilled" ? (stats19Result.value as any[]) : [];
        const osmCtx: OsmContext = osmCtxResult.status === "fulfilled" ? (osmCtxResult.value as OsmContext) : { split: { footway_pct: 60, carriageway_pct: 30, verge_pct: 10 }, crossings: 0, signals: 0, constraints: [], found: false };

        if (scoreError && !scoreData) {
          return {
            site_name: site.site_name, postcode: site.postcode, proposed_kw: site.proposed_kw,
            site_type: site.site_type || "other", lng: geo.lng, lat: geo.lat,
            viability_index: 0, band: "RED", grid_readiness: "Constrained", deployment_class: "Complex",
            reinforcement_probability: 90, cost_band: "£££", total_estimate: 0, confidence: "low",
            best_poc: "N/A", headroom_kw: null, utilisation_pct: null,
            distance_primary_m: 0, distance_feeder_m: 0, distance_capacity_m: 0,
            phase: 3, phase_rationale: "Scoring failed",
            traffic_aadf: 0, nearby_bus_stops: 0, nearby_rail_stations: 0, accident_count: 0, master_score: 0,
            surface_split: osmCtx.split, nearby_crossings: osmCtx.crossings, nearby_signals: osmCtx.signals,
            route_constraints: osmCtx.constraints, osm_coverage: osmCtx.found ? "cached" : "none",
            error: scoreError?.message || String(scoreError),
          };
        }

        // Extract traffic AADF
        let maxAadf = 0;
        for (const tp of trafficPoints) {
          const attrs = tp.attrs_json || {};
          const v = Number(attrs.all_motor_vehicles) || 0;
          if (v > maxAadf) maxAadf = v;
        }

        // Count bus stops and rail stations
        let busStops = 0;
        let railStations = 0;
        for (const np of naptanPoints) {
          const attrs = np.attrs_json || {};
          const st = attrs.stop_type || "";
          if (st === "BCT" || st === "BCS" || st === "BCQ") busStops++;
          else if (st === "RLY" || st === "RSE" || st === "RPL" || st === "MET") railStations++;
          else busStops++; // default to bus
        }

        // Count accidents
        const accidentCount = stats19Points.length;

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
        const gridViability = Math.round(conn * 0.55 + civ * 0.35 + dep * 0.10);

        // Compute 4-pillar master score
        const tScore = trafficPillarScore(maxAadf);
        const aScore = accessibilityPillarScore(busStops, railStations);
        const sPenalty = safetyPenaltyScore(accidentCount);
        const cPenalty = 100 - civ;
        const masterScore = computeMasterScore(gridViability, tScore, aScore, sPenalty, cPenalty);

        const band = getViabilityBand(masterScore);
        const dc = getDeploymentClass(headroom, site.proposed_kw, util, constraintCount, ndp);
        const gr = getGridReadiness(headroom, util, site.proposed_kw);
        const rp = getReinforcementProbability(headroom, site.proposed_kw);
        const { total, confidence } = estimateTotalCost(site.proposed_kw, { primary_m: primaryDist, feeder_m: feederDist, capacity_segment_m: capacityDist }, headroom, unitRates);
        const cb = getCostBand(total);
        const bestPoc = nearestSub?.site_name || "Unknown";

        const row: ScoredRow = {
          site_name: site.site_name, postcode: site.postcode, proposed_kw: site.proposed_kw,
          site_type: site.site_type || "other", lng: geo.lng, lat: geo.lat,
          viability_index: masterScore, band, grid_readiness: gr, deployment_class: dc,
          reinforcement_probability: rp, cost_band: cb, total_estimate: total, confidence,
          best_poc: bestPoc, headroom_kw: headroom, utilisation_pct: util,
          distance_primary_m: Math.round(primaryDist), distance_feeder_m: Math.round(feederDist), distance_capacity_m: Math.round(capacityDist),
          phase: 0, phase_rationale: "",
          traffic_aadf: maxAadf, nearby_bus_stops: busStops, nearby_rail_stations: railStations,
          accident_count: accidentCount, master_score: masterScore,
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
            phase: 3, phase_rationale: "Processing error",
            traffic_aadf: 0, nearby_bus_stops: 0, nearby_rail_stations: 0, accident_count: 0, master_score: 0,
            error: String(r.reason),
          });
        }
      }
    }

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
