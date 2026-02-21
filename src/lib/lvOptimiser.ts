/**
 * Hybrid LV Optimiser V1
 * 
 * Auto-selects optimal LV mains + service cable combination.
 * Minimises total installed cost while passing electrical constraints.
 * 
 * Philosophy:
 *  1. Full route split into mains (upstream) + service (capped final portion)
 *  2. Iterate mains candidates, pair with best service cable
 *  3. Validate: voltage drop ≤ 5%, Ib ≤ Iz, Zs gateway
 *  4. Rank by total installed cost, pick cheapest passing solution
 */

import type { UnitRates } from "./connectionCosts";
import { DEFAULT_UNIT_RATES } from "./connectionCosts";

// ── Types ──────────────────────────────────────────────────────────────

export interface CableCatalogueEntry {
  id: string;
  cable_type: string;
  voltage_class: string;
  cost_per_m: number;
  current_rating_a: number;
  impedance_per_km: number;
  diameter_mm: number;
  service_allowed: boolean;
  mains_allowed: boolean;
}

export interface OptimiserInput {
  /** Proposed load in kW */
  proposed_kw: number;
  /** Total route length in metres (source to destination) */
  route_length_m: number;
  /** DNO service length cap in metres (default 30m) */
  service_length_cap_m?: number;
  /** Supply voltage (default 400V 3-phase) */
  supply_voltage_v?: number;
  /** Power factor (default 0.95) */
  power_factor?: number;
  /** Max voltage drop % (default 5) */
  vd_limit_pct?: number;
  /** Assumed Ze (external earth fault loop impedance) in ohms (default 0.35) */
  assumed_ze_ohms?: number;
  /** Zs gateway limit in ohms — if set, enables Zs check */
  zs_limit_ohms?: number;
  /** LV cable catalogue entries */
  catalogue: CableCatalogueEntry[];
  /** Unit rates for cost build */
  unit_rates?: UnitRates;
}

export interface NetworkEdge {
  section: "mains" | "service";
  cable_type: string;
  cable_id: string;
  length_m: number;
  cost_per_m: number;
  cable_cost: number;
  impedance_per_km: number;
  current_rating_a: number;
}

export interface ElectricalSummary {
  design_current_a: number;
  mains_utilisation_pct: number;
  service_utilisation_pct: number;
  total_vd_v: number;
  total_vd_pct: number;
  mains_vd_pct: number;
  service_vd_pct: number;
  zs_total_ohms: number | null;
  zs_pass: boolean | null;
}

export interface CostSummary {
  cable_cost: number;
  duct_cost: number;
  excavation_cost: number;
  jointing_cost: number;
  commercial_uplift: number;
  total_installed_cost: number;
}

export interface OptimiserSolution {
  rank: number;
  network_edges: NetworkEdge[];
  split_point_m: number;
  electrical: ElectricalSummary;
  cost: CostSummary;
  constraint_flags: string[];
  passes_all: boolean;
}

export interface OptimiserResult {
  status: "OK" | "NO_PASSING_SOLUTION";
  selected: OptimiserSolution | null;
  alternatives: OptimiserSolution[];
  constraint_failures: string[];
  meta: {
    candidates_evaluated: number;
    service_length_cap_m: number;
    route_length_m: number;
    proposed_kw: number;
  };
}

// ── Constants ──────────────────────────────────────────────────────────

const DEFAULT_SERVICE_CAP_M = 30;
const DEFAULT_SUPPLY_V = 400;
const DEFAULT_PF = 0.95;
const DEFAULT_VD_LIMIT_PCT = 5;
const DEFAULT_ZE_OHMS = 0.35;
const DUCT_COST_PER_M = 12; // HDPE duct
const MAX_CANDIDATES = 10;

// ── Core Engine ────────────────────────────────────────────────────────

export function runLvOptimiser(input: OptimiserInput): OptimiserResult {
  const {
    proposed_kw,
    route_length_m,
    catalogue,
    service_length_cap_m = DEFAULT_SERVICE_CAP_M,
    supply_voltage_v = DEFAULT_SUPPLY_V,
    power_factor = DEFAULT_PF,
    vd_limit_pct = DEFAULT_VD_LIMIT_PCT,
    assumed_ze_ohms = DEFAULT_ZE_OHMS,
    zs_limit_ohms,
    unit_rates = DEFAULT_UNIT_RATES,
  } = input;

  // Split route
  const serviceLength = Math.min(service_length_cap_m, route_length_m);
  const mainsLength = Math.max(0, route_length_m - serviceLength);

  // Design current: Ib = P / (√3 × V × pf)
  const designCurrent = proposed_kw * 1000 / (Math.sqrt(3) * supply_voltage_v * power_factor);

  // Filter candidates
  const mainsCandidates = catalogue
    .filter((c) => c.voltage_class === "LV" && c.mains_allowed)
    .sort((a, b) => a.cost_per_m - b.cost_per_m)
    .slice(0, MAX_CANDIDATES);

  const serviceCandidates = catalogue
    .filter((c) => c.voltage_class === "LV" && c.service_allowed)
    .sort((a, b) => a.cost_per_m - b.cost_per_m);

  if (mainsCandidates.length === 0 || serviceCandidates.length === 0) {
    return {
      status: "NO_PASSING_SOLUTION",
      selected: null,
      alternatives: [],
      constraint_failures: ["No suitable cables in catalogue"],
      meta: { candidates_evaluated: 0, service_length_cap_m: serviceLength, route_length_m, proposed_kw },
    };
  }

  const solutions: OptimiserSolution[] = [];

  for (const mainsCable of mainsCandidates) {
    // Pick best service cable that passes ampacity
    const serviceCable = serviceCandidates.find((c) => c.current_rating_a >= designCurrent)
      || serviceCandidates[serviceCandidates.length - 1]; // largest available

    const solution = evaluateSolution({
      mainsCable,
      serviceCable,
      mainsLength,
      serviceLength,
      designCurrent,
      supply_voltage_v,
      vd_limit_pct,
      assumed_ze_ohms,
      zs_limit_ohms,
      unit_rates,
    });

    solutions.push(solution);
  }

  // Sort by total cost, passing solutions first
  solutions.sort((a, b) => {
    if (a.passes_all && !b.passes_all) return -1;
    if (!a.passes_all && b.passes_all) return 1;
    return a.cost.total_installed_cost - b.cost.total_installed_cost;
  });

  // Assign ranks
  solutions.forEach((s, i) => { s.rank = i + 1; });

  const selected = solutions.find((s) => s.passes_all) || null;
  const allFailures = selected
    ? []
    : [...new Set(solutions.flatMap((s) => s.constraint_flags))];

  return {
    status: selected ? "OK" : "NO_PASSING_SOLUTION",
    selected,
    alternatives: solutions.filter((s) => s !== selected).slice(0, 5),
    constraint_failures: allFailures,
    meta: {
      candidates_evaluated: solutions.length,
      service_length_cap_m: serviceLength,
      route_length_m,
      proposed_kw,
    },
  };
}

// ── Solution Evaluator ─────────────────────────────────────────────────

interface EvalParams {
  mainsCable: CableCatalogueEntry;
  serviceCable: CableCatalogueEntry;
  mainsLength: number;
  serviceLength: number;
  designCurrent: number;
  supply_voltage_v: number;
  vd_limit_pct: number;
  assumed_ze_ohms: number;
  zs_limit_ohms?: number;
  unit_rates: UnitRates;
}

function evaluateSolution(p: EvalParams): OptimiserSolution {
  const flags: string[] = [];

  // ── Network edges ──
  const mainsEdge: NetworkEdge = {
    section: "mains",
    cable_type: p.mainsCable.cable_type,
    cable_id: p.mainsCable.id,
    length_m: p.mainsLength,
    cost_per_m: p.mainsCable.cost_per_m,
    cable_cost: Math.round(p.mainsLength * p.mainsCable.cost_per_m * 100) / 100,
    impedance_per_km: p.mainsCable.impedance_per_km,
    current_rating_a: p.mainsCable.current_rating_a,
  };

  const serviceEdge: NetworkEdge = {
    section: "service",
    cable_type: p.serviceCable.cable_type,
    cable_id: p.serviceCable.id,
    length_m: p.serviceLength,
    cost_per_m: p.serviceCable.cost_per_m,
    cable_cost: Math.round(p.serviceLength * p.serviceCable.cost_per_m * 100) / 100,
    impedance_per_km: p.serviceCable.impedance_per_km,
    current_rating_a: p.serviceCable.current_rating_a,
  };

  // ── Electrical validation ──

  // Ampacity: Ib ≤ Iz
  const mainsUtil = (p.designCurrent / p.mainsCable.current_rating_a) * 100;
  const serviceUtil = (p.designCurrent / p.serviceCable.current_rating_a) * 100;

  if (p.designCurrent > p.mainsCable.current_rating_a) {
    flags.push(`MAINS_AMPACITY: Ib ${p.designCurrent.toFixed(1)}A > Iz ${p.mainsCable.current_rating_a}A`);
  }
  if (p.designCurrent > p.serviceCable.current_rating_a) {
    flags.push(`SERVICE_AMPACITY: Ib ${p.designCurrent.toFixed(1)}A > Iz ${p.serviceCable.current_rating_a}A`);
  }
  if (mainsUtil > 80 && mainsUtil <= 100) {
    flags.push(`MAINS_UTIL_WARN: ${mainsUtil.toFixed(0)}% utilisation`);
  }
  if (serviceUtil > 80 && serviceUtil <= 100) {
    flags.push(`SERVICE_UTIL_WARN: ${serviceUtil.toFixed(0)}% utilisation`);
  }

  // Voltage drop: ΔV = Ib × Z × L / 1000
  const mainsVdV = p.designCurrent * p.mainsCable.impedance_per_km * p.mainsLength / 1000;
  const serviceVdV = p.designCurrent * p.serviceCable.impedance_per_km * p.serviceLength / 1000;
  const totalVdV = mainsVdV + serviceVdV;
  const totalVdPct = (totalVdV / p.supply_voltage_v) * 100;
  const mainsVdPct = (mainsVdV / p.supply_voltage_v) * 100;
  const serviceVdPct = (serviceVdV / p.supply_voltage_v) * 100;

  if (totalVdPct > p.vd_limit_pct) {
    flags.push(`VD_EXCEEDED: ${totalVdPct.toFixed(2)}% > ${p.vd_limit_pct}% limit`);
  }

  // Zs gateway
  let zsTotal: number | null = null;
  let zsPass: boolean | null = null;
  if (p.zs_limit_ohms !== undefined) {
    const mainsZ = (p.mainsCable.impedance_per_km * p.mainsLength) / 1000;
    const serviceZ = (p.serviceCable.impedance_per_km * p.serviceLength) / 1000;
    zsTotal = p.assumed_ze_ohms + mainsZ + serviceZ;
    zsPass = zsTotal <= p.zs_limit_ohms;
    if (!zsPass) {
      flags.push(`ZS_EXCEEDED: Zs ${zsTotal.toFixed(3)}Ω > ${p.zs_limit_ohms}Ω limit`);
    }
  }

  // ── Cost build ──
  const totalLength = p.mainsLength + p.serviceLength;
  const cableCost = mainsEdge.cable_cost + serviceEdge.cable_cost;
  const ductCost = Math.round(totalLength * DUCT_COST_PER_M);

  // Excavation: use unit rates with default 60/30/10 split
  const footwayM = Math.round(totalLength * 0.6);
  const carriagewayM = Math.round(totalLength * 0.3);
  const vergeM = Math.round(totalLength * 0.1);
  const excavationCost =
    footwayM * p.unit_rates.excavation_footway_per_m +
    carriagewayM * p.unit_rates.excavation_carriageway_per_m +
    vergeM * p.unit_rates.excavation_verge_per_m;

  // Jointing: 1 at split point + 1 every 250m on mains
  const joints = 1 + Math.max(0, Math.ceil(p.mainsLength / 250) - 1);
  const jointingCost = joints * p.unit_rates.jointing_lv_each;

  const subtotal = cableCost + ductCost + excavationCost + jointingCost;
  const commercialUplift = Math.round(
    subtotal * (p.unit_rates.design_fee_pct + p.unit_rates.project_management_pct + p.unit_rates.contingency_pct)
  );
  const totalInstalledCost = subtotal + commercialUplift;

  // Determine pass/fail (only hard failures, not warnings)
  const hardFails = flags.filter((f) =>
    f.startsWith("MAINS_AMPACITY") ||
    f.startsWith("SERVICE_AMPACITY") ||
    f.startsWith("VD_EXCEEDED") ||
    f.startsWith("ZS_EXCEEDED")
  );

  return {
    rank: 0,
    network_edges: [mainsEdge, serviceEdge],
    split_point_m: p.mainsLength,
    electrical: {
      design_current_a: Math.round(p.designCurrent * 10) / 10,
      mains_utilisation_pct: Math.round(mainsUtil * 10) / 10,
      service_utilisation_pct: Math.round(serviceUtil * 10) / 10,
      total_vd_v: Math.round(totalVdV * 100) / 100,
      total_vd_pct: Math.round(totalVdPct * 100) / 100,
      mains_vd_pct: Math.round(mainsVdPct * 100) / 100,
      service_vd_pct: Math.round(serviceVdPct * 100) / 100,
      zs_total_ohms: zsTotal !== null ? Math.round(zsTotal * 1000) / 1000 : null,
      zs_pass: zsPass,
    },
    cost: {
      cable_cost: Math.round(cableCost),
      duct_cost: ductCost,
      excavation_cost: Math.round(excavationCost),
      jointing_cost: jointingCost,
      commercial_uplift: commercialUplift,
      total_installed_cost: totalInstalledCost,
    },
    constraint_flags: flags,
    passes_all: hardFails.length === 0,
  };
}
