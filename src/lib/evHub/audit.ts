/**
 * Module I: Audit & Confidence System
 * Aggregates reason_codes, warnings, pending_fields, confidence_by_field, engine_trace
 * If any safety-critical field confidence ≠ HIGH → auto STUDY_REQUIRED or REVIEW_REQUIRED
 */
import type {
  AuditTrace,
  ConfidenceLevel,
  FeasibilityState,
  EvHubRules,
  CableSelectionResult,
  RouteQuantities,
  ElectricalSizingResult,
  EarthingResult,
  ReinforcementResult,
} from "./types";

const SAFETY_CRITICAL_FIELDS = [
  "extraneous_distance_threshold_m",
  "lv_max_demand_kva",
  "fault_level_thresholds",
  "protection_grading",
  "transformer_loading_thresholds",
];

/**
 * Build the full audit trace from all module outputs
 */
export function buildAuditTrace(
  rules: EvHubRules,
  cableSelection: CableSelectionResult,
  routeQuantities: RouteQuantities,
  electricalSizing: ElectricalSizingResult,
  earthing: EarthingResult,
  reinforcement: ReinforcementResult
): AuditTrace {
  const reason_codes: string[] = [];
  const warnings: string[] = [];
  const pending_fields: string[] = [];
  const confidence_by_field: Record<string, ConfidenceLevel> = {};

  // Collect from all modules
  reason_codes.push(...electricalSizing.reason_codes);
  reason_codes.push(...earthing.reason_codes);
  reason_codes.push(...reinforcement.reason_codes);
  if (cableSelection.candidate_poc) {
    reason_codes.push(...cableSelection.candidate_poc.reason_codes);
  }

  warnings.push(...cableSelection.warnings);
  warnings.push(...earthing.warnings);

  // Scan rules for pending fields and confidence
  for (const [key, field] of Object.entries(rules)) {
    if (field && typeof field === "object" && "confidence" in field) {
      confidence_by_field[key] = field.confidence as ConfidenceLevel;
      if (field.pending) {
        pending_fields.push(key);
      }
    }
  }

  // Engine trace
  const engine_trace: Record<string, unknown> = {
    cable_selection_score: cableSelection.candidate_poc?.score ?? null,
    cable_selection_tier: cableSelection.candidate_poc?.linkage_tier ?? null,
    route_total_length_m: routeQuantities.total_length_m,
    route_segments_count: routeQuantities.segments.length,
    route_crossings_count: routeQuantities.crossings.length,
    electrical_demand_kva: electricalSizing.total_demand_kva,
    electrical_state: electricalSizing.state,
    earthing_selected: earthing.selected,
    earthing_review: earthing.review_required,
    reinforcement_state: reinforcement.state,
    reinforcement_headroom_kva: reinforcement.headroom_remaining_kva,
  };

  // Deduplicate
  const uniqueReasons = [...new Set(reason_codes)];
  const uniqueWarnings = [...new Set(warnings)];

  return {
    reason_codes: uniqueReasons,
    warnings: uniqueWarnings,
    pending_fields,
    confidence_by_field,
    engine_trace,
    engine_version: "EV_HUB_ENGINE_V1_FRAMEWORK",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Determine if any safety-critical field has non-HIGH confidence,
 * and escalate the feasibility state accordingly.
 */
export function applyConfidenceEscalation(
  currentState: FeasibilityState,
  audit: AuditTrace
): FeasibilityState {
  for (const field of SAFETY_CRITICAL_FIELDS) {
    const confidence = audit.confidence_by_field[field];
    if (confidence && confidence !== "HIGH") {
      // Escalate if currently OK
      if (currentState === "LV_OK") {
        return "DNO_STUDY_REQUIRED";
      }
    }
  }

  // Pending fields also trigger escalation
  if (audit.pending_fields.length > 0 && currentState === "LV_OK") {
    return "DNO_STUDY_REQUIRED";
  }

  return currentState;
}
