/**
 * UK DNO Connection Cost Estimation Engine
 * Industry-standard unit rates for EV charging / ICP connections
 */

export type VoltageOverride = "Auto" | "LV" | "HV" | "EHV";

export interface UnitRates {
  // Cable costs £/m
  cable_lv_per_m: number;
  cable_hv_per_m: number;
  cable_ehv_per_m: number;
  // Ducting
  duct_per_m: number;
  // Excavation costs £/m
  excavation_footway_per_m: number;
  excavation_carriageway_per_m: number;
  excavation_verge_per_m: number;
  // Fixed costs
  jointing_each: number;
  jointing_lv_each: number;
  termination_each: number;
  switchgear_ring_main: number;
  switchgear_circuit_breaker: number;
  transformer_500kva: number;
  transformer_1000kva: number;
  transformer_1500kva: number;
  metering_ct: number;
  metering_wc: number;
  // LV endpoint equipment
  feeder_pillar_each: number;
  cutout_100a_3ph: number;
  // Civils & earthing
  earthing_lot: number;
  transformer_plinth_each: number;
  cable_marker_tape_per_m: number;
  // Design & project management
  design_fee_pct: number;
  project_management_pct: number;
  contingency_pct: number;
  // Reinforcement
  reinforcement_per_kw_over_capacity: number;
}

export const DEFAULT_UNIT_RATES: UnitRates = {
  cable_lv_per_m: 85,
  cable_hv_per_m: 145,
  cable_ehv_per_m: 280,
  duct_per_m: 12,
  excavation_footway_per_m: 120,
  excavation_carriageway_per_m: 210,
  excavation_verge_per_m: 65,
  jointing_each: 2800,
  jointing_lv_each: 1800,
  termination_each: 1500,
  switchgear_ring_main: 18500,
  switchgear_circuit_breaker: 35000,
  transformer_500kva: 22000,
  transformer_1000kva: 38000,
  transformer_1500kva: 52000,
  metering_ct: 4500,
  metering_wc: 1200,
  feeder_pillar_each: 3200,
  cutout_100a_3ph: 850,
  earthing_lot: 3500,
  transformer_plinth_each: 4200,
  cable_marker_tape_per_m: 2,
  design_fee_pct: 0.08,
  project_management_pct: 0.06,
  contingency_pct: 0.10,
  reinforcement_per_kw_over_capacity: 85,
};

export interface CostEstimate {
  cable_cost: number;
  excavation_cost: number;
  equipment_cost: number;
  reinforcement_cost: number;
  subtotal: number;
  design_fee: number;
  project_management: number;
  contingency: number;
  total_estimate: number;
  confidence: "high" | "medium" | "low";
  breakdown: CostLineItem[];
  voltage_level: "LV" | "HV" | "EHV";
}

export interface CostLineItem {
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unit_rate: number;
  total: number;
}

export interface BomItem {
  category: string;
  item: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  notes?: string;
}

export interface SurfaceSplit {
  footway_pct: number;
  carriageway_pct: number;
  verge_pct: number;
}

export const DEFAULT_SURFACE_SPLIT: SurfaceSplit = {
  footway_pct: 0.6,
  carriageway_pct: 0.3,
  verge_pct: 0.1,
};

interface EstimateInput {
  proposed_kw: number;
  distances: { primary_m: number; feeder_m: number; capacity_segment_m: number };
  constraints?: {
    capacity_flag?: string;
    min_footway_m?: number | null;
    min_carriageway_m?: number | null;
  };
  nearest_headroom_kw?: number;
  voltage_override?: VoltageOverride;
  surface_split?: SurfaceSplit;
}

/**
 * Derive surface split from highway constraint data when available.
 * If min_footway_m and min_carriageway_m are present, compute proportional split.
 * Otherwise fall back to defaults.
 */
function deriveSurfaceSplit(constraints?: EstimateInput["constraints"]): SurfaceSplit {
  if (!constraints?.min_footway_m || !constraints?.min_carriageway_m) {
    return DEFAULT_SURFACE_SPLIT;
  }
  const fw = constraints.min_footway_m;
  const cw = constraints.min_carriageway_m;
  const total = fw + cw;
  if (total <= 0) return DEFAULT_SURFACE_SPLIT;
  // Derive proportional split with 10% verge minimum
  const verge = 0.1;
  const remaining = 0.9;
  return {
    footway_pct: Math.round((fw / total) * remaining * 100) / 100,
    carriageway_pct: Math.round((cw / total) * remaining * 100) / 100,
    verge_pct: verge,
  };
}

function resolveVoltageLevel(proposed_kw: number, voltage_override?: VoltageOverride): "LV" | "HV" | "EHV" {
  if (voltage_override && voltage_override !== "Auto") return voltage_override;
  return proposed_kw <= 80 ? "LV" : proposed_kw <= 1500 ? "HV" : "EHV";
}

/**
 * UK DNO cable selection thresholds (kVA → cable size)
 * Based on standard DNO connection policies:
 *   ≤69 kVA  → 35mm² concentric / 25mm² 4c
 *   ≤138 kVA → 70mm² 4c
 *   ≤207 kVA → 95mm² 4c
 *   ≤276 kVA → 120mm² 4c
 *   ≤400 kVA → 185mm² 4c
 *   >400 kVA → 300mm² 4c
 *
 * Design current: Ib = kW / (√3 × 0.415kV) = kW / 0.719
 * kVA = kW / power_factor (0.95 default)
 */
export interface CableSelection {
  cable_type: string;
  size_mm2: number;
  current_rating_a: number;
  cost_per_m: number;
  impedance_per_km: number;
}

/** Default LV cable lookup table matching cable_catalogue entries */
const LV_CABLE_THRESHOLDS: { max_kva: number; cable: CableSelection }[] = [
  { max_kva: 69,  cable: { cable_type: "25mm² 4c XLPE/SWA",  size_mm2: 25,  current_rating_a: 89,  cost_per_m: 12.50, impedance_per_km: 1.538 } },
  { max_kva: 138, cable: { cable_type: "70mm² 4c XLPE/SWA",  size_mm2: 70,  current_rating_a: 160, cost_per_m: 22.00, impedance_per_km: 0.568 } },
  { max_kva: 207, cable: { cable_type: "95mm² 4c XLPE/SWA",  size_mm2: 95,  current_rating_a: 200, cost_per_m: 28.00, impedance_per_km: 0.411 } },
  { max_kva: 276, cable: { cable_type: "120mm² 4c XLPE/SWA", size_mm2: 120, current_rating_a: 230, cost_per_m: 34.00, impedance_per_km: 0.325 } },
  { max_kva: 400, cable: { cable_type: "185mm² 4c XLPE/SWA", size_mm2: 185, current_rating_a: 295, cost_per_m: 48.00, impedance_per_km: 0.210 } },
  { max_kva: 999, cable: { cable_type: "300mm² 4c XLPE/SWA", size_mm2: 300, current_rating_a: 400, cost_per_m: 68.00, impedance_per_km: 0.130 } },
];

const HV_CABLE_THRESHOLDS: { max_kva: number; cable: CableSelection }[] = [
  { max_kva: 3000,  cable: { cable_type: "95mm² 3c XLPE 11kV",  size_mm2: 95,  current_rating_a: 250, cost_per_m: 65.00, impedance_per_km: 0.411 } },
  { max_kva: 6000,  cable: { cable_type: "185mm² 3c XLPE 11kV", size_mm2: 185, current_rating_a: 370, cost_per_m: 95.00, impedance_per_km: 0.210 } },
  { max_kva: 99999, cable: { cable_type: "300mm² 3c XLPE 11kV", size_mm2: 300, current_rating_a: 480, cost_per_m: 130.00, impedance_per_km: 0.130 } },
];

const EHV_CABLE_THRESHOLDS: { max_kva: number; cable: CableSelection }[] = [
  { max_kva: 10000, cable: { cable_type: "300mm² 1c XLPE 33kV", size_mm2: 300, current_rating_a: 500, cost_per_m: 180.00, impedance_per_km: 0.130 } },
  { max_kva: 20000, cable: { cable_type: "630mm² 1c XLPE 33kV", size_mm2: 630, current_rating_a: 730, cost_per_m: 280.00, impedance_per_km: 0.064 } },
  { max_kva: 99999, cable: { cable_type: "800mm² 1c XLPE 33kV", size_mm2: 800, current_rating_a: 830, cost_per_m: 320.00, impedance_per_km: 0.050 } },
];

/**
 * Select the correct cable based on proposed kW and voltage level.
 * Uses DNO standard kVA thresholds to determine minimum cable size.
 */
export function selectCableForLoad(proposed_kw: number, voltageLevel: "LV" | "HV" | "EHV", pf = 0.95): CableSelection {
  const kva = proposed_kw / pf;
  const thresholds = voltageLevel === "LV" ? LV_CABLE_THRESHOLDS
    : voltageLevel === "HV" ? HV_CABLE_THRESHOLDS
    : EHV_CABLE_THRESHOLDS;

  for (const t of thresholds) {
    if (kva <= t.max_kva) return t.cable;
  }
  // Fallback to largest
  return thresholds[thresholds.length - 1].cable;
}

export function estimateConnectionCost(
  input: EstimateInput,
  rates: UnitRates = DEFAULT_UNIT_RATES
): CostEstimate {
  const { proposed_kw, distances, constraints, nearest_headroom_kw } = input;
  const breakdown: CostLineItem[] = [];

  const voltageLevel = resolveVoltageLevel(proposed_kw, input.voltage_override);
  const selectedCable = selectCableForLoad(proposed_kw, voltageLevel);
  const cableRate = selectedCable.cost_per_m;

  // Cable distance = nearest relevant connection point, capped at practical maximums
  const rawCableDistance =
    voltageLevel === "LV" ? distances.capacity_segment_m :
    voltageLevel === "HV" ? distances.feeder_m :
    distances.primary_m;
  const maxCableDistance = voltageLevel === "LV" ? 500 : voltageLevel === "HV" ? 3000 : 5000;
  const cableDistance = Math.min(rawCableDistance, maxCableDistance);

  // Cable cost
  const cableCost = Math.round(cableDistance * cableRate);
  breakdown.push({
    category: "Cable",
    description: `${selectedCable.cable_type} (${cableDistance}m)`,
    quantity: cableDistance,
    unit: "m",
    unit_rate: cableRate,
    total: cableCost,
  });

  // Ducting
  const ductCost = cableDistance * rates.duct_per_m;
  breakdown.push({
    category: "Cable",
    description: `HDPE duct (${cableDistance}m)`,
    quantity: cableDistance,
    unit: "m",
    unit_rate: rates.duct_per_m,
    total: ductCost,
  });

  // Excavation — use surface split (defaults to 60/30/10 if not provided)
  const split = input.surface_split || deriveSurfaceSplit(input.constraints);
  const footwayM = Math.round(cableDistance * split.footway_pct);
  const carriagewayM = Math.round(cableDistance * split.carriageway_pct);
  const vergeM = Math.round(cableDistance * split.verge_pct);
  const excavationCost =
    footwayM * rates.excavation_footway_per_m +
    carriagewayM * rates.excavation_carriageway_per_m +
    vergeM * rates.excavation_verge_per_m;

  breakdown.push(
    { category: "Excavation", description: "Footway trenching", quantity: footwayM, unit: "m", unit_rate: rates.excavation_footway_per_m, total: footwayM * rates.excavation_footway_per_m },
    { category: "Excavation", description: "Carriageway trenching", quantity: carriagewayM, unit: "m", unit_rate: rates.excavation_carriageway_per_m, total: carriagewayM * rates.excavation_carriageway_per_m },
    { category: "Excavation", description: "Verge trenching", quantity: vergeM, unit: "m", unit_rate: rates.excavation_verge_per_m, total: vergeM * rates.excavation_verge_per_m },
  );

  // Joints — 1 every 250m, voltage-specific rates
  const joints = Math.max(2, Math.ceil(cableDistance / 250));
  const jointRate = voltageLevel === "LV" ? rates.jointing_lv_each : rates.jointing_each;
  const jointDesc = voltageLevel === "LV" ? "LV cable joints (DNO-specific)" : "Cable joints";
  const jointCost = joints * jointRate;
  breakdown.push({ category: "Equipment", description: jointDesc, quantity: joints, unit: "ea", unit_rate: jointRate, total: jointCost });

  // Cable terminations
  const terminationCost = 2 * rates.termination_each;
  breakdown.push({ category: "Equipment", description: `${voltageLevel} cable termination`, quantity: 2, unit: "ea", unit_rate: rates.termination_each, total: terminationCost });

  // Switchgear — HV/EHV only
  let switchgearCost = 0;
  if (voltageLevel === "HV" || voltageLevel === "EHV") {
    switchgearCost = rates.switchgear_ring_main;
    breakdown.push({ category: "Equipment", description: "Ring main unit", quantity: 1, unit: "ea", unit_rate: rates.switchgear_ring_main, total: rates.switchgear_ring_main });
  }

  // LV endpoint equipment — feeder pillar + cutout
  let lvEndpointCost = 0;
  if (voltageLevel === "LV") {
    lvEndpointCost = rates.feeder_pillar_each + rates.cutout_100a_3ph;
    breakdown.push(
      { category: "Equipment", description: "LV feeder pillar", quantity: 1, unit: "ea", unit_rate: rates.feeder_pillar_each, total: rates.feeder_pillar_each },
      { category: "Equipment", description: "100A 3-phase cutout", quantity: 1, unit: "ea", unit_rate: rates.cutout_100a_3ph, total: rates.cutout_100a_3ph },
    );
  }

  // Transformer
  let transformerCost = 0;
  if (voltageLevel !== "LV" && proposed_kw > 0) {
    if (proposed_kw <= 500) {
      transformerCost = rates.transformer_500kva;
      breakdown.push({ category: "Equipment", description: "500kVA transformer", quantity: 1, unit: "ea", unit_rate: rates.transformer_500kva, total: rates.transformer_500kva });
    } else if (proposed_kw <= 1000) {
      transformerCost = rates.transformer_1000kva;
      breakdown.push({ category: "Equipment", description: "1000kVA transformer", quantity: 1, unit: "ea", unit_rate: rates.transformer_1000kva, total: rates.transformer_1000kva });
    } else {
      const count = Math.ceil(proposed_kw / 1500);
      transformerCost = count * rates.transformer_1500kva;
      breakdown.push({ category: "Equipment", description: "1500kVA transformer", quantity: count, unit: "ea", unit_rate: rates.transformer_1500kva, total: transformerCost });
    }
  }

  // Metering
  const meteringCost = voltageLevel === "LV" ? rates.metering_wc : rates.metering_ct;
  breakdown.push({ category: "Equipment", description: voltageLevel === "LV" ? "Whole current meter" : "CT metering", quantity: 1, unit: "ea", unit_rate: meteringCost, total: meteringCost });

  // Earthing & transformer civils — HV/EHV only
  let earthingCost = 0;
  let plinthCost = 0;
  if (voltageLevel !== "LV") {
    earthingCost = rates.earthing_lot;
    plinthCost = rates.transformer_plinth_each;
    breakdown.push(
      { category: "Equipment", description: "Earth electrode & bonding", quantity: 1, unit: "lot", unit_rate: rates.earthing_lot, total: earthingCost },
      { category: "Equipment", description: "Transformer plinth", quantity: 1, unit: "ea", unit_rate: rates.transformer_plinth_each, total: plinthCost },
    );
  }

  // Cable marker tape
  const markerTapeCost = cableDistance * rates.cable_marker_tape_per_m;
  breakdown.push({ category: "Equipment", description: "Cable marker tape", quantity: cableDistance, unit: "m", unit_rate: rates.cable_marker_tape_per_m, total: markerTapeCost });

  const equipmentCost = jointCost + terminationCost + switchgearCost + lvEndpointCost + transformerCost + meteringCost + earthingCost + plinthCost + markerTapeCost;

  // Reinforcement
  let reinforcementCost = 0;
  if (nearest_headroom_kw !== undefined && proposed_kw > nearest_headroom_kw) {
    const overCapacity = proposed_kw - nearest_headroom_kw;
    reinforcementCost = Math.round(overCapacity * rates.reinforcement_per_kw_over_capacity);
    breakdown.push({ category: "Reinforcement", description: `Network reinforcement (${overCapacity}kW over headroom)`, quantity: overCapacity, unit: "kW", unit_rate: rates.reinforcement_per_kw_over_capacity, total: reinforcementCost });
  }

  const totalCableCost = cableCost + ductCost;
  const subtotal = totalCableCost + excavationCost + equipmentCost + reinforcementCost;
  const designFee = Math.round(subtotal * rates.design_fee_pct);
  const pmFee = Math.round(subtotal * rates.project_management_pct);
  const contingency = Math.round(subtotal * rates.contingency_pct);
  const total = subtotal + designFee + pmFee + contingency;

  breakdown.push(
    { category: "Fees", description: "Design fee (8%)", quantity: 1, unit: "lot", unit_rate: designFee, total: designFee },
    { category: "Fees", description: "Project management (6%)", quantity: 1, unit: "lot", unit_rate: pmFee, total: pmFee },
    { category: "Contingency", description: "Contingency (10%)", quantity: 1, unit: "lot", unit_rate: contingency, total: contingency },
  );

  // Confidence based on data quality
  const confidence: "high" | "medium" | "low" =
    cableDistance < 500 && constraints?.capacity_flag !== "constrained" ? "high" :
    cableDistance < 1500 ? "medium" : "low";

  return {
    cable_cost: totalCableCost,
    excavation_cost: Math.round(excavationCost),
    equipment_cost: equipmentCost,
    reinforcement_cost: reinforcementCost,
    subtotal,
    design_fee: designFee,
    project_management: pmFee,
    contingency,
    total_estimate: total,
    confidence,
    breakdown,
    voltage_level: voltageLevel,
  };
}

export function generateBom(input: EstimateInput, rates: UnitRates = DEFAULT_UNIT_RATES): BomItem[] {
  const { proposed_kw, distances } = input;
  const voltageLevel = resolveVoltageLevel(proposed_kw, input.voltage_override);
  const rawDist =
    voltageLevel === "LV" ? distances.capacity_segment_m :
    voltageLevel === "HV" ? distances.feeder_m : distances.primary_m;
  const maxDist = voltageLevel === "LV" ? 500 : voltageLevel === "HV" ? 3000 : 5000;
  const cableDistance = Math.min(rawDist, maxDist);

  // Surface split for excavation (same logic as estimateConnectionCost)
  const split = input.surface_split || deriveSurfaceSplit(input.constraints);
  const footwayM = Math.round(cableDistance * split.footway_pct);
  const carriagewayM = Math.round(cableDistance * split.carriageway_pct);
  const vergeM = Math.round(cableDistance * split.verge_pct);

  const items: BomItem[] = [];

  // Cable — selected based on load current and DNO kVA thresholds
  const selectedCable = selectCableForLoad(proposed_kw, voltageLevel);
  const designCurrent_A = (proposed_kw * 1000) / (Math.sqrt(3) * 415 * 0.95);
  const kva = proposed_kw / 0.95;
  items.push({
    category: "Cable",
    item: `${selectedCable.cable_type} (${kva.toFixed(0)} kVA, Ib=${designCurrent_A.toFixed(1)}A, Iz=${selectedCable.current_rating_a}A)`,
    quantity: cableDistance,
    unit: "m",
    unit_cost: selectedCable.cost_per_m,
    total_cost: cableDistance * selectedCable.cost_per_m,
  });

  // Ducting
  items.push({ category: "Cable", item: "150mm HDPE duct", quantity: cableDistance, unit: "m", unit_cost: rates.duct_per_m, total_cost: cableDistance * rates.duct_per_m });

  // Excavation
  items.push(
    { category: "Excavation", item: "Footway trenching", quantity: footwayM, unit: "m", unit_cost: rates.excavation_footway_per_m, total_cost: footwayM * rates.excavation_footway_per_m },
    { category: "Excavation", item: "Carriageway trenching", quantity: carriagewayM, unit: "m", unit_cost: rates.excavation_carriageway_per_m, total_cost: carriagewayM * rates.excavation_carriageway_per_m },
    { category: "Excavation", item: "Verge trenching", quantity: vergeM, unit: "m", unit_cost: rates.excavation_verge_per_m, total_cost: vergeM * rates.excavation_verge_per_m },
  );

  // Cable joints — voltage-specific
  const joints = Math.max(2, Math.ceil(cableDistance / 250));
  const jointRate = voltageLevel === "LV" ? rates.jointing_lv_each : rates.jointing_each;
  const jointLabel = voltageLevel === "LV" ? "LV straight joint (DNO-specific)" : `${voltageLevel} straight joint`;
  items.push({ category: "Jointing", item: jointLabel, quantity: joints, unit: "ea", unit_cost: jointRate, total_cost: joints * jointRate });

  // Terminations
  items.push({ category: "Jointing", item: `${voltageLevel} cable termination`, quantity: 2, unit: "ea", unit_cost: rates.termination_each, total_cost: 2 * rates.termination_each });

  // Switchgear — HV/EHV only
  if (voltageLevel !== "LV") {
    items.push({ category: "Switchgear", item: "Ring main unit (RMU)", quantity: 1, unit: "ea", unit_cost: rates.switchgear_ring_main, total_cost: rates.switchgear_ring_main });
  }

  // LV endpoint — feeder pillar + cutout
  if (voltageLevel === "LV") {
    items.push(
      { category: "LV Endpoint", item: "LV feeder pillar", quantity: 1, unit: "ea", unit_cost: rates.feeder_pillar_each, total_cost: rates.feeder_pillar_each },
      { category: "LV Endpoint", item: "100A 3-phase cutout", quantity: 1, unit: "ea", unit_cost: rates.cutout_100a_3ph, total_cost: rates.cutout_100a_3ph },
    );
  }

  // Transformer
  if (voltageLevel !== "LV") {
    if (proposed_kw <= 500) {
      items.push({ category: "Transformer", item: "500kVA ground-mounted transformer", quantity: 1, unit: "ea", unit_cost: rates.transformer_500kva, total_cost: rates.transformer_500kva });
    } else if (proposed_kw <= 1000) {
      items.push({ category: "Transformer", item: "1000kVA ground-mounted transformer", quantity: 1, unit: "ea", unit_cost: rates.transformer_1000kva, total_cost: rates.transformer_1000kva });
    } else {
      const count = Math.ceil(proposed_kw / 1500);
      items.push({ category: "Transformer", item: "1500kVA ground-mounted transformer", quantity: count, unit: "ea", unit_cost: rates.transformer_1500kva, total_cost: count * rates.transformer_1500kva });
    }
  }

  // Metering
  if (voltageLevel === "LV") {
    items.push({ category: "Metering", item: "Whole current meter", quantity: 1, unit: "ea", unit_cost: rates.metering_wc, total_cost: rates.metering_wc });
  } else {
    items.push({ category: "Metering", item: "CT metering panel", quantity: 1, unit: "ea", unit_cost: rates.metering_ct, total_cost: rates.metering_ct });
  }

  // Earthing & transformer civils — HV/EHV only
  if (voltageLevel !== "LV") {
    items.push({ category: "Earthing", item: "Earth electrode & bonding", quantity: 1, unit: "lot", unit_cost: rates.earthing_lot, total_cost: rates.earthing_lot });
    items.push({ category: "Civils", item: "Transformer plinth", quantity: 1, unit: "ea", unit_cost: rates.transformer_plinth_each, total_cost: rates.transformer_plinth_each });
  }
  items.push({ category: "Civils", item: "Cable marker tape", quantity: cableDistance, unit: "m", unit_cost: rates.cable_marker_tape_per_m, total_cost: cableDistance * rates.cable_marker_tape_per_m });

  // Reinforcement — must match estimateConnectionCost logic
  const nearest_headroom_kw = input.nearest_headroom_kw;
  if (nearest_headroom_kw !== undefined && proposed_kw > nearest_headroom_kw) {
    const overCapacity = proposed_kw - nearest_headroom_kw;
    items.push({ category: "Reinforcement", item: `Network reinforcement (${overCapacity}kW over headroom)`, quantity: overCapacity, unit: "kW", unit_cost: rates.reinforcement_per_kw_over_capacity, total_cost: Math.round(overCapacity * rates.reinforcement_per_kw_over_capacity) });
  }

  // Fees & contingency — so BOM total matches the estimate total
  const bomSubtotal = items.reduce((s, i) => s + i.total_cost, 0);
  const designFee = Math.round(bomSubtotal * rates.design_fee_pct);
  const pmFee = Math.round(bomSubtotal * rates.project_management_pct);
  const contingency = Math.round(bomSubtotal * rates.contingency_pct);
  items.push(
    { category: "Fees", item: `Design fee (${(rates.design_fee_pct * 100).toFixed(0)}%)`, quantity: 1, unit: "lot", unit_cost: designFee, total_cost: designFee },
    { category: "Fees", item: `Project management (${(rates.project_management_pct * 100).toFixed(0)}%)`, quantity: 1, unit: "lot", unit_cost: pmFee, total_cost: pmFee },
    { category: "Fees", item: `Contingency (${(rates.contingency_pct * 100).toFixed(0)}%)`, quantity: 1, unit: "lot", unit_cost: contingency, total_cost: contingency },
  );

  return items;
}
