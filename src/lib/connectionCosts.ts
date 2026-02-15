/**
 * UK DNO Connection Cost Estimation Engine
 * Industry-standard unit rates for EV charging / ICP connections
 */

export interface UnitRates {
  // Cable costs £/m
  cable_lv_per_m: number;
  cable_hv_per_m: number;
  cable_ehv_per_m: number;
  // Excavation costs £/m
  excavation_footway_per_m: number;
  excavation_carriageway_per_m: number;
  excavation_verge_per_m: number;
  // Fixed costs
  jointing_each: number;
  switchgear_ring_main: number;
  switchgear_circuit_breaker: number;
  transformer_500kva: number;
  transformer_1000kva: number;
  transformer_1500kva: number;
  metering_ct: number;
  metering_wc: number;
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
  excavation_footway_per_m: 120,
  excavation_carriageway_per_m: 210,
  excavation_verge_per_m: 65,
  jointing_each: 2800,
  switchgear_ring_main: 18500,
  switchgear_circuit_breaker: 35000,
  transformer_500kva: 22000,
  transformer_1000kva: 38000,
  transformer_1500kva: 52000,
  metering_ct: 4500,
  metering_wc: 1200,
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

interface EstimateInput {
  proposed_kw: number;
  distances: { primary_m: number; feeder_m: number; capacity_segment_m: number };
  constraints?: {
    capacity_flag?: string;
    min_footway_m?: number | null;
    min_carriageway_m?: number | null;
  };
  nearest_headroom_kw?: number;
}

export function estimateConnectionCost(
  input: EstimateInput,
  rates: UnitRates = DEFAULT_UNIT_RATES
): CostEstimate {
  const { proposed_kw, distances, constraints, nearest_headroom_kw } = input;
  const breakdown: CostLineItem[] = [];

  // Determine voltage level based on proposed kW
  const voltageLevel = proposed_kw <= 80 ? "LV" : proposed_kw <= 1500 ? "HV" : "EHV";
  const cableRate =
    voltageLevel === "LV" ? rates.cable_lv_per_m :
    voltageLevel === "HV" ? rates.cable_hv_per_m :
    rates.cable_ehv_per_m;

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
    description: `${voltageLevel} cable (${cableDistance}m)`,
    quantity: cableDistance,
    unit: "m",
    unit_rate: cableRate,
    total: cableCost,
  });

  // Excavation — assume 60% footway, 30% carriageway, 10% verge
  const footwayM = Math.round(cableDistance * 0.6);
  const carriagewayM = Math.round(cableDistance * 0.3);
  const vergeM = Math.round(cableDistance * 0.1);
  const excavationCost =
    footwayM * rates.excavation_footway_per_m +
    carriagewayM * rates.excavation_carriageway_per_m +
    vergeM * rates.excavation_verge_per_m;

  breakdown.push(
    { category: "Excavation", description: "Footway trenching", quantity: footwayM, unit: "m", unit_rate: rates.excavation_footway_per_m, total: footwayM * rates.excavation_footway_per_m },
    { category: "Excavation", description: "Carriageway trenching", quantity: carriagewayM, unit: "m", unit_rate: rates.excavation_carriageway_per_m, total: carriagewayM * rates.excavation_carriageway_per_m },
    { category: "Excavation", description: "Verge trenching", quantity: vergeM, unit: "m", unit_rate: rates.excavation_verge_per_m, total: vergeM * rates.excavation_verge_per_m },
  );

  // Joints — 1 every 250m
  const joints = Math.max(2, Math.ceil(cableDistance / 250));
  const jointCost = joints * rates.jointing_each;
  breakdown.push({ category: "Equipment", description: "Cable joints", quantity: joints, unit: "ea", unit_rate: rates.jointing_each, total: jointCost });

  // Switchgear
  let switchgearCost = 0;
  if (voltageLevel === "HV" || voltageLevel === "EHV") {
    switchgearCost = rates.switchgear_ring_main;
    breakdown.push({ category: "Equipment", description: "Ring main unit", quantity: 1, unit: "ea", unit_rate: rates.switchgear_ring_main, total: rates.switchgear_ring_main });
  }

  // Transformer
  let transformerCost = 0;
  if (proposed_kw > 0) {
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

  const equipmentCost = jointCost + switchgearCost + transformerCost + meteringCost;

  // Reinforcement
  let reinforcementCost = 0;
  if (nearest_headroom_kw !== undefined && proposed_kw > nearest_headroom_kw) {
    const overCapacity = proposed_kw - nearest_headroom_kw;
    reinforcementCost = Math.round(overCapacity * rates.reinforcement_per_kw_over_capacity);
    breakdown.push({ category: "Reinforcement", description: `Network reinforcement (${overCapacity}kW over headroom)`, quantity: overCapacity, unit: "kW", unit_rate: rates.reinforcement_per_kw_over_capacity, total: reinforcementCost });
  }

  const subtotal = cableCost + excavationCost + equipmentCost + reinforcementCost;
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
    cable_cost: cableCost,
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
  };
}

export function generateBom(input: EstimateInput): BomItem[] {
  const { proposed_kw, distances } = input;
  const voltageLevel = proposed_kw <= 80 ? "LV" : proposed_kw <= 1500 ? "HV" : "EHV";
  const rawDist =
    voltageLevel === "LV" ? distances.capacity_segment_m :
    voltageLevel === "HV" ? distances.feeder_m : distances.primary_m;
  const maxDist = voltageLevel === "LV" ? 500 : voltageLevel === "HV" ? 3000 : 5000;
  const cableDistance = Math.min(rawDist, maxDist);

  const items: BomItem[] = [];

  // Cable
  const cableType = voltageLevel === "LV" ? "185mm² 4-core XLPE" : voltageLevel === "HV" ? "300mm² 3-core XLPE 11kV" : "300mm² 3-core XLPE 33kV";
  const cableRate = voltageLevel === "LV" ? 85 : voltageLevel === "HV" ? 145 : 280;
  items.push({ category: "Cable", item: cableType, quantity: cableDistance, unit: "m", unit_cost: cableRate, total_cost: cableDistance * cableRate });

  // Ducting
  items.push({ category: "Cable", item: "150mm HDPE duct", quantity: cableDistance, unit: "m", unit_cost: 12, total_cost: cableDistance * 12 });

  // Cable joints
  const joints = Math.max(2, Math.ceil(cableDistance / 250));
  items.push({ category: "Jointing", item: `${voltageLevel} straight joint`, quantity: joints, unit: "ea", unit_cost: 2800, total_cost: joints * 2800 });

  // Terminations
  items.push({ category: "Jointing", item: `${voltageLevel} cable termination`, quantity: 2, unit: "ea", unit_cost: 1500, total_cost: 3000 });

  // Switchgear
  if (voltageLevel !== "LV") {
    items.push({ category: "Switchgear", item: "Ring main unit (RMU)", quantity: 1, unit: "ea", unit_cost: 18500, total_cost: 18500 });
  }

  // Transformer
  if (proposed_kw <= 500) {
    items.push({ category: "Transformer", item: "500kVA ground-mounted transformer", quantity: 1, unit: "ea", unit_cost: 22000, total_cost: 22000 });
  } else if (proposed_kw <= 1000) {
    items.push({ category: "Transformer", item: "1000kVA ground-mounted transformer", quantity: 1, unit: "ea", unit_cost: 38000, total_cost: 38000 });
  } else {
    const count = Math.ceil(proposed_kw / 1500);
    items.push({ category: "Transformer", item: "1500kVA ground-mounted transformer", quantity: count, unit: "ea", unit_cost: 52000, total_cost: count * 52000 });
  }

  // Metering
  if (voltageLevel === "LV") {
    items.push({ category: "Metering", item: "Whole current meter", quantity: 1, unit: "ea", unit_cost: 1200, total_cost: 1200 });
  } else {
    items.push({ category: "Metering", item: "CT metering panel", quantity: 1, unit: "ea", unit_cost: 4500, total_cost: 4500 });
  }

  // Earthing
  items.push({ category: "Earthing", item: "Earth electrode & bonding", quantity: 1, unit: "lot", unit_cost: 3500, total_cost: 3500 });

  // Civils
  items.push({ category: "Civils", item: "Transformer plinth", quantity: 1, unit: "ea", unit_cost: 4200, total_cost: 4200 });
  items.push({ category: "Civils", item: "Cable marker tape", quantity: cableDistance, unit: "m", unit_cost: 2, total_cost: cableDistance * 2 });

  return items;
}
