/**
 * Design Analysis Engine
 *
 * Runs comprehensive electrical validation on Design Mode elements:
 *  - Voltage drop per cable run
 *  - Prospective fault current at nodes
 *  - Earthing impedance check
 *  - Cable thermal rating validation
 *  - Diversity factor application
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

export interface DesignAnalysisInput {
  cables: DesignCable[];
  elements: DesignElement[];
  proposed_kw: number;
  supply_voltage_v?: number;
  power_factor?: number;
  diversity_factor?: number;
  vd_limit_pct?: number;
  ze_ohms?: number;
  zs_limit_ohms?: number;
  cable_specs: Record<string, CableSpec>;
}

export interface CableAnalysisResult {
  cable_id: string;
  cable_label: string;
  cable_type: CableType;
  length_m: number;
  // Voltage drop
  vd_volts: number;
  vd_pct: number;
  vd_pass: boolean;
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
  pfc_amps: number;
  zs_pass: boolean | null;
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
    total_vd_pct: number;
    total_vd_pass: boolean;
    max_utilisation_pct: number;
    max_pfc_a: number;
    min_pfc_a: number;
    overall_pass: boolean;
    error_count: number;
    warning_count: number;
    suggestion_count: number;
  };
  engine_version: string;
  analysed_at: string;
}

// ── Constants ──────────────────────────────────────────────────────────

const ENGINE_VERSION = "v1.0-design";
const DEFAULT_SUPPLY_V = 400;
const DEFAULT_PF = 0.95;
const DEFAULT_DIVERSITY = 1.0;
const DEFAULT_VD_LIMIT_PCT = 5;
const DEFAULT_ZE_OHMS = 0.35;
const DEFAULT_FAULT_V = 230;

// Default cable specs when catalogue data unavailable
const FALLBACK_SPECS: Record<string, CableSpec> = {
  lv_main: { impedance_per_km: 0.32, current_rating_a: 300, cost_per_m: 85, diameter_mm: 95, cable_type: "185mm² XLPE Al", voltage_class: "LV" },
  lv_service: { impedance_per_km: 0.64, current_rating_a: 100, cost_per_m: 45, diameter_mm: 25, cable_type: "25mm² Cu", voltage_class: "LV" },
  hv_cable: { impedance_per_km: 0.125, current_rating_a: 400, cost_per_m: 145, diameter_mm: 185, cable_type: "300mm² XLPE Cu", voltage_class: "HV" },
  pilot_cable: { impedance_per_km: 1.2, current_rating_a: 30, cost_per_m: 12, diameter_mm: 6, cable_type: "4mm² pilot", voltage_class: "LV" },
};

// Upgrade paths for auto-fix suggestions
const UPGRADE_PATHS: Record<string, string[]> = {
  lv_main: ["185mm² Al → 300mm² Al", "300mm² Al → 400mm² Cu"],
  lv_service: ["25mm² Cu → 35mm² Cu", "35mm² Cu → 50mm² Cu"],
  hv_cable: ["185mm² Cu → 300mm² Cu", "300mm² Cu → 400mm² Cu"],
};

// ── Engine ─────────────────────────────────────────────────────────────

export function runDesignAnalysis(input: DesignAnalysisInput): DesignAnalysisResult {
  const supplyV = input.supply_voltage_v ?? DEFAULT_SUPPLY_V;
  const pf = input.power_factor ?? DEFAULT_PF;
  const diversity = input.diversity_factor ?? DEFAULT_DIVERSITY;
  const vdLimit = input.vd_limit_pct ?? DEFAULT_VD_LIMIT_PCT;
  const ze = input.ze_ohms ?? DEFAULT_ZE_OHMS;
  const zsLimit = input.zs_limit_ohms ?? null;

  // Design current (diversified)
  const rawIb = (input.proposed_kw * 1000) / (Math.sqrt(3) * supplyV * pf);
  const Ib = rawIb * diversity;

  let cumulativeZ = ze;
  let cumulativeVdPct = 0;

  // Analyse each cable
  const cableResults: CableAnalysisResult[] = input.cables.map((cable) => {
    const spec = input.cable_specs[cable.cable_type] || FALLBACK_SPECS[cable.cable_type] || FALLBACK_SPECS.lv_main;
    const flags: AnalysisFlag[] = [];
    const suggestions: string[] = [];

    // Impedance
    const cableZ = (spec.impedance_per_km * cable.length_m) / 1000;
    cumulativeZ += cableZ;

    // Voltage drop
    const vdV = Ib * spec.impedance_per_km * cable.length_m / 1000;
    const vdPct = (vdV / supplyV) * 100;
    cumulativeVdPct += vdPct;
    const vdPass = cumulativeVdPct <= vdLimit;

    if (!vdPass) {
      flags.push({ code: "VD_EXCEEDED", severity: "error", message: `Cumulative voltage drop ${cumulativeVdPct.toFixed(2)}% exceeds ${vdLimit}% limit` });
      suggestions.push(`Reduce cable length or upgrade to lower impedance cable`);
      const upgrades = UPGRADE_PATHS[cable.cable_type];
      if (upgrades?.length) suggestions.push(`Consider: ${upgrades[0]}`);
    } else if (cumulativeVdPct > vdLimit * 0.8) {
      flags.push({ code: "VD_MARGINAL", severity: "warning", message: `Cumulative voltage drop ${cumulativeVdPct.toFixed(2)}% is within 20% of ${vdLimit}% limit` });
    }

    // Thermal / current rating
    const utilPct = (Ib / spec.current_rating_a) * 100;
    const thermalPass = Ib <= spec.current_rating_a;
    const thermalWarn = utilPct > 80 && utilPct <= 100;

    if (!thermalPass) {
      flags.push({ code: "THERMAL_EXCEEDED", severity: "error", message: `Design current ${Ib.toFixed(1)}A exceeds cable rating ${spec.current_rating_a}A (${utilPct.toFixed(0)}% utilisation)` });
      suggestions.push(`Upgrade cable from ${spec.cable_type} to higher rated alternative`);
      const upgrades = UPGRADE_PATHS[cable.cable_type];
      if (upgrades?.length) suggestions.push(`Recommended: ${upgrades[0]}`);
    } else if (thermalWarn) {
      flags.push({ code: "THERMAL_MARGINAL", severity: "warning", message: `Cable utilisation ${utilPct.toFixed(0)}% exceeds 80% advisory threshold` });
      suggestions.push(`Consider derating or upgrading for future load growth`);
    }

    // Cable length check
    if (cable.cable_type === "lv_service" && cable.length_m > 25) {
      flags.push({ code: "SERVICE_LENGTH", severity: "warning", message: `LV service cable ${cable.length_m.toFixed(0)}m exceeds typical 25m maximum` });
      suggestions.push(`Consider adding a feeder pillar to reduce service length`);
    }
    if (cable.cable_type === "lv_main" && cable.length_m > 200) {
      flags.push({ code: "JOINT_REQUIRED", severity: "info", message: `LV main ${cable.length_m.toFixed(0)}m — joint recommended every 200m` });
      const jointsNeeded = Math.floor(cable.length_m / 200);
      suggestions.push(`Add ${jointsNeeded} joint(s) along this cable run`);
    }

    const status: "pass" | "warning" | "fail" = flags.some(f => f.severity === "error") ? "fail"
      : flags.some(f => f.severity === "warning") ? "warning" : "pass";

    return {
      cable_id: cable.id,
      cable_label: cable.label || `${cable.cable_type} cable`,
      cable_type: cable.cable_type as CableType,
      length_m: round1(cable.length_m),
      vd_volts: round2(vdV),
      vd_pct: round2(vdPct),
      vd_pass: vdPass,
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

  // Analyse nodes (equipment)
  const nodeResults: NodeAnalysisResult[] = input.elements
    .filter(el => ["transformer", "rmu", "feeder_pillar", "cutout"].includes(el.element_type))
    .map((el) => {
      const flags: AnalysisFlag[] = [];
      const suggestions: string[] = [];

      // Fault level at node
      const zsAtNode = cumulativeZ; // Simplified: use cumulative impedance
      const pfc = DEFAULT_FAULT_V / zsAtNode;
      let zsPass: boolean | null = null;

      if (zsLimit !== null) {
        zsPass = zsAtNode <= zsLimit;
        if (!zsPass) {
          flags.push({ code: "ZS_EXCEEDED", severity: "error", message: `Zs ${zsAtNode.toFixed(3)}Ω at ${el.label || el.element_type} exceeds ${zsLimit}Ω limit` });
          suggestions.push(`Reduce cable lengths upstream or use lower impedance cables`);
        }
      }

      // Earthing check
      let earthingOk = true;
      if (el.element_type === "transformer") {
        const hasEarthing = input.elements.some(
          e => e.element_type === "joint" && haversineProximity(el, e, 50)
        );
        if (!hasEarthing) {
          flags.push({ code: "EARTHING_MISSING", severity: "warning", message: `Transformer ${el.label || ""} — no earthing element detected within 50m` });
          suggestions.push(`Add earthing arrangement near this transformer`);
          earthingOk = false;
        }
      }

      // Fault level adequacy
      if (pfc < 1600) {
        flags.push({ code: "PFC_LOW", severity: "warning", message: `Prospective fault current ${Math.round(pfc)}A may be insufficient for protective device operation` });
        suggestions.push(`Check protective device trip characteristics at this location`);
      }

      return {
        element_id: el.id,
        element_type: el.element_type,
        label: el.label || el.element_type.replace(/_/g, " "),
        zs_ohms: round3(zsAtNode),
        pfc_amps: Math.round(pfc),
        zs_pass: zsPass,
        earthing_ok: earthingOk,
        flags,
        suggestions,
      };
    });

  // Summary
  const allFlags = [...cableResults.flatMap(c => c.flags), ...nodeResults.flatMap(n => n.flags)];
  const allSuggestions = [...cableResults.flatMap(c => c.suggestions), ...nodeResults.flatMap(n => n.suggestions)];
  const errorCount = allFlags.filter(f => f.severity === "error").length;
  const warningCount = allFlags.filter(f => f.severity === "warning").length;
  const totalLengthM = cableResults.reduce((s, c) => s + c.length_m, 0);
  const maxUtil = cableResults.length > 0 ? Math.max(...cableResults.map(c => c.utilisation_pct)) : 0;
  const pfcValues = nodeResults.map(n => n.pfc_amps);

  return {
    cables: cableResults,
    nodes: nodeResults,
    summary: {
      total_cables: cableResults.length,
      total_length_m: round1(totalLengthM),
      total_vd_pct: round2(cumulativeVdPct),
      total_vd_pass: cumulativeVdPct <= vdLimit,
      max_utilisation_pct: round1(maxUtil),
      max_pfc_a: pfcValues.length > 0 ? Math.max(...pfcValues) : 0,
      min_pfc_a: pfcValues.length > 0 ? Math.min(...pfcValues) : 0,
      overall_pass: errorCount === 0,
      error_count: errorCount,
      warning_count: warningCount,
      suggestion_count: allSuggestions.length,
    },
    engine_version: ENGINE_VERSION,
    analysed_at: new Date().toISOString(),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

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
