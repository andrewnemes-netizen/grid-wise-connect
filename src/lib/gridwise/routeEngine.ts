/**
 * GRIDWISE ENGINE 3 — Route & Streetworks Design
 * 
 * Wraps route segmentation with streetworks compliance validation.
 * Assesses constructability of the proposed cable route.
 * 
 * P3: Now integrates with OSM Route Segmentation edge function
 * to derive real surface types from OpenStreetMap data.
 */

import { segmentRoute, type RawRouteSegment, type RawCrossing } from "../evHub/routeSegmentation";
import { getBaselineRules } from "../evHub/ruleLoader";
import type { SiteInput, AssetSearchResult, FeasibilityDecision, RouteDesign, StreetworksAssessment } from "./types";
import type { SurfaceSplit } from "../connectionCosts";
import type { EvHubRules } from "../evHub/types";
import { supabase } from "@/integrations/supabase/client";

/** Minimum footway width for safe working (metres) */
const MIN_FOOTWAY_WIDTH_M = 1.5;
/** Minimum carriageway width for single-lane working (metres) */
const MIN_CARRIAGEWAY_SINGLE_LANE_M = 3.0;
/** Minimum carriageway for two-way traffic during works */
const MIN_CARRIAGEWAY_TWO_WAY_M = 5.5;

// ── OSM Route Segmentation types ────────────────────────────

interface OsmRouteSegment {
  segment_id: string;
  surface_type: "FOOTWAY" | "CARRIAGEWAY" | "VERGE";
  length_m: number;
  osm_highway?: string;
  osm_surface?: string;
  osm_width?: string;
  osm_lit?: string;
  osm_lanes?: string;
  osm_name?: string;
  cover_depth_mm: number;
  coordinates: [number, number][];
}

interface OsmRouteCrossing {
  crossing_id: string;
  crossing_type: "PEDESTRIAN" | "TRAFFIC_SIGNAL" | "RAILWAY" | "WATER";
  lat: number;
  lon: number;
  distance_along_m: number;
  osm_tags: Record<string, string>;
}

interface OsmSegmentationResult {
  segments: OsmRouteSegment[];
  crossings: OsmRouteCrossing[];
  summary: {
    total_length_m: number;
    footway_m: number;
    carriageway_m: number;
    verge_m: number;
    footway_pct: number;
    carriageway_pct: number;
    verge_pct: number;
    crossing_count: number;
    traffic_management_required: boolean;
    lit_segments: number;
  };
}

/**
 * Call the OSM route segmentation edge function.
 * Returns null if the call fails (falls back to estimated segments).
 */
async function fetchOsmSegmentation(
  routeCoords: [number, number][],
  bufferM = 30
): Promise<OsmSegmentationResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke("osm-route-segment", {
      body: { route_coords: routeCoords, buffer_m: bufferM },
    });
    if (error || !data?.segments) {
      console.warn("OSM route segmentation failed, falling back to estimates:", error);
      return null;
    }
    return data as OsmSegmentationResult;
  } catch (e) {
    console.warn("OSM route segmentation error:", e);
    return null;
  }
}

/**
 * Convert OSM crossing types to the internal crossing type format.
 */
function mapOsmCrossingType(type: string): "ROAD" | "RAIL" | "WATER" | "UTILITY" {
  switch (type) {
    case "PEDESTRIAN":
    case "TRAFFIC_SIGNAL":
      return "ROAD";
    case "RAILWAY":
      return "RAIL";
    case "WATER":
      return "WATER";
    default:
      return "UTILITY";
  }
}

/**
 * Assess streetworks compliance based on route and constraint data.
 */
function assessStreetworks(
  constraints: AssetSearchResult["constraints"],
  routeTotalLength: number,
  hasCarriagewaySegments: boolean,
  osmCrossings?: OsmRouteCrossing[],
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

  // OSM crossing-derived warnings
  if (osmCrossings && osmCrossings.length > 0) {
    const signalCount = osmCrossings.filter(c => c.crossing_type === "TRAFFIC_SIGNAL").length;
    const railCount = osmCrossings.filter(c => c.crossing_type === "RAILWAY").length;
    const waterCount = osmCrossings.filter(c => c.crossing_type === "WATER").length;
    const pedCount = osmCrossings.filter(c => c.crossing_type === "PEDESTRIAN").length;

    if (signalCount > 0) {
      riskFlags.push("SIGNAL_CONTROLLED_CROSSING");
      warnings.push(`Route passes ${signalCount} traffic signal junction(s). Signal shutdown coordination may be required.`);
    }
    if (railCount > 0) {
      riskFlags.push("RAILWAY_CROSSING");
      warnings.push(`Route crosses ${railCount} railway line(s). Network Rail consent and specialist crossing method required.`);
    }
    if (waterCount > 0) {
      riskFlags.push("WATER_CROSSING");
      warnings.push(`Route crosses ${waterCount} water feature(s). Directional drilling or bridge attachment may be needed.`);
    }
    if (pedCount > 0) {
      warnings.push(`${pedCount} pedestrian crossing(s) along route. TM plan must include crossing protection.`);
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
    joint_bay_feasible: null,
    feeder_pillar_feasible: null,
    risk_flags: riskFlags,
    warnings,
  };
}

/**
 * Build route segments from OSM data (P3) or estimate from distances (fallback).
 */
async function buildRouteSegments(
  input: SiteInput,
  assets: AssetSearchResult,
  feasibility: FeasibilityDecision
): Promise<{
  segments: RawRouteSegment[];
  crossings: RawCrossing[];
  surfaceSplit: SurfaceSplit;
  source: "osm_classified" | "user_drawn" | "estimated";
  osmCrossings?: OsmRouteCrossing[];
}> {
  // ── P3: Try OSM segmentation if route is available ──
  if (input.route_geojson && input.route_geojson.coordinates.length >= 2) {
    const routeCoords = input.route_geojson.coordinates as [number, number][];
    const osmResult = await fetchOsmSegmentation(routeCoords);

    if (osmResult && osmResult.segments.length > 0) {
      const segments: RawRouteSegment[] = osmResult.segments.map((s) => ({
        coordinates: s.coordinates,
        surface_type: s.surface_type,
        length_m: s.length_m,
      }));

      const crossings: RawCrossing[] = osmResult.crossings.map((c) => ({
        crossing_type: mapOsmCrossingType(c.crossing_type),
        width_m: c.crossing_type === "RAILWAY" ? 15 : c.crossing_type === "WATER" ? 10 : 5,
        method: c.crossing_type === "RAILWAY" ? "DIRECTIONAL_DRILL" : c.crossing_type === "WATER" ? "DIRECTIONAL_DRILL" : "OPEN_CUT",
      }));

      const surfaceSplit: SurfaceSplit = {
        footway_pct: (osmResult.summary.footway_pct || 0) / 100,
        carriageway_pct: (osmResult.summary.carriageway_pct || 0) / 100,
        verge_pct: (osmResult.summary.verge_pct || 0) / 100,
      };

      return {
        segments,
        crossings,
        surfaceSplit,
        source: "osm_classified",
        osmCrossings: osmResult.crossings,
      };
    }
  }

  // ── Fallback: estimate from distances and constraint data ──
  const totalDistance = Math.min(assets.distances.capacity_segment_m, 500);

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

  const segments: RawRouteSegment[] = ([
    {
      coordinates: [] as [number, number][],
      surface_type: "FOOTWAY" as const,
      length_m: Math.round(totalDistance * surfaceSplit.footway_pct),
    },
    {
      coordinates: [] as [number, number][],
      surface_type: "CARRIAGEWAY" as const,
      length_m: Math.round(totalDistance * surfaceSplit.carriageway_pct),
    },
    {
      coordinates: [] as [number, number][],
      surface_type: "VERGE" as const,
      length_m: Math.round(totalDistance * surfaceSplit.verge_pct),
    },
  ] satisfies RawRouteSegment[]).filter(s => s.length_m > 0);

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
  const { segments, crossings, surfaceSplit, source, osmCrossings } = await buildRouteSegments(input, assets, feasibility);

  const rules = getBaselineRules();
  const routeQuantities = segmentRoute(segments, crossings, rules);

  const hasCarriageway = routeQuantities.segments.some(s => s.surface_type === "CARRIAGEWAY");
  const streetworks = assessStreetworks(
    assets.constraints,
    routeQuantities.total_length_m,
    hasCarriageway,
    osmCrossings
  );

  return {
    route_quantities: routeQuantities,
    streetworks,
    surface_split: surfaceSplit,
    route_source: source === "osm_classified" ? "user_drawn" : source,
  };
}
