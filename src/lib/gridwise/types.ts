/**
 * GRIDWISE CONNECT — Unified Project Types
 * 
 * Master type definitions that consolidate all engine outputs
 * into a single GridwiseProject object. This is the single source
 * of truth for the end-to-end pipeline.
 */

import type {
  DnoAnchorResult,
  CableSelectionResult,
  RouteQuantities,
  ElectricalSizingResult,
  EarthingResult,
  ReinforcementResult,
  SplitBoq,
  FeasibilityState,
  AuditTrace,
  DnoKey,
} from "../evHub/types";
import type { CostEstimate, BomItem, SurfaceSplit } from "../connectionCosts";
import type { ElectricalValidationResult } from "../electricalEngine";
import type { RawMetrics } from "../scoringEngine";

// ── Site Input ──────────────────────────────────────────────

export interface SiteInput {
  site_name: string;
  postcode?: string;
  lat: number;
  lng: number;
  /** Site boundary as GeoJSON polygon */
  boundary_geojson?: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  /** Proposed total demand in kW */
  proposed_kw: number;
  /** Charger configuration */
  charger_count: number;
  charger_kw_each: number;
  /** Diversity factor (default 1.0) */
  diversity_factor?: number;
  /** Extraneous conductive parts within threshold distance */
  extraneous_within_2p5m: boolean;
  /** Route drawn by user (GeoJSON LineString) */
  route_geojson?: GeoJSON.LineString;
  /** Voltage override */
  voltage_override?: "Auto" | "LV" | "HV" | "EHV";
  /** DNO override (auto-detected if not set) */
  dno_override?: DnoKey;
  /** Client organisation */
  client_org?: string;
}

// ── Engine 1: Asset Discovery ───────────────────────────────

export interface NearestAsset {
  asset_id: string;
  asset_type: "substation" | "feeder" | "cable_segment" | "pillar";
  name?: string;
  distance_m: number;
  headroom_kw?: number | null;
  utilisation_pct?: number | null;
  capacity_kw?: number | null;
  voltage_kv?: number | null;
  confidence: "high" | "medium" | "low";
  /** LV cable-specific fields (populated when asset_type = "cable_segment") */
  cable_type?: string;
  feeder_name?: string;
  source_site_name?: string;
  snap_point?: { lng: number; lat: number };
  direct_kva?: number;
  ducted_kva?: number;
  green_compatible?: boolean;
  ev_compatible?: boolean;
  parsed_family?: string;
  parsed_material?: string;
  parsed_construction?: string;
  cable_score?: number;
}

export interface AssetSearchResult {
  nearest_substation: NearestAsset | null;
  nearest_feeder: NearestAsset | null;
  nearest_cable_segment: NearestAsset | null;
  alternatives: NearestAsset[];
  distances: {
    primary_m: number;
    feeder_m: number;
    capacity_segment_m: number;
  };
  constraints: {
    capacity_flag: string;
    ndp_intersect: boolean;
    wayleave_intersect: boolean;
    min_footway_m: number | null;
    min_carriageway_m: number | null;
  };
  raw_metrics: RawMetrics;
}

// ── Engine 2: Feasibility & POC ─────────────────────────────

export interface FeasibilityDecision {
  dno_anchor: DnoAnchorResult;
  feasibility_state: FeasibilityState;
  cable_selection: CableSelectionResult;
  electrical_sizing: ElectricalSizingResult;
  earthing: EarthingResult;
  reinforcement: ReinforcementResult;
  /** Viability index 0-100 */
  viability_index: number;
  /** GREEN / AMBER / RED */
  viability_band: string;
  /** Fast Deploy / Needs Reinforcement / Complex */
  deployment_class: string;
  /** Strong / Moderate / Constrained */
  grid_readiness: string;
  /** Reinforcement probability 0-100 */
  reinforcement_probability: number;
}

// ── Engine 3: Route & Streetworks ───────────────────────────

export interface StreetworksAssessment {
  /** Whether footway width is sufficient for works */
  footway_compliant: boolean | null;
  /** Whether carriageway width allows single-lane working */
  carriageway_compliant: boolean | null;
  /** Pedestrian diversion required */
  pedestrian_diversion_required: boolean;
  /** Traffic control measures needed */
  traffic_control_required: boolean;
  /** TTRO / permit escalation needed */
  permit_escalation_required: boolean;
  /** Joint bay location feasible */
  joint_bay_feasible: boolean | null;
  /** Feeder pillar placement feasible */
  feeder_pillar_feasible: boolean | null;
  /** Risk flags */
  risk_flags: string[];
  /** Constructability warnings */
  warnings: string[];
}

export interface RouteDesign {
  route_quantities: RouteQuantities;
  streetworks: StreetworksAssessment;
  surface_split: SurfaceSplit;
  /** Whether route uses user-drawn path vs auto-estimated */
  route_source: "user_drawn" | "estimated";
}

// ── Engine 4: Electrical & Safety ───────────────────────────

export interface ElectricalDesign {
  /** EV Hub feasibility-level sizing */
  sizing: ElectricalSizingResult;
  /** Detailed ICP-grade validation (if cables selected) */
  validation: ElectricalValidationResult | null;
  /** Earthing assessment */
  earthing: EarthingResult;
  /** Reinforcement assessment */
  reinforcement: ReinforcementResult;
}

// ── Engine 5: Commercial & Delivery ─────────────────────────

export type PackAudience = "client" | "dno" | "installer";

export interface CommercialPack {
  /** Full cost estimate with breakdown */
  cost_estimate: CostEstimate;
  /** Full Bill of Materials */
  bom: BomItem[];
  /** Engineering BOQ from EV Hub engine */
  engineering_boq: SplitBoq;
  /** Low / mid / high range */
  cost_range: {
    low: number;
    mid: number;
    high: number;
  };
}

export interface FilteredPack {
  audience: PackAudience;
  /** Items visible to this audience */
  visible_items: BomItem[];
  /** Whether pricing is shown */
  show_pricing: boolean;
  /** Whether margin is shown */
  show_margin: boolean;
  /** Total shown to audience (null for DNO) */
  total_shown: number | null;
}

// ── Engine 6: Visual & Document ─────────────────────────────

export interface VisualPack {
  /** Map screenshot data URL */
  map_screenshot?: string;
  /** Street view captures */
  street_view_captures: { dataUrl: string; heading: number; pitch: number; label: string }[];
  /** Boundary overlay GeoJSON */
  boundary_overlay?: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  /** Cable route overlay */
  route_overlay?: GeoJSON.LineString;
  /** POC marker location */
  poc_marker?: { lat: number; lng: number };
  /** Supply point marker */
  supply_point_marker?: { lat: number; lng: number };
}

// ── Master Project Object ───────────────────────────────────

export interface GridwiseProject {
  /** Schema version */
  version: "GRIDWISE_CONNECT_V1";
  /** Unique project run ID */
  run_id: string;
  /** Timestamp of engine run */
  timestamp: string;
  /** Original site input */
  site: SiteInput;
  /** Engine 1: Asset discovery results */
  assets: AssetSearchResult;
  /** Engine 2: Feasibility & POC decision */
  feasibility: FeasibilityDecision;
  /** Engine 3: Route design & streetworks */
  route: RouteDesign;
  /** Engine 4: Electrical & safety validation */
  electrical: ElectricalDesign;
  /** Engine 5: Commercial outputs */
  commercial: CommercialPack;
  /** Engine 6: Visuals (populated by UI layer) */
  visuals: VisualPack;
  /** Audit trace across all engines */
  audit: AuditTrace;
}

// ── Orchestrator Status ─────────────────────────────────────

export type PipelineStage =
  | "IDLE"
  | "ASSET_DISCOVERY"
  | "FEASIBILITY"
  | "ROUTE_DESIGN"
  | "ELECTRICAL_VALIDATION"
  | "COMMERCIAL"
  | "COMPLETE"
  | "ERROR";

export interface PipelineProgress {
  stage: PipelineStage;
  stage_index: number;
  total_stages: number;
  message: string;
  error?: string;
}
