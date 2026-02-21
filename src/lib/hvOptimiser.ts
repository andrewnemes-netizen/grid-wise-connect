/**
 * HV (11kV) Optimiser V1
 *
 * Selects optimal HV cable for an 11kV connection.
 * Unlike LV, there is no mains/service split — it's a single HV cable run
 * from the nearest primary substation to a new transformer compound on site.
 *
 * Total installed cost includes:
 *  - HV cable + duct + excavation + jointing
 *  - Transformer (auto-sized from demand)
 *  - RMU switchgear
 *  - CT metering, earthing, civils
 *  - Commercial uplift
 */

import type { UnitRates } from "./connectionCosts";
import { DEFAULT_UNIT_RATES } from "./connectionCosts";
import type { CableCatalogueEntry } from "./lvOptimiser";

// ── Types ──────────────────────────────────────────────────────────────

export interface HvOptimiserInput {
  /** Proposed load in kW */
  proposed_kw: number;
  /** Total route length in metres */
  route_length_m: number;
  /** Supply voltage (default 11000V = 11kV) */
  supply_voltage_v?: number;
  /** Power factor (default 0.95) */
  power_factor?: number;
  /** Max voltage drop % (default 5) */
  vd_limit_pct?: number;
  /** Assumed Ze in ohms (default 0.1 for HV) */
  assumed_ze_ohms?: number;
  /** Zs gateway limit in ohms */
  zs_limit_ohms?: number;
  /** HV cable catalogue entries (voltage_class = "HV") */
  catalogue: CableCatalogueEntry[];
  /** Unit rates */
  unit_rates?: UnitRates;
}

export interface HvNetworkEdge {
  section: "hv_cable";
  cable_type: string;
  cable_id: string;
  length_m: number;
  cost_per_m: number;
  cable_cost: number;
  impedance_per_km: number;
  current_rating_a: number;
}

export interface HvElectricalSummary {
  design_current_a: number;
  utilisation_pct: number;
  total_vd_v: number;
  total_vd_pct: number;
  zs_total_ohms: number | null;
  zs_pass: boolean | null;
  fault_current_a: number | null;
}

export interface HvCostSummary {
  cable_cost: number;
  duct_cost: number;
  excavation_cost: number;
  jointing_cost: number;
  transformer_cost: number;
  transformer_size_kva: number;
  transformer_count: number;
  switchgear_cost: number;
  metering_cost: number;
  earthing_civils_cost: number;
  commercial_uplift: number;
  total_installed_cost: number;
}

export interface HvSolution {
  rank: number;
  network_edge: HvNetworkEdge;
  electrical: HvElectricalSummary;
  cost: HvCostSummary;
  constraint_flags: string[];
  passes_all: boolean;
}

export interface HvOptimiserResult {
  status: "OK" | "NO_PASSING_SOLUTION";
  selected: HvSolution | null;
  alternatives: HvSolution[];
  constraint_failures: string[];
  meta: {
    candidates_evaluated: number;
    route_length_m: number;
    proposed_kw: number;
    voltage_kv: number;
  };
}

// ── Constants ──────────────────────────────────────────────────────────

const DEFAULT_HV_SUPPLY_V = 11000; // 11kV
const DEFAULT_PF = 0.95;
const DEFAULT_VD_LIMIT_PCT = 5;
const DEFAULT_ZE_OHMS = 0.1; // Lower Ze for HV networks
const DUCT_COST_PER_M = 15; // Slightly larger duct for HV
const HV_FAULT_VOLTAGE = 6350; // 11kV / √3 for single-phase fault calc
const MAX_CANDIDATES = 10;

// ── Transformer sizing ────────────────────────────────────────────────

interface TransformerSelection {
  size_kva: number;
  count: number;
  unit_cost: number;
  total_cost: number;
}

function selectTransformer(proposed_kw: number, rates: UnitRates): TransformerSelection {
  // kVA ≈ kW / PF — use 0.9 for transformer sizing margin
  const required_kva = proposed_kw / 0.9;

  if (required_kva <= 500) {
    return { size_kva: 500, count: 1, unit_cost: rates.transformer_500kva, total_cost: rates.transformer_500kva };
  }
  if (required_kva <= 1000) {
    return { size_kva: 1000, count: 1, unit_cost: rates.transformer_1000kva, total_cost: rates.transformer_1000kva };
  }
  if (required_kva <= 1500) {
    return { size_kva: 1500, count: 1, unit_cost: rates.transformer_1500kva, total_cost: rates.transformer_1500kva };
  }
  // Multi-transformer: use 1500kVA units
  const count = Math.ceil(required_kva / 1500);
  return { size_kva: 1500, count, unit_cost: rates.transformer_1500kva, total_cost: count * rates.transformer_1500kva };
}

// ── Core Engine ────────────────────────────────────────────────────────

export function runHvOptimiser(input: HvOptimiserInput): HvOptimiserResult {
  const {
    proposed_kw,
    route_length_m,
    catalogue,
    supply_voltage_v = DEFAULT_HV_SUPPLY_V,
    power_factor = DEFAULT_PF,
    vd_limit_pct = DEFAULT_VD_LIMIT_PCT,
    assumed_ze_ohms = DEFAULT_ZE_OHMS,
    zs_limit_ohms,
    unit_rates = DEFAULT_UNIT_RATES,
  } = input;

  // Design current at 11kV: Ib = P / (√3 × V × pf)
  const designCurrent = (proposed_kw * 1000) / (Math.sqrt(3) * supply_voltage_v * power_factor);

  // Filter HV candidates from catalogue
  const candidates = catalogue
    .filter((c) => c.voltage_class === "HV")
    .sort((a, b) => a.cost_per_m - b.cost_per_m)
    .slice(0, MAX_CANDIDATES);

  if (candidates.length === 0) {
    return {
      status: "NO_PASSING_SOLUTION",
      selected: null,
      alternatives: [],
      constraint_failures: ["No HV cables in catalogue"],
      meta: { candidates_evaluated: 0, route_length_m, proposed_kw, voltage_kv: 11 },
    };
  }

  const transformer = selectTransformer(proposed_kw, unit_rates);
  const solutions: HvSolution[] = [];

  for (const cable of candidates) {
    const solution = evaluateHvSolution({
      cable,
      route_length_m,
      designCurrent,
      supply_voltage_v,
      vd_limit_pct,
      assumed_ze_ohms,
      zs_limit_ohms,
      unit_rates,
      transformer,
    });
    solutions.push(solution);
  }

  // Sort: passing first, then by total cost
  solutions.sort((a, b) => {
    if (a.passes_all && !b.passes_all) return -1;
    if (!a.passes_all && b.passes_all) return 1;
    return a.cost.total_installed_cost - b.cost.total_installed_cost;
  });
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
      route_length_m,
      proposed_kw,
      voltage_kv: 11,
    },
  };
}

// ── Solution Evaluator ─────────────────────────────────────────────────

interface HvEvalParams {
  cable: CableCatalogueEntry;
  route_length_m: number;
  designCurrent: number;
  supply_voltage_v: number;
  vd_limit_pct: number;
  assumed_ze_ohms: number;
  zs_limit_ohms?: number;
  unit_rates: UnitRates;
  transformer: TransformerSelection;
}

function evaluateHvSolution(p: HvEvalParams): HvSolution {
  const flags: string[] = [];

  // Network edge
  const edge: HvNetworkEdge = {
    section: "hv_cable",
    cable_type: p.cable.cable_type,
    cable_id: p.cable.id,
    length_m: p.route_length_m,
    cost_per_m: p.cable.cost_per_m,
    cable_cost: Math.round(p.route_length_m * p.cable.cost_per_m * 100) / 100,
    impedance_per_km: p.cable.impedance_per_km,
    current_rating_a: p.cable.current_rating_a,
  };

  // Ampacity
  const utilPct = (p.designCurrent / p.cable.current_rating_a) * 100;
  if (p.designCurrent > p.cable.current_rating_a) {
    flags.push(`AMPACITY: Ib ${p.designCurrent.toFixed(1)}A > Iz ${p.cable.current_rating_a}A`);
  }
  if (utilPct > 80 && utilPct <= 100) {
    flags.push(`UTIL_WARN: ${utilPct.toFixed(0)}% utilisation`);
  }

  // Voltage drop
  const vdV = p.designCurrent * p.cable.impedance_per_km * p.route_length_m / 1000;
  const vdPct = (vdV / p.supply_voltage_v) * 100;
  if (vdPct > p.vd_limit_pct) {
    flags.push(`VD_EXCEEDED: ${vdPct.toFixed(2)}% > ${p.vd_limit_pct}% limit`);
  }

  // Zs / fault level
  let zsTotal: number | null = null;
  let zsPass: boolean | null = null;
  let faultCurrent: number | null = null;
  const cableZ = (p.cable.impedance_per_km * p.route_length_m) / 1000;
  zsTotal = p.assumed_ze_ohms + cableZ;
  faultCurrent = Math.round(HV_FAULT_VOLTAGE / zsTotal);

  if (p.zs_limit_ohms !== undefined) {
    zsPass = zsTotal <= p.zs_limit_ohms;
    if (!zsPass) {
      flags.push(`ZS_EXCEEDED: Zs ${zsTotal.toFixed(3)}Ω > ${p.zs_limit_ohms}Ω limit`);
    }
  }

  // Cost build
  const cableCost = edge.cable_cost;
  const ductCost = Math.round(p.route_length_m * DUCT_COST_PER_M);

  // Excavation: default 60/30/10 surface split
  const footwayM = Math.round(p.route_length_m * 0.6);
  const carriagewayM = Math.round(p.route_length_m * 0.3);
  const vergeM = Math.round(p.route_length_m * 0.1);
  const excavationCost =
    footwayM * p.unit_rates.excavation_footway_per_m +
    carriagewayM * p.unit_rates.excavation_carriageway_per_m +
    vergeM * p.unit_rates.excavation_verge_per_m;

  // Jointing: HV joints every 500m
  const joints = Math.max(1, Math.ceil(p.route_length_m / 500));
  const jointingCost = joints * p.unit_rates.jointing_each;

  // Equipment
  const switchgearCost = p.unit_rates.switchgear_ring_main;
  const meteringCost = p.unit_rates.metering_ct;
  const earthingCivilsCost = 3500 + 4200; // Earth electrode + transformer plinth

  const subtotal = cableCost + ductCost + excavationCost + jointingCost +
    p.transformer.total_cost + switchgearCost + meteringCost + earthingCivilsCost;

  const commercialUplift = Math.round(
    subtotal * (p.unit_rates.design_fee_pct + p.unit_rates.project_management_pct + p.unit_rates.contingency_pct)
  );
  const totalInstalledCost = subtotal + commercialUplift;

  const hardFails = flags.filter((f) =>
    f.startsWith("AMPACITY") || f.startsWith("VD_EXCEEDED") || f.startsWith("ZS_EXCEEDED")
  );

  return {
    rank: 0,
    network_edge: edge,
    electrical: {
      design_current_a: Math.round(p.designCurrent * 10) / 10,
      utilisation_pct: Math.round(utilPct * 10) / 10,
      total_vd_v: Math.round(vdV * 100) / 100,
      total_vd_pct: Math.round(vdPct * 100) / 100,
      zs_total_ohms: zsTotal !== null ? Math.round(zsTotal * 1000) / 1000 : null,
      zs_pass: zsPass,
      fault_current_a: faultCurrent,
    },
    cost: {
      cable_cost: Math.round(cableCost),
      duct_cost: ductCost,
      excavation_cost: Math.round(excavationCost),
      jointing_cost: jointingCost,
      transformer_cost: p.transformer.total_cost,
      transformer_size_kva: p.transformer.size_kva,
      transformer_count: p.transformer.count,
      switchgear_cost: switchgearCost,
      metering_cost: meteringCost,
      earthing_civils_cost: earthingCivilsCost,
      commercial_uplift: commercialUplift,
      total_installed_cost: totalInstalledCost,
    },
    constraint_flags: flags,
    passes_all: hardFails.length === 0,
  };
}
