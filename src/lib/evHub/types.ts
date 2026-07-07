/**
 * EV_HUB_ENGINE_V1_FRAMEWORK
 * Core type definitions for the EV Hub DNO Engine
 */

// ── DNO Anchor ──────────────────────────────────────────────

export type DnoKey = "UKPN" | "NPG" | "ENWL" | "NGED" | "SPEN" | "SSEN" | "NIE";

export interface DnoAnchorResult {
  dno_key: DnoKey;
  rule_set_id: string;
}

// ── Rule Catalogue ──────────────────────────────────────────

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface RuleField {
  value: unknown;
  confidence: ConfidenceLevel;
  source: string;
  pending: boolean;
}

export interface EvHubRuleSet {
  id: string;
  dno_key: DnoKey | "UK_ALL";
  rule_set_id: string;
  version: string;
  is_active: boolean;
  rules: EvHubRules;
}

export interface EvHubRules {
  /** Max demand threshold for LV-only (kVA) */
  lv_max_demand_kva: RuleField;
  /** Default service cable type */
  service_cable_default: RuleField;
  /** LV main cable options by load band */
  lv_main_cables: RuleField;
  /** Cover depths by surface type (mm) */
  cover_depths_mm: RuleField;
  /** Earthing: distance threshold for extraneous parts (m) */
  extraneous_distance_threshold_m: RuleField;
  /** Headroom factor for reinforcement trigger */
  headroom_factor: RuleField;
  /** Fault level thresholds */
  fault_level_thresholds: RuleField;
  /** Transformer loading thresholds (%) */
  transformer_loading_thresholds: RuleField;
  /** Reinforcement mitigation sequence */
  reinforcement_mitigation_sequence: RuleField;
  /** Cable scoring weights for candidate selection */
  cable_scoring_weights: RuleField;
  /** Protection grading parameters */
  protection_grading: RuleField;
  /** Traffic management rules */
  traffic_management_rules: RuleField;
  /** Max service cable length before LV main extension triggered (m) */
  max_service_length_m?: RuleField;
  /** Additional DNO-specific rules */
  [key: string]: RuleField;
}

// ── Cable Selection ─────────────────────────────────────────

export type LinkageTier = "TIER1" | "TIER2" | "TIER3";

export interface CandidatePoC {
  cable_segment_id: string;
  linkage_tier: LinkageTier;
  score: number;
  confidence: ConfidenceLevel;
  reason_codes: string[];
}

export interface CableSelectionResult {
  candidate_poc: CandidatePoC | null;
  alternatives: CandidatePoC[];
  warnings: string[];
}

// ── Route Segmentation ──────────────────────────────────────

export type SurfaceType = "FOOTWAY" | "CARRIAGEWAY" | "VERGE";

export interface RouteSegment {
  segment_id: string;
  surface_type: SurfaceType;
  length_m: number;
  cover_depth_mm: number;
  duct_required: boolean;
}

export interface RouteCrossing {
  crossing_id: string;
  crossing_type: "ROAD" | "RAIL" | "WATER" | "UTILITY";
  width_m: number;
  method: string;
}

export interface RouteQuantities {
  segments: RouteSegment[];
  crossings: RouteCrossing[];
  total_length_m: number;
  traffic_management_required: boolean;
}

// ── Electrical Sizing ───────────────────────────────────────

export type FeasibilityState =
  | "LV_OK"
  | "DNO_STUDY_REQUIRED"
  | "ENGINEERING_REVIEW_REQUIRED"
  | "LV_REINFORCEMENT_REQUIRED"
  | "HV_CONNECTION_REQUIRED";

export interface ElectricalSizingResult {
  state: FeasibilityState;
  total_demand_kva: number;
  service_cable: string;
  lv_main_cable: string;
  protection_grading: {
    status: "PASS" | "FAIL" | "REVIEW_REQUIRED";
    notes: string[];
  };
  reinforcement_trigger: boolean;
  reason_codes: string[];
}

// ── Earthing Risk ───────────────────────────────────────────

export type EarthingSelection =
  | "TN-C-S"
  | "TN-S"
  | "TT"
  | "UNCONFIRMED";

export interface EarthingResult {
  selected: EarthingSelection;
  review_required: boolean;
  reason_codes: string[];
  warnings: string[];
}

// ── Reinforcement ───────────────────────────────────────────

export type ReinforcementState =
  | "NO_REINFORCEMENT"
  | "LV_REINFORCEMENT_REQUIRED"
  | "HV_REINFORCEMENT_REQUIRED"
  | "STUDY_REQUIRED";

export interface ReinforcementResult {
  state: ReinforcementState;
  headroom_remaining_kva: number | null;
  fault_level_ok: boolean | null;
  transformer_loading_pct: number | null;
  mitigation_steps: string[];
  reason_codes: string[];
}

// ── Split BOQ ───────────────────────────────────────────────

export interface BoqItem {
  item_code: string;
  description: string;
  unit: string;
  quantity: number;
  category: "electrical" | "civils" | "traffic_mgmt" | "fees";
}

export interface SplitBoq {
  electrical: BoqItem[];
  civils: BoqItem[];
  traffic_mgmt: BoqItem[];
  fees: BoqItem[];
}

// ── Audit & Confidence ──────────────────────────────────────

export interface AuditTrace {
  reason_codes: string[];
  warnings: string[];
  pending_fields: string[];
  confidence_by_field: Record<string, ConfidenceLevel>;
  engine_trace: Record<string, unknown>;
  engine_version: string;
  timestamp: string;
}

// ── Full Engine Input ───────────────────────────────────────

export interface EvHubEngineInput {
  site_lat: number;
  site_lng: number;
  charger_count: number;
  charger_kw_each: number;
  diversity_factor?: number;
  extraneous_within_2p5m: boolean;
  route_geojson?: GeoJSON.LineString;
  lv_cable_layer_available: boolean;
  pillar_location?: { lat: number; lng: number };
  /** Override auto-detected DNO */
  dno_override?: DnoKey;
}

// ── Full Engine Output ──────────────────────────────────────

export interface EvHubEngineOutput {
  version: "EV_HUB_ENGINE_V1_FRAMEWORK";
  dno_anchor: DnoAnchorResult;
  cable_selection: CableSelectionResult;
  route_quantities: RouteQuantities;
  electrical_sizing: ElectricalSizingResult;
  earthing: EarthingResult;
  reinforcement: ReinforcementResult;
  boq: SplitBoq;
  feasibility_state: FeasibilityState;
  audit: AuditTrace;
}
