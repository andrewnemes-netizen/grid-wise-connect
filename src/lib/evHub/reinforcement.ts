/**
 * Module G: Reinforcement Decision Engine
 * Framework only — all thresholds from rule JSON. No hard-coded numbers.
 */
import type { ReinforcementResult, ReinforcementState, EvHubRules } from "./types";

export interface ReinforcementInput {
  total_demand_kva: number;
  network_headroom_kva: number | null;
  fault_level_ka: number | null;
  transformer_loading_pct: number | null;
  transformer_capacity_kva: number | null;
}

export function assessReinforcement(
  input: ReinforcementInput,
  rules: EvHubRules
): ReinforcementResult {
  const reason_codes: string[] = [];
  const mitigation_steps: string[] = [];
  let state: ReinforcementState = "NO_REINFORCEMENT";

  // ── Headroom check ──
  const headroomFactor = rules.headroom_factor?.value as number | null;
  let headroom_remaining_kva: number | null = null;

  if (input.network_headroom_kva != null) {
    headroom_remaining_kva = input.network_headroom_kva - input.total_demand_kva;
    if (headroom_remaining_kva < 0) {
      state = "LV_REINFORCEMENT_REQUIRED";
      reason_codes.push("EXCEEDS_NETWORK_HEADROOM");
    } else if (headroomFactor != null && headroom_remaining_kva < input.total_demand_kva * headroomFactor) {
      state = "STUDY_REQUIRED";
      reason_codes.push("HEADROOM_MARGINAL");
    }
  } else {
    state = "STUDY_REQUIRED";
    reason_codes.push("HEADROOM_DATA_UNAVAILABLE");
  }

  // ── Fault level check ──
  const faultThresholds = rules.fault_level_thresholds?.value as Record<string, number> | null;
  let fault_level_ok: boolean | null = null;

  if (input.fault_level_ka != null && faultThresholds) {
    const minFaultLevel = faultThresholds.minimum_ka ?? 0;
    const maxFaultLevel = faultThresholds.maximum_ka ?? Infinity;
    fault_level_ok = input.fault_level_ka >= minFaultLevel && input.fault_level_ka <= maxFaultLevel;
    if (!fault_level_ok) {
      state = "STUDY_REQUIRED";
      reason_codes.push("FAULT_LEVEL_OUT_OF_RANGE");
    }
  } else if (rules.fault_level_thresholds?.pending) {
    reason_codes.push("FAULT_LEVEL_RULES_PENDING");
  }

  // ── Transformer loading check ──
  const txThresholds = rules.transformer_loading_thresholds?.value as Record<string, number> | null;
  let transformer_loading_pct = input.transformer_loading_pct;

  if (transformer_loading_pct == null && input.transformer_capacity_kva != null && input.transformer_capacity_kva > 0) {
    transformer_loading_pct = (input.total_demand_kva / input.transformer_capacity_kva) * 100;
  }

  if (transformer_loading_pct != null && txThresholds) {
    const maxLoading = txThresholds.max_loading_pct ?? 80;
    if (transformer_loading_pct > maxLoading) {
      if (state === "NO_REINFORCEMENT") state = "LV_REINFORCEMENT_REQUIRED";
      reason_codes.push("TRANSFORMER_OVERLOADED");
    }
  } else if (rules.transformer_loading_thresholds?.pending) {
    reason_codes.push("TRANSFORMER_RULES_PENDING");
  }

  // ── Mitigation sequence from rules ──
  const mitigationSeq = rules.reinforcement_mitigation_sequence?.value as string[] | null;
  if (mitigationSeq && state !== "NO_REINFORCEMENT") {
    mitigation_steps.push(...mitigationSeq);
  }

  // If any critical rules are pending, escalate to STUDY_REQUIRED
  if (rules.headroom_factor?.pending || rules.transformer_loading_thresholds?.pending || rules.fault_level_thresholds?.pending) {
    if (state === "NO_REINFORCEMENT") state = "STUDY_REQUIRED";
    if (!reason_codes.includes("CRITICAL_REINFORCEMENT_RULES_PENDING")) {
      reason_codes.push("CRITICAL_REINFORCEMENT_RULES_PENDING");
    }
  }

  return {
    state,
    headroom_remaining_kva,
    fault_level_ok,
    transformer_loading_pct: transformer_loading_pct ?? null,
    mitigation_steps,
    reason_codes,
  };
}
