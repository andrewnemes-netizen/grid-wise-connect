/**
 * EHV (33kV) Optimiser V1
 *
 * Selects optimal EHV cable for a 33kV connection.
 * Similar to HV but at 33kV with larger transformer arrangements
 * and primary substation infrastructure costs.
 *
 * Total installed cost includes:
 *  - EHV cable + duct + excavation + jointing
 *  - 33/11kV transformer(s) — multi-transformer splitting for large loads
 *  - Switchgear (circuit breakers at 33kV)
 *  - CT metering, earthing, civils, protection relay
 *  - Commercial uplift
 */

import type { UnitRates } from "./connectionCosts";
import { DEFAULT_UNIT_RATES } from "./connectionCosts";
import type { CableCatalogueEntry } from "./lvOptimiser";

// ── Types ──────────────────────────────────────────────────────────────

export interface EhvOptimiserInput {
  proposed_kw: number;
  route_length_m: number;
  supply_voltage_v?: number;
  power_factor?: number;
  vd_limit_pct?: number;
  assumed_ze_ohms?: number;
  zs_limit_ohms?: number;
  catalogue: CableCatalogueEntry[];
  unit_rates?: UnitRates;
}

export interface EhvNetworkEdge {
  section: "ehv_cable";
  cable_type: string;
  cable_id: string;
  length_m: number;
  cost_per_m: number;
  cable_cost: number;
  impedance_per_km: number;
  current_rating_a: number;
}

export interface EhvElectricalSummary {
  design_current_a: number;
  utilisation_pct: number;
  total_vd_v: number;
  total_vd_pct: number;
  zs_total_ohms: number | null;
  zs_pass: boolean | null;
  fault_current_a: number | null;
}

export interface EhvCostSummary {
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
  protection_relay_cost: number;
  commercial_uplift: number;
  total_installed_cost: number;
}

export interface EhvSolution {
  rank: number;
  network_edge: EhvNetworkEdge;
  electrical: EhvElectricalSummary;
  cost: EhvCostSummary;
  constraint_flags: string[];
  passes_all: boolean;
}

export interface EhvOptimiserResult {
  status: "OK" | "NO_PASSING_SOLUTION";
  selected: EhvSolution | null;
  alternatives: EhvSolution[];
  constraint_failures: string[];
  meta: {
    candidates_evaluated: number;
    route_length_m: number;
    proposed_kw: number;
    voltage_kv: number;
  };
}

// ── Constants ──────────────────────────────────────────────────────────

const DEFAULT_EHV_SUPPLY_V = 33000; // 33kV
const DEFAULT_PF = 0.95;
const DEFAULT_VD_LIMIT_PCT = 5;
const DEFAULT_ZE_OHMS = 0.05; // Very low Ze for EHV
const DUCT_COST_PER_M = 20; // Larger duct for EHV
const EHV_FAULT_VOLTAGE = 19053; // 33kV / √3
const MAX_CANDIDATES = 10;

// EHV transformer sizes (33/11kV primary transformers)
const EHV_TRANSFORMER_SIZES_KVA = [5000, 10000, 15000, 20000];
// Cost per kVA for large primary transformers (approximate)
const EHV_TRANSFORMER_COST_PER_KVA = 45;
// Protection relay cost
const PROTECTION_RELAY_COST = 12000;

// ── Transformer sizing ────────────────────────────────────────────────

interface EhvTransformerSelection {
  size_kva: number;
  count: number;
  unit_cost: number;
  total_cost: number;
}

function selectEhvTransformer(proposed_kw: number): EhvTransformerSelection {
  const required_kva = proposed_kw / 0.9;

  // Find smallest single transformer that fits
  for (const size of EHV_TRANSFORMER_SIZES_KVA) {
    if (required_kva <= size) {
      const cost = size * EHV_TRANSFORMER_COST_PER_KVA;
      return { size_kva: size, count: 1, unit_cost: cost, total_cost: cost };
    }
  }

  // Multi-transformer: use largest units
  const maxSize = EHV_TRANSFORMER_SIZES_KVA[EHV_TRANSFORMER_SIZES_KVA.length - 1];
  const count = Math.ceil(required_kva / maxSize);
  const unitCost = maxSize * EHV_TRANSFORMER_COST_PER_KVA;
  return { size_kva: maxSize, count, unit_cost: unitCost, total_cost: count * unitCost };
}

// ── Core Engine ────────────────────────────────────────────────────────

export function runEhvOptimiser(input: EhvOptimiserInput): EhvOptimiserResult {
  const {
    proposed_kw,
    route_length_m,
    catalogue,
    supply_voltage_v = DEFAULT_EHV_SUPPLY_V,
    power_factor = DEFAULT_PF,
    vd_limit_pct = DEFAULT_VD_LIMIT_PCT,
    assumed_ze_ohms = DEFAULT_ZE_OHMS,
    zs_limit_ohms,
    unit_rates = DEFAULT_UNIT_RATES,
  } = input;

  const designCurrent = (proposed_kw * 1000) / (Math.sqrt(3) * supply_voltage_v * power_factor);

  // Filter EHV candidates
  const candidates = catalogue
    .filter((c) => c.voltage_class === "EHV")
    .sort((a, b) => a.cost_per_m - b.cost_per_m)
    .slice(0, MAX_CANDIDATES);

  if (candidates.length === 0) {
    return {
      status: "NO_PASSING_SOLUTION",
      selected: null,
      alternatives: [],
      constraint_failures: ["No EHV cables in catalogue"],
      meta: { candidates_evaluated: 0, route_length_m, proposed_kw, voltage_kv: 33 },
    };
  }

  const transformer = selectEhvTransformer(proposed_kw);
  const solutions: EhvSolution[] = [];

  for (const cable of candidates) {
    const solution = evaluateEhvSolution({
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
      voltage_kv: 33,
    },
  };
}

// ── Solution Evaluator ─────────────────────────────────────────────────

interface EhvEvalParams {
  cable: CableCatalogueEntry;
  route_length_m: number;
  designCurrent: number;
  supply_voltage_v: number;
  vd_limit_pct: number;
  assumed_ze_ohms: number;
  zs_limit_ohms?: number;
  unit_rates: UnitRates;
  transformer: EhvTransformerSelection;
}

function evaluateEhvSolution(p: EhvEvalParams): EhvSolution {
  const flags: string[] = [];

  const edge: EhvNetworkEdge = {
    section: "ehv_cable",
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
  faultCurrent = Math.round(EHV_FAULT_VOLTAGE / zsTotal);

  if (p.zs_limit_ohms !== undefined) {
    zsPass = zsTotal <= p.zs_limit_ohms;
    if (!zsPass) {
      flags.push(`ZS_EXCEEDED: Zs ${zsTotal.toFixed(3)}Ω > ${p.zs_limit_ohms}Ω limit`);
    }
  }

  // Cost build
  const cableCost = edge.cable_cost;
  const ductCost = Math.round(p.route_length_m * DUCT_COST_PER_M);

  // Excavation: EHV typically more carriageway
  const footwayM = Math.round(p.route_length_m * 0.4);
  const carriagewayM = Math.round(p.route_length_m * 0.5);
  const vergeM = Math.round(p.route_length_m * 0.1);
  const excavationCost =
    footwayM * p.unit_rates.excavation_footway_per_m +
    carriagewayM * p.unit_rates.excavation_carriageway_per_m +
    vergeM * p.unit_rates.excavation_verge_per_m;

  // Jointing: EHV joints every 400m (shorter drums)
  const joints = Math.max(1, Math.ceil(p.route_length_m / 400));
  const jointingCost = joints * p.unit_rates.jointing_each;

  // Equipment — EHV uses circuit breakers, not RMU
  const switchgearCost = p.unit_rates.switchgear_circuit_breaker;
  const meteringCost = p.unit_rates.metering_ct;
  const earthingCivilsCost = 8500 + 6200; // Earth mat + transformer compound civils
  const protectionRelayCost = PROTECTION_RELAY_COST;

  const subtotal = cableCost + ductCost + excavationCost + jointingCost +
    p.transformer.total_cost + switchgearCost + meteringCost + earthingCivilsCost + protectionRelayCost;

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
      protection_relay_cost: protectionRelayCost,
      commercial_uplift: commercialUplift,
      total_installed_cost: totalInstalledCost,
    },
    constraint_flags: flags,
    passes_all: hardFails.length === 0,
  };
}
