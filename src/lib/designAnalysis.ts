/**
 * Design Analysis Engine — G81 / DNO Compliant
 *
 * Runs comprehensive electrical validation per ENA G81 framework:
 *  - Segmented voltage drop (mains ≤3%, service ≤2%, total ≤5%)
 *  - Earth loop impedance (Zs) with capacity-based thresholds
 *  - Prospective fault current (PFC) per location type
 *  - ESQCR statutory voltage compliance (230V +10%/-6%)
 *  - Cable thermal rating validation
 *  - Diversity factor application (ADMD)
 *  - Auto-fix suggestions
 *
 * Pure calculation module — no UI, no DB access.
 */

import type { DesignCable, DesignElement, CableType } from "@/hooks/useDesignMode";

// ── Types ──────────────────────────────────────────────────────────────

export interface CableSpec {
  impedance_per_km: number;
  current_rating_a: number;
  cost_per_m: number;
  diameter_mm: number;
  cable_type: string;
  voltage_class: string;
}

/** G81 segmented voltage drop limits */
export interface G81VdLimits {
  /** Max VD% for LV mains (substation → feeder pillar). Default 3% */
  mains_pct: number;
  /** Max VD% for LV service (main → cutout). Default 2% */
  service_pct: number;
  /** Max total network VD%. Default 5% */
  total_pct: number;
}

/** Capacity-based Zs thresholds per G81 / DNO earthing policy (3-phase) */
export interface G81ZsThresholds {
  /** 60A 3-phase supply — typical 0.35Ω */
  zs_60a: number;
  /** 80A 3-phase supply — typical 0.20Ω */
  zs_80a: number;
  /** 100A 3-phase supply — typical 0.10Ω */
  zs_100a: number;
}

/** Expected PFC ranges per location type (A) */
export interface G81PfcRanges {
  /** Substation LV busbars — typical 16,000–25,000A */
  substation_min: number;
  substation_max: number;
  /** LV feeder pillar — typical 6,000–16,000A */
  feeder_pillar_min: number;
  feeder_pillar_max: number;
  /** Service cutout — typical 3,000–6,000A */
  cutout_min: number;
  cutout_max: number;
}

/** DNO G81 rule overrides loaded from dno_rulesets / ev_hub_rulesets */
export interface DnoRuleOverrides {
  /** Segmented VD limits per G81 */
  vd_limits?: Partial<G81VdLimits>;
  /** Legacy single VD limit — used if vd_limits not provided */
  vd_limit_pct?: number;
  /** Earth fault loop impedance at origin (Ω) */
  ze_ohms?: number;
  /** Capacity-based Zs thresholds */
  zs_thresholds?: Partial<G81ZsThresholds>;
  /** Legacy single Zs limit */
  zs_limit_ohms?: number;
  /** Expected PFC ranges */
  pfc_ranges?: Partial<G81PfcRanges>;
  /** Earthing system type */
  earthing_system?: "TN-C-S" | "TN-S" | "TT";
  /** Max LV service cable length (m) */
  max_service_length_m?: number;
  /** Joint spacing per voltage level (m) */
  joint_spacing_m?: number;
  /** Cover depths per surface type (mm) */
  cover_depths_mm?: Record<string, number>;
  /** Service length cap (m) */
  service_length_cap_m?: number;
  /** DNO code for audit trail */
  dno_code?: string;
  /** Ruleset version for audit trail */
  ruleset_version?: string;
}

/** Known upstream conditions at the point of connection (joint) */
export interface UpstreamConditions {
  /** Existing voltage drop % at the POC from the DNO network */
  existing_vd_pct: number;
  /** Existing impedance (Zs) at the POC in ohms */
  existing_zs_ohms: number;
  /** Source — 'manual' if user-entered, 'auto' if derived from network data */
  source: "manual" | "auto";
}

export interface DesignAnalysisInput {
  cables: DesignCable[];
  elements: DesignElement[];
  proposed_kw: number;
  supply_voltage_v?: number;
  power_factor?: number;
  diversity_factor?: number;
  /** Supply capacity (A) — used to select correct Zs threshold */
  supply_capacity_a?: number;
  vd_limit_pct?: number;
  ze_ohms?: number;
  zs_limit_ohms?: number;
  cable_specs: Record<string, CableSpec>;
  /** DNO-specific G81 rule overrides — takes priority over defaults */
  dno_rules?: DnoRuleOverrides;
  /** Known upstream electrical conditions at the point of connection */
  upstream?: UpstreamConditions;
}

export interface CableAnalysisResult {
  cable_id: string;
  cable_label: string;
  cable_type: CableType;
  cable_size: string;
  length_m: number;
  // Voltage drop
  vd_volts: number;
  vd_pct: number;
  vd_pass: boolean;
  /** Which G81 segment limit this cable was checked against */
  vd_segment_limit_pct: number;
  vd_segment: "mains" | "service" | "other";
  // Current / thermal
  design_current_a: number;
  cable_rating_a: number;
  utilisation_pct: number;
  thermal_pass: boolean;
  thermal_warn: boolean;
  // Impedance contribution
  impedance_ohms: number;
  // Status
  status: "pass" | "warning" | "fail";
  flags: AnalysisFlag[];
  suggestions: string[];
}

export interface NodeAnalysisResult {
  element_id: string;
  element_type: string;
  label: string;
  // Fault level at this node
  zs_ohms: number;
  zs_limit_ohms: number;
  pfc_amps: number;
  pfc_expected_min: number;
  pfc_expected_max: number;
  zs_pass: boolean | null;
  pfc_in_range: boolean;
  // ESQCR voltage at node
  delivered_voltage_v: number;
  esqcr_pass: boolean;
  // Earthing
  earthing_ok: boolean;
  flags: AnalysisFlag[];
  suggestions: string[];
}

export interface AnalysisFlag {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface DesignAnalysisResult {
  cables: CableAnalysisResult[];
  nodes: NodeAnalysisResult[];
  summary: {
    total_cables: number;
    total_length_m: number;
    // Segmented VD
    mains_vd_pct: number;
    service_vd_pct: number;
    total_vd_pct: number;
    total_vd_pass: boolean;
    mains_vd_pass: boolean;
    service_vd_pass: boolean;
    // Utilisation
    max_utilisation_pct: number;
    // Fault levels
    max_pfc_a: number;
    min_pfc_a: number;
    // ESQCR
    min_delivered_v: number;
    esqcr_pass: boolean;
    // Overall
    overall_pass: boolean;
    error_count: number;
    warning_count: number;
    suggestion_count: number;
    // Audit
    dno_code?: string;
    ruleset_version?: string;
    earthing_system: string;
    supply_capacity_a: number;
    zs_limit_applied: number;
    upstream_vd_pct?: number;
    upstream_zs_ohms?: number;
    upstream_source?: "manual" | "auto";
    /** Which constraint is the limiting factor */
    limiting_factor: "vd" | "zs" | "thermal" | "none";
  };
  engine_version: string;
  analysed_at: string;
}

// ── G81 Defaults ──────────────────────────────────────────────────────

const ENGINE_VERSION = "v2.0-g81";
const DEFAULT_SUPPLY_V = 400;
const DEFAULT_PHASE_V = 230;
const DEFAULT_PF = 0.95;
const DEFAULT_DIVERSITY = 1.0;

// ESQCR statutory limits: 230V +10%/-6%
const ESQCR_MIN_V = 216;
const ESQCR_MAX_V = 253;

const DEFAULT_VD_LIMITS: G81VdLimits = {
  mains_pct: 3,
  service_pct: 2,
  total_pct: 5,
};

const DEFAULT_ZS_THRESHOLDS: G81ZsThresholds = {
  zs_60a: 0.35,
  zs_80a: 0.20,
  zs_100a: 0.10,
};

const DEFAULT_PFC_RANGES: G81PfcRanges = {
  substation_min: 16000,
  substation_max: 25000,
  feeder_pillar_min: 6000,
  feeder_pillar_max: 16000,
  cutout_min: 3000,
  cutout_max: 6000,
};

const DEFAULT_ZE_OHMS: Record<string, number> = {
  "TN-C-S": 0.35,
  "TN-S": 0.8,
  "TT": 21,
};

// Default cable specs when catalogue data unavailable
const FALLBACK_SPECS: Record<string, CableSpec> = {
  lv_main: { impedance_per_km: 0.32, current_rating_a: 300, cost_per_m: 85, diameter_mm: 95, cable_type: "185mm² XLPE Al CNE", voltage_class: "LV" },
  lv_service: { impedance_per_km: 0.524, current_rating_a: 125, cost_per_m: 52, diameter_mm: 35, cable_type: "35mm² Cu", voltage_class: "LV" },
  hv_cable: { impedance_per_km: 0.125, current_rating_a: 400, cost_per_m: 145, diameter_mm: 185, cable_type: "300mm² XLPE Cu", voltage_class: "HV" },
  pilot_cable: { impedance_per_km: 1.2, current_rating_a: 30, cost_per_m: 12, diameter_mm: 6, cable_type: "4mm² pilot", voltage_class: "LV" },
};

// Upgrade paths for auto-fix suggestions
const UPGRADE_PATHS: Record<string, string[]> = {
  lv_main: ["185mm² Al → 300mm² Al", "300mm² Al → 400mm² Cu"],
  lv_service: ["35mm² Cu → 50mm² Cu", "50mm² Cu → 70mm² Cu"],
  hv_cable: ["185mm² Cu → 300mm² Cu", "300mm² Cu → 400mm² Cu"],
};

// ── Helpers ────────────────────────────────────────────────────────────

/** Select Zs limit based on supply capacity */
function selectZsLimit(capacityA: number, thresholds: G81ZsThresholds): number {
  if (capacityA >= 400) return thresholds.zs_400a;
  if (capacityA >= 300) return thresholds.zs_300a;
  if (capacityA >= 200) return thresholds.zs_200a;
  return thresholds.zs_100a;
}

/** Get expected PFC range for a node type */
function getPfcRange(elementType: string, ranges: G81PfcRanges): { min: number; max: number } {
  switch (elementType) {
    case "transformer": return { min: ranges.substation_min, max: ranges.substation_max };
    case "rmu":
    case "feeder_pillar": return { min: ranges.feeder_pillar_min, max: ranges.feeder_pillar_max };
    case "cutout":
    default: return { min: ranges.cutout_min, max: ranges.cutout_max };
  }
}

/** Determine which VD segment a cable type belongs to */
function getVdSegment(cableType: string): "mains" | "service" | "other" {
  if (cableType === "lv_main" || cableType === "hv_cable") return "mains";
  if (cableType === "lv_service") return "service";
  return "other";
}

function haversineProximity(a: { lng: number; lat: number }, b: { lng: number; lat: number }, maxM: number): boolean {
  const R = 6371000;
  const dLat = ((Number(b.lat) - Number(a.lat)) * Math.PI) / 180;
  const dLon = ((Number(b.lng) - Number(a.lng)) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(Number(a.lat) * Math.PI / 180) * Math.cos(Number(b.lat) * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) <= maxM;
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
function round2(n: number): number { return Math.round(n * 100) / 100; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
function round4(n: number): number { return Math.round(n * 10000) / 10000; }

// ── Engine ─────────────────────────────────────────────────────────────

export function runDesignAnalysis(input: DesignAnalysisInput): DesignAnalysisResult {
  const dno = input.dno_rules;
  const supplyV = input.supply_voltage_v ?? DEFAULT_SUPPLY_V;
  const pf = input.power_factor ?? DEFAULT_PF;
  const diversity = input.diversity_factor ?? DEFAULT_DIVERSITY;
  const supplyCapacity = input.supply_capacity_a ?? 100;
  const earthingSystem = dno?.earthing_system ?? "TN-C-S";

  // G81 segmented VD limits
  const vdLimits: G81VdLimits = {
    mains_pct: dno?.vd_limits?.mains_pct ?? DEFAULT_VD_LIMITS.mains_pct,
    service_pct: dno?.vd_limits?.service_pct ?? DEFAULT_VD_LIMITS.service_pct,
    total_pct: dno?.vd_limits?.total_pct ?? dno?.vd_limit_pct ?? input.vd_limit_pct ?? DEFAULT_VD_LIMITS.total_pct,
  };

  // Capacity-based Zs thresholds
  const zsThresholds: G81ZsThresholds = {
    zs_100a: dno?.zs_thresholds?.zs_100a ?? DEFAULT_ZS_THRESHOLDS.zs_100a,
    zs_200a: dno?.zs_thresholds?.zs_200a ?? DEFAULT_ZS_THRESHOLDS.zs_200a,
    zs_300a: dno?.zs_thresholds?.zs_300a ?? DEFAULT_ZS_THRESHOLDS.zs_300a,
    zs_400a: dno?.zs_thresholds?.zs_400a ?? DEFAULT_ZS_THRESHOLDS.zs_400a,
  };
  const zsLimit = selectZsLimit(supplyCapacity, zsThresholds);

  // PFC ranges
  const pfcRanges: G81PfcRanges = {
    substation_min: dno?.pfc_ranges?.substation_min ?? DEFAULT_PFC_RANGES.substation_min,
    substation_max: dno?.pfc_ranges?.substation_max ?? DEFAULT_PFC_RANGES.substation_max,
    feeder_pillar_min: dno?.pfc_ranges?.feeder_pillar_min ?? DEFAULT_PFC_RANGES.feeder_pillar_min,
    feeder_pillar_max: dno?.pfc_ranges?.feeder_pillar_max ?? DEFAULT_PFC_RANGES.feeder_pillar_max,
    cutout_min: dno?.pfc_ranges?.cutout_min ?? DEFAULT_PFC_RANGES.cutout_min,
    cutout_max: dno?.pfc_ranges?.cutout_max ?? DEFAULT_PFC_RANGES.cutout_max,
  };

  // Ze from earthing system type
  const ze = dno?.ze_ohms ?? input.ze_ohms ?? DEFAULT_ZE_OHMS[earthingSystem] ?? 0.35;

  const maxServiceLen = dno?.max_service_length_m ?? 25;
  const jointSpacing = dno?.joint_spacing_m ?? 200;
  const serviceLengthCap = dno?.service_length_cap_m ?? 30;

  // Design current (diversified) — 3-phase
  const rawIb = (input.proposed_kw * 1000) / (Math.sqrt(3) * supplyV * pf);
  const Ib = rawIb * diversity;

  // Start from upstream POC conditions if provided, otherwise from Ze
  let cumulativeZ = input.upstream ? input.upstream.existing_zs_ohms : ze;
  let cumulativeVdPct = input.upstream ? input.upstream.existing_vd_pct : 0;

  // Track segmented VD
  let mainsVdPct = 0;
  let serviceVdPct = 0;

  // Track which constraint limits design
  let limitedByVd = false;
  let limitedByZs = false;
  let limitedByThermal = false;

  // ── Cable Analysis ──────────────────────────────────────────────────

  const cableResults: CableAnalysisResult[] = input.cables.map((cable) => {
    const spec = input.cable_specs[cable.cable_type] || FALLBACK_SPECS[cable.cable_type] || FALLBACK_SPECS.lv_main;
    const flags: AnalysisFlag[] = [];
    const suggestions: string[] = [];
    const segment = getVdSegment(cable.cable_type);

    // ── Impedance ──
    const cableZ = (spec.impedance_per_km * cable.length_m) / 1000;
    cumulativeZ += cableZ;

    // ── Voltage Drop (segmented per G81) ──
    const vdV = Ib * spec.impedance_per_km * cable.length_m / 1000;
    const vdPct = (vdV / supplyV) * 100;
    cumulativeVdPct += vdPct;

    // Track segment totals
    if (segment === "mains") mainsVdPct += vdPct;
    if (segment === "service") serviceVdPct += vdPct;

    // Segment-specific limit check
    const segmentLimit = segment === "mains" ? vdLimits.mains_pct
      : segment === "service" ? vdLimits.service_pct
      : vdLimits.total_pct;
    const segmentVdTotal = segment === "mains" ? mainsVdPct : segment === "service" ? serviceVdPct : cumulativeVdPct;
    const segmentVdPass = segmentVdTotal <= segmentLimit;

    // Total network VD check
    const totalVdPass = cumulativeVdPct <= vdLimits.total_pct;
    const vdPass = segmentVdPass && totalVdPass;

    if (!segmentVdPass) {
      const segLabel = segment === "mains" ? "LV main" : segment === "service" ? "service" : "cable";
      flags.push({ code: "VD_SEGMENT_EXCEEDED", severity: "error", message: `${segLabel} VD ${segmentVdTotal.toFixed(2)}% exceeds G81 ${segLabel} limit of ${segmentLimit}%` });
      suggestions.push(`Reduce ${segLabel} cable length or upgrade to lower impedance cable`);
      const upgrades = UPGRADE_PATHS[cable.cable_type];
      if (upgrades?.length) suggestions.push(`Consider: ${upgrades[0]}`);
      limitedByVd = true;
    } else if (!totalVdPass) {
      flags.push({ code: "VD_TOTAL_EXCEEDED", severity: "error", message: `Total network VD ${cumulativeVdPct.toFixed(2)}% exceeds G81 limit of ${vdLimits.total_pct}%` });
      suggestions.push(`Total VD exceeded. Review both mains and service cable sizes.`);
      limitedByVd = true;
    } else if (segmentVdTotal > segmentLimit * 0.8) {
      flags.push({ code: "VD_MARGINAL", severity: "warning", message: `${segment} VD ${segmentVdTotal.toFixed(2)}% approaching ${segmentLimit}% limit` });
    }

    // ── Thermal / current rating ──
    const utilPct = (Ib / spec.current_rating_a) * 100;
    const thermalPass = Ib <= spec.current_rating_a;
    const thermalWarn = utilPct > 80 && utilPct <= 100;

    if (!thermalPass) {
      flags.push({ code: "THERMAL_EXCEEDED", severity: "error", message: `Design current ${Ib.toFixed(1)}A exceeds cable rating ${spec.current_rating_a}A (${utilPct.toFixed(0)}%)` });
      suggestions.push(`Upgrade cable from ${spec.cable_type} to higher rated alternative`);
      const upgrades = UPGRADE_PATHS[cable.cable_type];
      if (upgrades?.length) suggestions.push(`Recommended: ${upgrades[0]}`);
      limitedByThermal = true;
    } else if (thermalWarn) {
      flags.push({ code: "THERMAL_MARGINAL", severity: "warning", message: `Cable utilisation ${utilPct.toFixed(0)}% exceeds 80% advisory threshold` });
      suggestions.push(`Consider derating or upgrading for future load growth`);
    }

    // ── Zs check at this cable segment ──
    if (cumulativeZ > zsLimit) {
      flags.push({ code: "ZS_CABLE_EXCEEDED", severity: "error", message: `Cumulative Zs ${cumulativeZ.toFixed(3)}Ω exceeds ${zsLimit}Ω limit for ${supplyCapacity}A supply` });
      suggestions.push(`Reduce cable length or use lower impedance cable to meet Zs ≤ ${zsLimit}Ω`);
      limitedByZs = true;
    }

    // ── Cable length checks ──
    if (cable.cable_type === "lv_service" && cable.length_m > maxServiceLen) {
      flags.push({ code: "SERVICE_LENGTH", severity: "warning", message: `LV service cable ${cable.length_m.toFixed(0)}m exceeds ${dno?.dno_code || "default"} maximum of ${maxServiceLen}m` });
      suggestions.push(`Consider adding a feeder pillar to reduce service length`);
    }
    if (cable.cable_type === "lv_service" && cable.length_m > serviceLengthCap) {
      flags.push({ code: "SERVICE_CAP_EXCEEDED", severity: "error", message: `LV service ${cable.length_m.toFixed(0)}m exceeds ${dno?.dno_code || "DNO"} hard cap of ${serviceLengthCap}m — hybrid approach required` });
      suggestions.push(`Route exceeds service length cap. Hybrid mains + service approach required.`);
    }
    if (cable.cable_type === "lv_main" && cable.length_m > jointSpacing) {
      flags.push({ code: "JOINT_REQUIRED", severity: "info", message: `LV main ${cable.length_m.toFixed(0)}m — joint required every ${jointSpacing}m (${dno?.dno_code || "default"} rules)` });
      const jointsNeeded = Math.floor(cable.length_m / jointSpacing);
      suggestions.push(`Add ${jointsNeeded} joint(s) along this cable run`);
    }

    const status: "pass" | "warning" | "fail" = flags.some(f => f.severity === "error") ? "fail"
      : flags.some(f => f.severity === "warning") ? "warning" : "pass";

    return {
      cable_id: cable.id,
      cable_label: cable.label || `${cable.cable_type} cable`,
      cable_type: cable.cable_type as CableType,
      cable_size: spec.cable_type,
      length_m: round1(cable.length_m),
      vd_volts: round2(vdV),
      vd_pct: round2(vdPct),
      vd_pass: vdPass,
      vd_segment_limit_pct: segmentLimit,
      vd_segment: segment,
      design_current_a: round1(Ib),
      cable_rating_a: spec.current_rating_a,
      utilisation_pct: round1(utilPct),
      thermal_pass: thermalPass,
      thermal_warn: thermalWarn,
      impedance_ohms: round4(cableZ),
      status,
      flags,
      suggestions,
    };
  });

  // ── Node Analysis ────────────────────────────────────────────────────

  const nodeResults: NodeAnalysisResult[] = input.elements
    .filter(el => ["transformer", "rmu", "feeder_pillar", "cutout"].includes(el.element_type))
    .map((el) => {
      const flags: AnalysisFlag[] = [];
      const suggestions: string[] = [];

      // Zs at node
      const zsAtNode = cumulativeZ;
      // PFC = Uo / Zs (single-phase fault)
      const pfc = DEFAULT_PHASE_V / zsAtNode;

      // Zs limit check
      let zsPass: boolean | null = zsAtNode <= zsLimit;
      if (!zsPass) {
        flags.push({ code: "ZS_EXCEEDED", severity: "error", message: `Zs ${zsAtNode.toFixed(3)}Ω at ${el.label || el.element_type} exceeds ${zsLimit}Ω limit (${supplyCapacity}A supply)` });
        suggestions.push(`Reduce upstream cable lengths or use lower impedance cables. Zs = Ze + (R1+R2)`);
        limitedByZs = true;
      }

      // PFC range check per location type
      const pfcRange = getPfcRange(el.element_type, pfcRanges);
      const pfcInRange = pfc >= pfcRange.min && pfc <= pfcRange.max;

      if (pfc < pfcRange.min) {
        flags.push({ code: "PFC_LOW", severity: "warning", message: `PFC ${Math.round(pfc)}A below typical ${el.element_type.replace(/_/g, " ")} range (${(pfcRange.min/1000).toFixed(0)}–${(pfcRange.max/1000).toFixed(0)}kA)` });
        suggestions.push(`Check protective device trip characteristics — ADS time may not be met`);
      } else if (pfc > pfcRange.max) {
        flags.push({ code: "PFC_HIGH", severity: "warning", message: `PFC ${Math.round(pfc)}A above typical range — verify switchgear fault withstand rating` });
        suggestions.push(`Verify switchgear and cable withstand ratings for ${Math.round(pfc)}A fault level`);
      }

      // ESQCR statutory voltage check
      // Delivered voltage = nominal - (VD% of nominal)
      const deliveredV = DEFAULT_PHASE_V * (1 - cumulativeVdPct / 100);
      const esqcrPass = deliveredV >= ESQCR_MIN_V && deliveredV <= ESQCR_MAX_V;

      if (deliveredV < ESQCR_MIN_V) {
        flags.push({ code: "ESQCR_LOW", severity: "error", message: `Delivered voltage ${deliveredV.toFixed(1)}V below ESQCR minimum ${ESQCR_MIN_V}V at ${el.label || el.element_type}` });
        suggestions.push(`Reduce voltage drop to ensure delivered voltage ≥ ${ESQCR_MIN_V}V (230V -6%)`);
      }

      // Earthing check
      let earthingOk = true;
      if (el.element_type === "transformer") {
        const hasEarthing = input.elements.some(
          e => e.element_type === "joint" && haversineProximity(el, e, 50)
        );
        if (!hasEarthing) {
          flags.push({ code: "EARTHING_MISSING", severity: "warning", message: `Transformer ${el.label || ""} — no earthing element detected within 50m` });
          suggestions.push(`Add earthing arrangement near transformer (${earthingSystem} system)`);
          earthingOk = false;
        }
      }

      return {
        element_id: el.id,
        element_type: el.element_type,
        label: el.label || el.element_type.replace(/_/g, " "),
        zs_ohms: round3(zsAtNode),
        zs_limit_ohms: zsLimit,
        pfc_amps: Math.round(pfc),
        pfc_expected_min: pfcRange.min,
        pfc_expected_max: pfcRange.max,
        zs_pass: zsPass,
        pfc_in_range: pfcInRange,
        delivered_voltage_v: round1(deliveredV),
        esqcr_pass: esqcrPass,
        earthing_ok: earthingOk,
        flags,
        suggestions,
      };
    });

  // ── Summary ──────────────────────────────────────────────────────────

  const allFlags = [...cableResults.flatMap(c => c.flags), ...nodeResults.flatMap(n => n.flags)];
  const allSuggestions = [...cableResults.flatMap(c => c.suggestions), ...nodeResults.flatMap(n => n.suggestions)];
  const errorCount = allFlags.filter(f => f.severity === "error").length;
  const warningCount = allFlags.filter(f => f.severity === "warning").length;
  const totalLengthM = cableResults.reduce((s, c) => s + c.length_m, 0);
  const maxUtil = cableResults.length > 0 ? Math.max(...cableResults.map(c => c.utilisation_pct)) : 0;
  const pfcValues = nodeResults.map(n => n.pfc_amps);
  const deliveredVoltages = nodeResults.map(n => n.delivered_voltage_v);
  const minDeliveredV = deliveredVoltages.length > 0 ? Math.min(...deliveredVoltages) : DEFAULT_PHASE_V;

  // Determine limiting factor
  const limitingFactor: "vd" | "zs" | "thermal" | "none" =
    limitedByVd ? "vd"
    : limitedByZs ? "zs"
    : limitedByThermal ? "thermal"
    : "none";

  return {
    cables: cableResults,
    nodes: nodeResults,
    summary: {
      total_cables: cableResults.length,
      total_length_m: round1(totalLengthM),
      mains_vd_pct: round2(mainsVdPct),
      service_vd_pct: round2(serviceVdPct),
      total_vd_pct: round2(cumulativeVdPct),
      total_vd_pass: cumulativeVdPct <= vdLimits.total_pct,
      mains_vd_pass: mainsVdPct <= vdLimits.mains_pct,
      service_vd_pass: serviceVdPct <= vdLimits.service_pct,
      max_utilisation_pct: round1(maxUtil),
      max_pfc_a: pfcValues.length > 0 ? Math.max(...pfcValues) : 0,
      min_pfc_a: pfcValues.length > 0 ? Math.min(...pfcValues) : 0,
      min_delivered_v: round1(minDeliveredV),
      esqcr_pass: nodeResults.every(n => n.esqcr_pass),
      overall_pass: errorCount === 0,
      error_count: errorCount,
      warning_count: warningCount,
      suggestion_count: allSuggestions.length,
      dno_code: dno?.dno_code,
      ruleset_version: dno?.ruleset_version,
      earthing_system: earthingSystem,
      supply_capacity_a: supplyCapacity,
      zs_limit_applied: zsLimit,
      upstream_vd_pct: input.upstream?.existing_vd_pct,
      upstream_zs_ohms: input.upstream?.existing_zs_ohms,
      upstream_source: input.upstream?.source,
      limiting_factor: limitingFactor,
    },
    engine_version: ENGINE_VERSION,
    analysed_at: new Date().toISOString(),
  };
}
