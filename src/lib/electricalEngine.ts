/**
 * Electrical Validation Engine V1
 *
 * Provides ICP-suitable electrical validation for LV radial networks:
 *  - Voltage drop calculation (Ib × Zc × L)
 *  - Current validation (Ib < In < Iz)
 *  - Fault level estimation (If = V / Zs)
 *  - Zs gateway check (Ze + R1 + R2)
 *
 * Configurable engineering defaults:
 *  - Power factor: 0.95
 *  - Diversity factor: 1.0
 *  - Supply voltage: 400V (3-phase)
 *
 * This engine is a pure calculation module — no UI, no DB access.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface ElectricalInput {
  /** Proposed load in kW */
  proposed_kw: number;
  /** Mains cable length in metres */
  mains_length_m: number;
  /** Service cable length in metres */
  service_length_m: number;
  /** Mains cable impedance (Ω/km) */
  mains_impedance_per_km: number;
  /** Service cable impedance (Ω/km) */
  service_impedance_per_km: number;
  /** Mains cable current rating (A) */
  mains_rating_a: number;
  /** Service cable current rating (A) */
  service_rating_a: number;
  /** Protective device rating In (A) — e.g. fuse or MCB */
  protective_device_in_a?: number;
  /** Supply voltage (V), default 400 */
  supply_voltage_v?: number;
  /** Power factor, default 0.95 */
  power_factor?: number;
  /** Diversity factor applied to load, default 1.0 */
  diversity_factor?: number;
  /** Max allowed voltage drop %, default 5 */
  vd_limit_pct?: number;
  /** External earth fault loop impedance Ze (Ω), default 0.35 */
  ze_ohms?: number;
  /** Zs gateway limit (Ω) — enables Zs check if set */
  zs_limit_ohms?: number;
  /** Nominal voltage for fault level calc (V), default 230 (single-phase equivalent) */
  fault_voltage_v?: number;
}

export interface VoltageDropResult {
  mains_vd_v: number;
  mains_vd_pct: number;
  service_vd_v: number;
  service_vd_pct: number;
  total_vd_v: number;
  total_vd_pct: number;
  pass: boolean;
  limit_pct: number;
}

export interface CurrentValidation {
  design_current_a: number;
  diversified_current_a: number;
  protective_device_in_a: number | null;
  mains_rating_a: number;
  service_rating_a: number;
  mains_utilisation_pct: number;
  service_utilisation_pct: number;
  /** Ib ≤ In ≤ Iz check */
  ib_le_in: boolean | null;
  in_le_iz_mains: boolean | null;
  in_le_iz_service: boolean | null;
  mains_ampacity_pass: boolean;
  service_ampacity_pass: boolean;
  mains_util_warn: boolean;
  service_util_warn: boolean;
}

export interface FaultLevelResult {
  /** Total Zs = Ze + R1 + R2 (Ω) */
  zs_total_ohms: number;
  /** Prospective fault current If = Uo / Zs (A) */
  prospective_fault_current_a: number;
  /** Zs gateway pass/fail */
  zs_pass: boolean | null;
  zs_limit_ohms: number | null;
}

export interface ElectricalValidationResult {
  voltage_drop: VoltageDropResult;
  current: CurrentValidation;
  fault_level: FaultLevelResult;
  overall_pass: boolean;
  flags: ElectricalFlag[];
  engine_version: string;
}

export interface ElectricalFlag {
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
}

// ── Constants ──────────────────────────────────────────────────────────

const ENGINE_VERSION = "v1.0";
const DEFAULT_SUPPLY_V = 400;
const DEFAULT_PF = 0.95;
const DEFAULT_DIVERSITY = 1.0;
const DEFAULT_VD_LIMIT_PCT = 5;
const DEFAULT_ZE_OHMS = 0.35;
const DEFAULT_FAULT_V = 230; // Single-phase equivalent for Zs calc

// ── Engine ─────────────────────────────────────────────────────────────

export function runElectricalValidation(input: ElectricalInput): ElectricalValidationResult {
  const supplyV = input.supply_voltage_v ?? DEFAULT_SUPPLY_V;
  const pf = input.power_factor ?? DEFAULT_PF;
  const diversity = input.diversity_factor ?? DEFAULT_DIVERSITY;
  const vdLimit = input.vd_limit_pct ?? DEFAULT_VD_LIMIT_PCT;
  const ze = input.ze_ohms ?? DEFAULT_ZE_OHMS;
  const zsLimit = input.zs_limit_ohms ?? null;
  const faultV = input.fault_voltage_v ?? DEFAULT_FAULT_V;

  const flags: ElectricalFlag[] = [];

  // ── Design current ──
  const rawIb = (input.proposed_kw * 1000) / (Math.sqrt(3) * supplyV * pf);
  const Ib = rawIb * diversity;

  // ── Voltage drop ──
  // ΔV = Ib × Z(Ω/km) × L(m) / 1000
  const mainsVdV = Ib * input.mains_impedance_per_km * input.mains_length_m / 1000;
  const serviceVdV = Ib * input.service_impedance_per_km * input.service_length_m / 1000;
  const totalVdV = mainsVdV + serviceVdV;
  const totalVdPct = (totalVdV / supplyV) * 100;
  const mainsVdPct = (mainsVdV / supplyV) * 100;
  const serviceVdPct = (serviceVdV / supplyV) * 100;
  const vdPass = totalVdPct <= vdLimit;

  if (!vdPass) {
    flags.push({
      code: "VD_EXCEEDED",
      severity: "error",
      message: `Voltage drop ${totalVdPct.toFixed(2)}% exceeds ${vdLimit}% limit`,
    });
  } else if (totalVdPct > vdLimit * 0.8) {
    flags.push({
      code: "VD_MARGINAL",
      severity: "warning",
      message: `Voltage drop ${totalVdPct.toFixed(2)}% is within 20% of ${vdLimit}% limit`,
    });
  }

  // ── Current validation ──
  const mainsUtil = (Ib / input.mains_rating_a) * 100;
  const serviceUtil = (Ib / input.service_rating_a) * 100;
  const mainsPass = Ib <= input.mains_rating_a;
  const servicePass = Ib <= input.service_rating_a;
  const mainsUtilWarn = mainsUtil > 80 && mainsUtil <= 100;
  const serviceUtilWarn = serviceUtil > 80 && serviceUtil <= 100;

  const In = input.protective_device_in_a ?? null;
  const ibLeIn = In !== null ? Ib <= In : null;
  const inLeIzMains = In !== null ? In <= input.mains_rating_a : null;
  const inLeIzService = In !== null ? In <= input.service_rating_a : null;

  if (!mainsPass) {
    flags.push({
      code: "MAINS_AMPACITY",
      severity: "error",
      message: `Mains: Ib ${Ib.toFixed(1)}A exceeds Iz ${input.mains_rating_a}A`,
    });
  }
  if (!servicePass) {
    flags.push({
      code: "SERVICE_AMPACITY",
      severity: "error",
      message: `Service: Ib ${Ib.toFixed(1)}A exceeds Iz ${input.service_rating_a}A`,
    });
  }
  if (mainsUtilWarn) {
    flags.push({
      code: "MAINS_UTIL_WARN",
      severity: "warning",
      message: `Mains utilisation ${mainsUtil.toFixed(0)}% exceeds 80% advisory threshold`,
    });
  }
  if (serviceUtilWarn) {
    flags.push({
      code: "SERVICE_UTIL_WARN",
      severity: "warning",
      message: `Service utilisation ${serviceUtil.toFixed(0)}% exceeds 80% advisory threshold`,
    });
  }
  if (In !== null && !ibLeIn) {
    flags.push({
      code: "IB_GT_IN",
      severity: "error",
      message: `Design current Ib ${Ib.toFixed(1)}A exceeds protective device In ${In}A`,
    });
  }
  if (In !== null && inLeIzMains === false) {
    flags.push({
      code: "IN_GT_IZ_MAINS",
      severity: "error",
      message: `Protective device In ${In}A exceeds mains cable Iz ${input.mains_rating_a}A`,
    });
  }

  // ── Fault level / Zs ──
  // Cable impedance contribution: Z = impedance_per_km × length / 1000
  const mainsZ = (input.mains_impedance_per_km * input.mains_length_m) / 1000;
  const serviceZ = (input.service_impedance_per_km * input.service_length_m) / 1000;
  const zsTotal = ze + mainsZ + serviceZ;
  const pfc = faultV / zsTotal; // Prospective fault current
  let zsPass: boolean | null = null;

  if (zsLimit !== null) {
    zsPass = zsTotal <= zsLimit;
    if (!zsPass) {
      flags.push({
        code: "ZS_EXCEEDED",
        severity: "error",
        message: `Zs ${zsTotal.toFixed(3)}Ω exceeds ${zsLimit}Ω gateway limit`,
      });
    }
  }

  // ── Overall ──
  const hasErrors = flags.some((f) => f.severity === "error");

  return {
    voltage_drop: {
      mains_vd_v: round2(mainsVdV),
      mains_vd_pct: round2(mainsVdPct),
      service_vd_v: round2(serviceVdV),
      service_vd_pct: round2(serviceVdPct),
      total_vd_v: round2(totalVdV),
      total_vd_pct: round2(totalVdPct),
      pass: vdPass,
      limit_pct: vdLimit,
    },
    current: {
      design_current_a: round1(rawIb),
      diversified_current_a: round1(Ib),
      protective_device_in_a: In,
      mains_rating_a: input.mains_rating_a,
      service_rating_a: input.service_rating_a,
      mains_utilisation_pct: round1(mainsUtil),
      service_utilisation_pct: round1(serviceUtil),
      ib_le_in: ibLeIn,
      in_le_iz_mains: inLeIzMains,
      in_le_iz_service: inLeIzService,
      mains_ampacity_pass: mainsPass,
      service_ampacity_pass: servicePass,
      mains_util_warn: mainsUtilWarn,
      service_util_warn: serviceUtilWarn,
    },
    fault_level: {
      zs_total_ohms: round3(zsTotal),
      prospective_fault_current_a: Math.round(pfc),
      zs_pass: zsPass,
      zs_limit_ohms: zsLimit,
    },
    overall_pass: !hasErrors,
    flags,
    engine_version: ENGINE_VERSION,
  };
}

// ── Helpers ────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
