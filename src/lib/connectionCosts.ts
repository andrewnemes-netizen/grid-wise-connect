/**
 * UK DNO Connection Cost Estimation Engine
 * Industry-standard unit rates for EV charging / ICP connections
 * 
 * ICP SOR line items are MATERIAL ONLY.
 * Labour is charged separately as day rates (LV Joint Team).
 */

export type VoltageOverride = "Auto" | "LV" | "HV" | "EHV";

export interface UnitRates {
  // Cable costs £/m (material only)
  cable_lv_per_m: number;
  cable_hv_per_m: number;
  cable_ehv_per_m: number;
  // Ducting
  duct_per_m: number;
  // Excavation costs £/m
  excavation_footway_per_m: number;
  excavation_carriageway_per_m: number;
  excavation_verge_per_m: number;
  // Fixed costs (material only)
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
  // SOR material-only rates
  lv_joint_team_day: number;
  joint_bay_soft: number;
  joint_bay_footway: number;
  joint_bay_carriageway: number;
  cable_joint_kit_185mm: number;
  cable_joint_kit_pot_end: number;
  service_cable_35mm_per_m: number;
  mains_extension_threshold_m: number;
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
  jointing_lv_each: 366,        // SOR material only (185mm waveform kit)
  termination_each: 450,        // SOR material only
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
  // SOR rates
  lv_joint_team_day: 1620,
  joint_bay_soft: 850,
  joint_bay_footway: 1330,
  joint_bay_carriageway: 2360,
  cable_joint_kit_185mm: 366.23,
  cable_joint_kit_pot_end: 182.53,
  service_cable_35mm_per_m: 8.50,
  mains_extension_threshold_m: 25,
};

export interface CostEstimate {
  cable_cost: number;
  excavation_cost: number;
  equipment_cost: number;
  labour_cost: number;
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
  cost_type?: "material" | "labour";
}

export interface BomItem {
  category: string;
  item: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  total_cost: number;
  notes?: string;
  cost_type?: "material" | "labour";
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

function deriveSurfaceSplit(constraints?: EstimateInput["constraints"]): SurfaceSplit {
  if (!constraints?.min_footway_m || !constraints?.min_carriageway_m) {
    return DEFAULT_SURFACE_SPLIT;
  }
  const fw = constraints.min_footway_m;
  const cw = constraints.min_carriageway_m;
  const total = fw + cw;
  if (total <= 0) return DEFAULT_SURFACE_SPLIT;
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
 * UK DNO cable selection thresholds (kVA -> cable size)
 * Design current: Ib = kW / (sqrt3 x 0.415kV) = kW / 0.719
 * kVA = kW / power_factor (0.95 default)
 */
export interface CableSelection {
  cable_type: string;
  size_mm2: number;
  current_rating_a: number;
  cost_per_m: number;
  impedance_per_km: number;
}

/** Service cable: 35mm concentric CNE — always used for LV service */
const LV_SERVICE_CABLE: CableSelection = {
  cable_type: "35mm² concentric CNE",
  size_mm2: 35,
  current_rating_a: 110,
  cost_per_m: 8.50,
  impedance_per_km: 1.1,
};

/** Mains extension cable: 185mm 4c XLPE/SWA — used when POC distance > threshold */
const LV_MAINS_EXTENSION_CABLE: CableSelection = {
  cable_type: "185mm² 4c XLPE/SWA",
  size_mm2: 185,
  current_rating_a: 295,
  cost_per_m: 48.00,
  impedance_per_km: 0.210,
};

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
 * For LV connections this returns the MAINS cable — service cable is always 35mm CNE.
 */
export function selectCableForLoad(proposed_kw: number, voltageLevel: "LV" | "HV" | "EHV", pf = 0.95): CableSelection {
  const kva = proposed_kw / pf;
  const thresholds = voltageLevel === "LV" ? LV_CABLE_THRESHOLDS
    : voltageLevel === "HV" ? HV_CABLE_THRESHOLDS
    : EHV_CABLE_THRESHOLDS;

  for (const t of thresholds) {
    if (kva <= t.max_kva) return t.cable;
  }
  return thresholds[thresholds.length - 1].cable;
}

/**
 * Calculate labour days based on scope of work.
 * All ICP SOR items are material-only; labour charged as LV Joint Team day rate.
 */
function calculateLabourDays(
  cableDistance: number,
  joints: number,
  terminations: number,
  hasMaInsExtension: boolean,
): number {
  let days = 0;
  // Cable pulling: 0.5 day per 100m
  days += Math.max(0.5, (cableDistance / 100) * 0.5);
  // Jointing: 0.5 day per joint
  days += joints * 0.5;
  // Terminations: 0.25 day each
  days += terminations * 0.25;
  // Testing & commissioning: 0.5 day
  days += 0.5;
  // Mains extension adds joint bay prep: 0.5 day
  if (hasMaInsExtension) days += 0.5;
  return Math.round(days * 2) / 2; // round to nearest 0.5
}

/**
 * Get joint bay cost based on dominant surface type.
 */
function getJointBayCost(split: SurfaceSplit, rates: UnitRates): { cost: number; surface: string } {
  if (split.carriageway_pct >= split.footway_pct && split.carriageway_pct >= split.verge_pct) {
    return { cost: rates.joint_bay_carriageway, surface: "carriageway" };
  }
  if (split.footway_pct >= split.verge_pct) {
    return { cost: rates.joint_bay_footway, surface: "footway" };
  }
  return { cost: rates.joint_bay_soft, surface: "unmade/soft" };
}

export function estimateConnectionCost(
  input: EstimateInput,
  rates: UnitRates = DEFAULT_UNIT_RATES
): CostEstimate {
  const { proposed_kw, distances, constraints, nearest_headroom_kw } = input;
  const breakdown: CostLineItem[] = [];

  const voltageLevel = resolveVoltageLevel(proposed_kw, input.voltage_override);

  // Cable distance
  const rawCableDistance =
    voltageLevel === "LV" ? distances.capacity_segment_m :
    voltageLevel === "HV" ? distances.feeder_m :
    distances.primary_m;
  const maxCableDistance = voltageLevel === "LV" ? 500 : voltageLevel === "HV" ? 3000 : 5000;
  const cableDistance = Math.min(rawCableDistance, maxCableDistance);

  const split = input.surface_split || deriveSurfaceSplit(input.constraints);
  const threshold = rates.mains_extension_threshold_m;
  const needsMainsExtension = voltageLevel === "LV" && cableDistance > threshold;

  // --- CABLE (Material) ---
  let totalCableCost = 0;

  if (voltageLevel === "LV") {
    // Service cable: 35mm² concentric CNE — always present
    const serviceCableLen = needsMainsExtension ? threshold : cableDistance;
    const serviceCableCost = Math.round(serviceCableLen * rates.service_cable_35mm_per_m);
    totalCableCost += serviceCableCost;
    breakdown.push({
      category: "Cable", description: `35mm² concentric CNE service cable (${serviceCableLen}m)`,
      quantity: serviceCableLen, unit: "m", unit_rate: rates.service_cable_35mm_per_m,
      total: serviceCableCost, cost_type: "material",
    });

    // Mains extension: 185mm² 4c XLPE when distance > threshold
    if (needsMainsExtension) {
      const mainsLen = cableDistance - threshold;
      const mainsCost = Math.round(mainsLen * LV_MAINS_EXTENSION_CABLE.cost_per_m);
      totalCableCost += mainsCost;
      breakdown.push({
        category: "Cable", description: `185mm² 4c XLPE/SWA mains extension (${mainsLen}m)`,
        quantity: mainsLen, unit: "m", unit_rate: LV_MAINS_EXTENSION_CABLE.cost_per_m,
        total: mainsCost, cost_type: "material",
      });
    }
  } else {
    // HV/EHV — standard cable selection
    const selectedCable = selectCableForLoad(proposed_kw, voltageLevel);
    const cableCost = Math.round(cableDistance * selectedCable.cost_per_m);
    totalCableCost += cableCost;
    breakdown.push({
      category: "Cable", description: `${selectedCable.cable_type} (${cableDistance}m)`,
      quantity: cableDistance, unit: "m", unit_rate: selectedCable.cost_per_m,
      total: cableCost, cost_type: "material",
    });
  }

  // Ducting (material)
  const ductCost = cableDistance * rates.duct_per_m;
  totalCableCost += ductCost;
  breakdown.push({
    category: "Cable", description: `HDPE duct (${cableDistance}m)`,
    quantity: cableDistance, unit: "m", unit_rate: rates.duct_per_m,
    total: ductCost, cost_type: "material",
  });

  // --- EXCAVATION ---
  const footwayM = Math.round(cableDistance * split.footway_pct);
  const carriagewayM = Math.round(cableDistance * split.carriageway_pct);
  const vergeM = Math.round(cableDistance * split.verge_pct);
  const excavationCost =
    footwayM * rates.excavation_footway_per_m +
    carriagewayM * rates.excavation_carriageway_per_m +
    vergeM * rates.excavation_verge_per_m;

  breakdown.push(
    { category: "Excavation", description: "Footway trenching", quantity: footwayM, unit: "m", unit_rate: rates.excavation_footway_per_m, total: footwayM * rates.excavation_footway_per_m, cost_type: "material" },
    { category: "Excavation", description: "Carriageway trenching", quantity: carriagewayM, unit: "m", unit_rate: rates.excavation_carriageway_per_m, total: carriagewayM * rates.excavation_carriageway_per_m, cost_type: "material" },
    { category: "Excavation", description: "Verge trenching", quantity: vergeM, unit: "m", unit_rate: rates.excavation_verge_per_m, total: vergeM * rates.excavation_verge_per_m, cost_type: "material" },
  );

  // --- EQUIPMENT (Material) ---
  // Joint bay + cable joint kit — only when mains extension triggered
  let jointBayCost = 0;
  let jointKitCost = 0;
  if (needsMainsExtension) {
    const jb = getJointBayCost(split, rates);
    jointBayCost = jb.cost;
    jointKitCost = rates.cable_joint_kit_185mm;
    breakdown.push(
      { category: "Equipment", description: `Joint bay (${jb.surface})`, quantity: 1, unit: "ea", unit_rate: jointBayCost, total: jointBayCost, cost_type: "material" },
      { category: "Equipment", description: "185mm waveform joint kit", quantity: 1, unit: "ea", unit_rate: jointKitCost, total: jointKitCost, cost_type: "material" },
    );
  }

  // Standard joints — 1 per 250m for longer runs (HV/EHV)
  let standardJointCost = 0;
  let jointCount = 0;
  if (voltageLevel !== "LV") {
    jointCount = Math.max(2, Math.ceil(cableDistance / 250));
    const jointRate = rates.jointing_each;
    standardJointCost = jointCount * jointRate;
    breakdown.push({ category: "Equipment", description: "Cable joints", quantity: jointCount, unit: "ea", unit_rate: jointRate, total: standardJointCost, cost_type: "material" });
  } else {
    // LV: pot end at service cable end
    const potEndCost = rates.cable_joint_kit_pot_end;
    standardJointCost = potEndCost;
    jointCount = 1;
    breakdown.push({ category: "Equipment", description: "Pot end (service cable)", quantity: 1, unit: "ea", unit_rate: potEndCost, total: potEndCost, cost_type: "material" });
  }

  // Cable terminations (material)
  const termCount = 2;
  const terminationCost = termCount * rates.termination_each;
  breakdown.push({ category: "Equipment", description: `${voltageLevel} cable termination`, quantity: termCount, unit: "ea", unit_rate: rates.termination_each, total: terminationCost, cost_type: "material" });

  // Switchgear — HV/EHV only
  let switchgearCost = 0;
  if (voltageLevel === "HV" || voltageLevel === "EHV") {
    switchgearCost = rates.switchgear_ring_main;
    breakdown.push({ category: "Equipment", description: "Ring main unit", quantity: 1, unit: "ea", unit_rate: rates.switchgear_ring_main, total: rates.switchgear_ring_main, cost_type: "material" });
  }

  // LV endpoint equipment
  let lvEndpointCost = 0;
  if (voltageLevel === "LV") {
    lvEndpointCost = rates.feeder_pillar_each + rates.cutout_100a_3ph;
    breakdown.push(
      { category: "Equipment", description: "LV feeder pillar", quantity: 1, unit: "ea", unit_rate: rates.feeder_pillar_each, total: rates.feeder_pillar_each, cost_type: "material" },
      { category: "Equipment", description: "100A 3-phase cutout", quantity: 1, unit: "ea", unit_rate: rates.cutout_100a_3ph, total: rates.cutout_100a_3ph, cost_type: "material" },
    );
  }

  // Transformer
  let transformerCost = 0;
  if (voltageLevel !== "LV" && proposed_kw > 0) {
    if (proposed_kw <= 500) {
      transformerCost = rates.transformer_500kva;
      breakdown.push({ category: "Equipment", description: "500kVA transformer", quantity: 1, unit: "ea", unit_rate: rates.transformer_500kva, total: rates.transformer_500kva, cost_type: "material" });
    } else if (proposed_kw <= 1000) {
      transformerCost = rates.transformer_1000kva;
      breakdown.push({ category: "Equipment", description: "1000kVA transformer", quantity: 1, unit: "ea", unit_rate: rates.transformer_1000kva, total: rates.transformer_1000kva, cost_type: "material" });
    } else {
      const count = Math.ceil(proposed_kw / 1500);
      transformerCost = count * rates.transformer_1500kva;
      breakdown.push({ category: "Equipment", description: "1500kVA transformer", quantity: count, unit: "ea", unit_rate: rates.transformer_1500kva, total: transformerCost, cost_type: "material" });
    }
  }

  // Metering
  const meteringCost = voltageLevel === "LV" ? rates.metering_wc : rates.metering_ct;
  breakdown.push({ category: "Equipment", description: voltageLevel === "LV" ? "Whole current meter" : "CT metering", quantity: 1, unit: "ea", unit_rate: meteringCost, total: meteringCost, cost_type: "material" });

  // Earthing & transformer civils — HV/EHV only
  let earthingCost = 0;
  let plinthCost = 0;
  if (voltageLevel !== "LV") {
    earthingCost = rates.earthing_lot;
    plinthCost = rates.transformer_plinth_each;
    breakdown.push(
      { category: "Equipment", description: "Earth electrode & bonding", quantity: 1, unit: "lot", unit_rate: rates.earthing_lot, total: earthingCost, cost_type: "material" },
      { category: "Equipment", description: "Transformer plinth", quantity: 1, unit: "ea", unit_rate: rates.transformer_plinth_each, total: plinthCost, cost_type: "material" },
    );
  }

  // Cable marker tape
  const markerTapeCost = cableDistance * rates.cable_marker_tape_per_m;
  breakdown.push({ category: "Equipment", description: "Cable marker tape", quantity: cableDistance, unit: "m", unit_rate: rates.cable_marker_tape_per_m, total: markerTapeCost, cost_type: "material" });

  const equipmentCost = jointBayCost + jointKitCost + standardJointCost + terminationCost + switchgearCost + lvEndpointCost + transformerCost + meteringCost + earthingCost + plinthCost + markerTapeCost;

  // --- LABOUR ---
  const totalJoints = jointCount + (needsMainsExtension ? 1 : 0);
  const labourDays = calculateLabourDays(cableDistance, totalJoints, termCount, needsMainsExtension);
  const labourCost = Math.round(labourDays * rates.lv_joint_team_day);
  breakdown.push({
    category: "Labour", description: `LV Joint Team (${labourDays} days)`,
    quantity: labourDays, unit: "days", unit_rate: rates.lv_joint_team_day,
    total: labourCost, cost_type: "labour",
  });

  // --- REINFORCEMENT ---
  let reinforcementCost = 0;
  if (nearest_headroom_kw !== undefined && proposed_kw > nearest_headroom_kw) {
    const overCapacity = proposed_kw - nearest_headroom_kw;
    reinforcementCost = Math.round(overCapacity * rates.reinforcement_per_kw_over_capacity);
    breakdown.push({ category: "Reinforcement", description: `Network reinforcement (${overCapacity}kW over headroom)`, quantity: overCapacity, unit: "kW", unit_rate: rates.reinforcement_per_kw_over_capacity, total: reinforcementCost });
  }

  const subtotal = totalCableCost + excavationCost + equipmentCost + labourCost + reinforcementCost;
  const designFee = Math.round(subtotal * rates.design_fee_pct);
  const pmFee = Math.round(subtotal * rates.project_management_pct);
  const contingency = Math.round(subtotal * rates.contingency_pct);
  const total = subtotal + designFee + pmFee + contingency;

  breakdown.push(
    { category: "Fees", description: "Design fee (8%)", quantity: 1, unit: "lot", unit_rate: designFee, total: designFee },
    { category: "Fees", description: "Project management (6%)", quantity: 1, unit: "lot", unit_rate: pmFee, total: pmFee },
    { category: "Contingency", description: "Contingency (10%)", quantity: 1, unit: "lot", unit_rate: contingency, total: contingency },
  );

  const confidence: "high" | "medium" | "low" =
    cableDistance < 500 && constraints?.capacity_flag !== "constrained" ? "high" :
    cableDistance < 1500 ? "medium" : "low";

  return {
    cable_cost: totalCableCost,
    excavation_cost: Math.round(excavationCost),
    equipment_cost: equipmentCost,
    labour_cost: labourCost,
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

  const split = input.surface_split || deriveSurfaceSplit(input.constraints);
  const footwayM = Math.round(cableDistance * split.footway_pct);
  const carriagewayM = Math.round(cableDistance * split.carriageway_pct);
  const vergeM = Math.round(cableDistance * split.verge_pct);

  const threshold = rates.mains_extension_threshold_m;
  const needsMainsExtension = voltageLevel === "LV" && cableDistance > threshold;
  const items: BomItem[] = [];

  // --- Cable ---
  if (voltageLevel === "LV") {
    const serviceCableLen = needsMainsExtension ? threshold : cableDistance;
    items.push({
      category: "Cable", item: `35mm² concentric CNE service cable`,
      quantity: serviceCableLen, unit: "m", unit_cost: rates.service_cable_35mm_per_m,
      total_cost: Math.round(serviceCableLen * rates.service_cable_35mm_per_m),
      cost_type: "material",
    });
    if (needsMainsExtension) {
      const mainsLen = cableDistance - threshold;
      items.push({
        category: "Cable", item: `185mm² 4c XLPE/SWA mains extension`,
        quantity: mainsLen, unit: "m", unit_cost: LV_MAINS_EXTENSION_CABLE.cost_per_m,
        total_cost: Math.round(mainsLen * LV_MAINS_EXTENSION_CABLE.cost_per_m),
        cost_type: "material",
      });
    }
  } else {
    const selectedCable = selectCableForLoad(proposed_kw, voltageLevel);
    const kva = proposed_kw / 0.95;
    const designCurrent_A = (proposed_kw * 1000) / (Math.sqrt(3) * 415 * 0.95);
    items.push({
      category: "Cable",
      item: `${selectedCable.cable_type} (${kva.toFixed(0)} kVA, Ib=${designCurrent_A.toFixed(1)}A, Iz=${selectedCable.current_rating_a}A)`,
      quantity: cableDistance, unit: "m", unit_cost: selectedCable.cost_per_m,
      total_cost: cableDistance * selectedCable.cost_per_m, cost_type: "material",
    });
  }

  // Ducting
  items.push({ category: "Cable", item: "150mm HDPE duct", quantity: cableDistance, unit: "m", unit_cost: rates.duct_per_m, total_cost: cableDistance * rates.duct_per_m, cost_type: "material" });

  // Excavation
  items.push(
    { category: "Excavation", item: "Footway trenching", quantity: footwayM, unit: "m", unit_cost: rates.excavation_footway_per_m, total_cost: footwayM * rates.excavation_footway_per_m, cost_type: "material" },
    { category: "Excavation", item: "Carriageway trenching", quantity: carriagewayM, unit: "m", unit_cost: rates.excavation_carriageway_per_m, total_cost: carriagewayM * rates.excavation_carriageway_per_m, cost_type: "material" },
    { category: "Excavation", item: "Verge trenching", quantity: vergeM, unit: "m", unit_cost: rates.excavation_verge_per_m, total_cost: vergeM * rates.excavation_verge_per_m, cost_type: "material" },
  );

  // Joint bay + cable joint kit (mains extension only)
  if (needsMainsExtension) {
    const jb = getJointBayCost(split, rates);
    items.push(
      { category: "Jointing", item: `Joint bay (${jb.surface})`, quantity: 1, unit: "ea", unit_cost: jb.cost, total_cost: jb.cost, cost_type: "material" },
      { category: "Jointing", item: "185mm waveform joint kit (E008)", quantity: 1, unit: "ea", unit_cost: rates.cable_joint_kit_185mm, total_cost: rates.cable_joint_kit_185mm, cost_type: "material" },
    );
  }

  // Pot end / standard joints
  if (voltageLevel === "LV") {
    items.push({ category: "Jointing", item: "Pot end (service cable)", quantity: 1, unit: "ea", unit_cost: rates.cable_joint_kit_pot_end, total_cost: rates.cable_joint_kit_pot_end, cost_type: "material" });
  } else {
    const joints = Math.max(2, Math.ceil(cableDistance / 250));
    items.push({ category: "Jointing", item: `${voltageLevel} straight joint`, quantity: joints, unit: "ea", unit_cost: rates.jointing_each, total_cost: joints * rates.jointing_each, cost_type: "material" });
  }

  // Terminations
  items.push({ category: "Jointing", item: `${voltageLevel} cable termination`, quantity: 2, unit: "ea", unit_cost: rates.termination_each, total_cost: 2 * rates.termination_each, cost_type: "material" });

  // Switchgear — HV/EHV only
  if (voltageLevel !== "LV") {
    items.push({ category: "Switchgear", item: "Ring main unit (RMU)", quantity: 1, unit: "ea", unit_cost: rates.switchgear_ring_main, total_cost: rates.switchgear_ring_main, cost_type: "material" });
  }

  // LV endpoint
  if (voltageLevel === "LV") {
    items.push(
      { category: "LV Endpoint", item: "LV feeder pillar", quantity: 1, unit: "ea", unit_cost: rates.feeder_pillar_each, total_cost: rates.feeder_pillar_each, cost_type: "material" },
      { category: "LV Endpoint", item: "100A 3-phase cutout", quantity: 1, unit: "ea", unit_cost: rates.cutout_100a_3ph, total_cost: rates.cutout_100a_3ph, cost_type: "material" },
    );
  }

  // Transformer
  if (voltageLevel !== "LV") {
    if (proposed_kw <= 500) {
      items.push({ category: "Transformer", item: "500kVA ground-mounted transformer", quantity: 1, unit: "ea", unit_cost: rates.transformer_500kva, total_cost: rates.transformer_500kva, cost_type: "material" });
    } else if (proposed_kw <= 1000) {
      items.push({ category: "Transformer", item: "1000kVA ground-mounted transformer", quantity: 1, unit: "ea", unit_cost: rates.transformer_1000kva, total_cost: rates.transformer_1000kva, cost_type: "material" });
    } else {
      const count = Math.ceil(proposed_kw / 1500);
      items.push({ category: "Transformer", item: "1500kVA ground-mounted transformer", quantity: count, unit: "ea", unit_cost: rates.transformer_1500kva, total_cost: count * rates.transformer_1500kva, cost_type: "material" });
    }
  }

  // Metering
  if (voltageLevel === "LV") {
    items.push({ category: "Metering", item: "Whole current meter", quantity: 1, unit: "ea", unit_cost: rates.metering_wc, total_cost: rates.metering_wc, cost_type: "material" });
  } else {
    items.push({ category: "Metering", item: "CT metering panel", quantity: 1, unit: "ea", unit_cost: rates.metering_ct, total_cost: rates.metering_ct, cost_type: "material" });
  }

  // Earthing & civils — HV/EHV only
  if (voltageLevel !== "LV") {
    items.push({ category: "Earthing", item: "Earth electrode & bonding", quantity: 1, unit: "lot", unit_cost: rates.earthing_lot, total_cost: rates.earthing_lot, cost_type: "material" });
    items.push({ category: "Civils", item: "Transformer plinth", quantity: 1, unit: "ea", unit_cost: rates.transformer_plinth_each, total_cost: rates.transformer_plinth_each, cost_type: "material" });
  }
  items.push({ category: "Civils", item: "Cable marker tape", quantity: cableDistance, unit: "m", unit_cost: rates.cable_marker_tape_per_m, total_cost: cableDistance * rates.cable_marker_tape_per_m, cost_type: "material" });

  // --- LABOUR ---
  const totalJoints = (voltageLevel === "LV" ? 1 : Math.max(2, Math.ceil(cableDistance / 250))) + (needsMainsExtension ? 1 : 0);
  const labourDays = calculateLabourDays(cableDistance, totalJoints, 2, needsMainsExtension);
  items.push({
    category: "Labour", item: `LV Joint Team (Day rate)`,
    quantity: labourDays, unit: "days", unit_cost: rates.lv_joint_team_day,
    total_cost: Math.round(labourDays * rates.lv_joint_team_day),
    cost_type: "labour",
  });

  // Reinforcement
  const nearest_headroom_kw = input.nearest_headroom_kw;
  if (nearest_headroom_kw !== undefined && proposed_kw > nearest_headroom_kw) {
    const overCapacity = proposed_kw - nearest_headroom_kw;
    items.push({ category: "Reinforcement", item: `Network reinforcement (${overCapacity}kW over headroom)`, quantity: overCapacity, unit: "kW", unit_cost: rates.reinforcement_per_kw_over_capacity, total_cost: Math.round(overCapacity * rates.reinforcement_per_kw_over_capacity) });
  }

  // Fees & contingency
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
