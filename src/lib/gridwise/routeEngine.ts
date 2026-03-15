/**
 * GRIDWISE ENGINE 3 — Route & Streetworks Design
 * 
 * Wraps route segmentation with streetworks compliance validation.
 * Assesses constructability of the proposed cable route.
 */

import { segmentRoute, type RawRouteSegment, type RawCrossing } from "../evHub/routeSegmentation";
import { getBaselineRules } from "../evHub/ruleLoader";
import type { SiteInput, AssetSearchResult, FeasibilityDecision, RouteDesign, StreetworksAssessment } from "./types";
import type { SurfaceSplit } from "../connectionCosts";
import type { EvHubRules } from "../evHub/types";

/** Minimum footway width for safe working (metres) */
const MIN_FOOTWAY_WIDTH_M = 1.5;
/** Minimum carriageway width for single-lane working (metres) */
const MIN_CARRIAGEWAY_SINGLE_LANE_M = 3.0;
/** Minimum carriageway for two-way traffic during works */
const MIN_CARRIAGEWAY_TWO_WAY_M = 5.5;

/**
 * Assess streetworks compliance based on route and constraint data.
 */
function assessStreetworks(
  constraints: AssetSearchResult["constraints"],
  routeTotalLength: number,
  hasCarriagewaySegments: boolean,
): StreetworksAssessment {
  const riskFlags: string[] = [];
  const warnings: string[] = [];

  // Footway width compliance
  let footwayCompliant: boolean | null = null;
  if (constraints.min_footway_m != null) {
    footwayCompliant = constraints.min_footway_m >= MIN_FOOTWAY_WIDTH_M;
    if (!footwayCompliant) {
      riskFlags.push("FOOTWAY_WIDTH_INSUFFICIENT");
      warnings.push(
        `Footway width ${constraints.min_footway_m}m is below the ${MIN_FOOTWAY_WIDTH_M}m minimum. Pedestrian diversion may be required.`
      );
    }
  } else {
    warnings.push("Footway width data unavailable — site survey recommended.");
  }

  // Carriageway width compliance
  let carriagewayCompliant: boolean | null = null;
  if (constraints.min_carriageway_m != null) {
    carriagewayCompliant = constraints.min_carriageway_m >= MIN_CARRIAGEWAY_TWO_WAY_M;
    if (!carriagewayCompliant && constraints.min_carriageway_m >= MIN_CARRIAGEWAY_SINGLE_LANE_M) {
      riskFlags.push("CARRIAGEWAY_SINGLE_LANE_ONLY");
      warnings.push(
        `Carriageway width ${constraints.min_carriageway_m}m allows single-lane working only. Traffic control required.`
      );
    } else if (constraints.min_carriageway_m < MIN_CARRIAGEWAY_SINGLE_LANE_M) {
      riskFlags.push("CARRIAGEWAY_WIDTH_CRITICAL");
      warnings.push(
        `Carriageway width ${constraints.min_carriageway_m}m is below single-lane minimum. TTRO or full closure may be required.`
      );
    }
  }

  // Pedestrian diversion
  const pedestrianDiversionRequired = footwayCompliant === false;

  // Traffic control
  const trafficControlRequired =
    hasCarriagewaySegments ||
    (carriagewayCompliant === false && constraints.min_carriageway_m != null);

  // Permit escalation
  const permitEscalationRequired =
    (constraints.min_carriageway_m != null && constraints.min_carriageway_m < MIN_CARRIAGEWAY_SINGLE_LANE_M) ||
    routeTotalLength > 200;

  if (permitEscalationRequired) {
    riskFlags.push("PERMIT_ESCALATION_LIKELY");
  }

  // NDP / wayleave flags
  if (constraints.ndp_intersect) {
    riskFlags.push("NDP_CONFLICT");
    warnings.push("Route intersects a Network Development Plan project area. Co-ordination with DNO required.");
  }
  if (constraints.wayleave_intersect) {
    riskFlags.push("WAYLEAVE_REQUIRED");
    warnings.push("Route crosses wayleave area. Third-party consent may be required.");
  }

  return {
    footway_compliant: footwayCompliant,
    carriageway_compliant: carriagewayCompliant,
    pedestrian_diversion_required: pedestrianDiversionRequired,
    traffic_control_required: trafficControlRequired,
    permit_escalation_required: permitEscalationRequired,
    joint_bay_feasible: null, // Requires detailed site survey
    feeder_pillar_feasible: null, // Requires detailed site survey
    risk_flags: riskFlags,
    warnings,
  };
}

/**
 * Build route segments from Connect tool data or estimate from distances.
 */
function buildRouteSegments(
  input: SiteInput,
  assets: AssetSearchResult,
  feasibility: FeasibilityDecision
): { segments: RawRouteSegment[]; crossings: RawCrossing[]; surfaceSplit: SurfaceSplit; source: "user_drawn" | "estimated" } {
  // TODO: When Connect tool route data is available, parse actual segments
  // For now, estimate from distances and surface split

  const totalDistance = Math.min(assets.distances.capacity_segment_m, 500);

  // Derive surface split from constraints
  const fw = assets.constraints.min_footway_m;
  const cw = assets.constraints.min_carriageway_m;
  let surfaceSplit: SurfaceSplit;

  if (fw != null && cw != null && (fw + cw) > 0) {
    const total = fw + cw;
    const verge = 0.1;
    const remaining = 0.9;
    surfaceSplit = {
      footway_pct: Math.round((fw / total) * remaining * 100) / 100,
      carriageway_pct: Math.round((cw / total) * remaining * 100) / 100,
      verge_pct: verge,
    };
  } else {
    surfaceSplit = { footway_pct: 0.6, carriageway_pct: 0.3, verge_pct: 0.1 };
  }

  const segments: RawRouteSegment[] = [
    {
      coordinates: [],
      surface_type: "FOOTWAY",
      length_m: Math.round(totalDistance * surfaceSplit.footway_pct),
    },
    {
      coordinates: [],
      surface_type: "CARRIAGEWAY",
      length_m: Math.round(totalDistance * surfaceSplit.carriageway_pct),
    },
    {
      coordinates: [],
      surface_type: "VERGE",
      length_m: Math.round(totalDistance * surfaceSplit.verge_pct),
    },
  ].filter(s => s.length_m > 0);

  return {
    segments,
    crossings: [],
    surfaceSplit,
    source: input.route_geojson ? "user_drawn" : "estimated",
  };
}

/**
 * Run route design and streetworks assessment.
 */
export async function runRouteEngine(
  input: SiteInput,
  assets: AssetSearchResult,
  feasibility: FeasibilityDecision
): Promise<RouteDesign> {
  const { segments, crossings, surfaceSplit, source } = buildRouteSegments(input, assets, feasibility);

  // Use baseline rules (the EV Hub engine already loaded the correct ruleset)
  const rules = getBaselineRules();

  // Segment the route
  const routeQuantities = segmentRoute(segments, crossings, rules);

  // Assess streetworks
  const hasCarriageway = routeQuantities.segments.some(s => s.surface_type === "CARRIAGEWAY");
  const streetworks = assessStreetworks(
    assets.constraints,
    routeQuantities.total_length_m,
    hasCarriageway
  );

  return {
    route_quantities: routeQuantities,
    streetworks,
    surface_split: surfaceSplit,
    route_source: source,
  };
}
