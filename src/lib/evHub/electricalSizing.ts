/**
 * Module E: Electrical Sizing Framework
 * Structure only — all thresholds from rule set.
 * Outputs feasibility state.
 */
import type { ElectricalSizingResult, FeasibilityState, EvHubRules } from "./types";

export interface ElectricalInput {
  charger_count: number;
  charger_kw_each: number;
  diversity_factor: number;
  extraneous_within_2p5m: boolean;
  network_headroom_kva: number | null;
  transformer_loading_pct: number | null;
}

export function computeElectricalSizing(
  input: ElectricalInput,
  rules: EvHubRules
): ElectricalSizingResult {
  const reason_codes: string[] = [];

  // Total diversified demand
  const rawDemandKw = input.charger_count * input.charger_kw_each;
  const diversifiedKw = rawDemandKw * input.diversity_factor;
  // Approximate kVA (assume PF ~0.95)
  const totalDemandKva = diversifiedKw / 0.95;

  // LV threshold from rules
  const lvMaxKva = (rules.lv_max_demand_kva?.value as number) ?? 276;

  // Determine state
  let state: FeasibilityState = "LV_OK";

  if (totalDemandKva > lvMaxKva) {
    state = "HV_CONNECTION_REQUIRED";
    reason_codes.push("DEMAND_EXCEEDS_LV_THRESHOLD");
  }

  // Earthing check — extraneous parts
  if (input.extraneous_within_2p5m) {
    state = "ENGINEERING_REVIEW_REQUIRED";
    reason_codes.push("EXTRANEOUS_WITHIN_2P5M");
  }

  // Network headroom check
  if (input.network_headroom_kva != null && totalDemandKva > input.network_headroom_kva) {
    if (state === "LV_OK") state = "LV_REINFORCEMENT_REQUIRED";
    reason_codes.push("EXCEEDS_NETWORK_HEADROOM");
  }

  // If critical rule fields are pending → STUDY_REQUIRED
  const pendingCritical = [
    rules.service_cable_default,
    rules.lv_main_cables,
    rules.protection_grading,
  ].filter((f) => f?.pending === true);

  if (pendingCritical.length > 0) {
    if (state === "LV_OK") state = "DNO_STUDY_REQUIRED";
    reason_codes.push("CRITICAL_RULE_FIELDS_PENDING");
  }

  // Cable selections (placeholder strings from rule set)
  const serviceCable = rules.service_cable_default?.pending
    ? "PENDING"
    : String(rules.service_cable_default?.value ?? "PENDING");

  const lvMainCable = rules.lv_main_cables?.pending
    ? "PENDING"
    : String(rules.lv_main_cables?.value ?? "PENDING");

  // Protection grading placeholder
  const protectionStatus = rules.protection_grading?.pending
    ? "REVIEW_REQUIRED" as const
    : "PASS" as const;

  return {
    state,
    total_demand_kva: Math.round(totalDemandKva * 100) / 100,
    service_cable: serviceCable,
    lv_main_cable: lvMainCable,
    protection_grading: {
      status: protectionStatus,
      notes: protectionStatus === "REVIEW_REQUIRED" ? ["Protection grading rules pending DNO extraction"] : [],
    },
    reinforcement_trigger: state === "LV_REINFORCEMENT_REQUIRED" || state === "HV_CONNECTION_REQUIRED",
    reason_codes,
  };
}
