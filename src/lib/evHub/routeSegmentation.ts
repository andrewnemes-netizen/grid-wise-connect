/**
 * Module D: Route Segmentation Engine
 * Classifies route into FOOTWAY/CARRIAGEWAY/VERGE, detects crossings, generates quantities.
 * Does NOT price anything.
 */
import type { RouteQuantities, RouteSegment, RouteCrossing, SurfaceType, EvHubRules } from "./types";

export interface RawRouteSegment {
  /** Coordinates along this segment */
  coordinates: [number, number][];
  /** Surface classification — provided by spatial layer or user input */
  surface_type: SurfaceType;
  /** Measured length in metres */
  length_m: number;
}

export interface RawCrossing {
  crossing_type: "ROAD" | "RAIL" | "WATER" | "UTILITY";
  width_m: number;
  method?: string;
}

function getCoverDepth(surface: SurfaceType, rules: EvHubRules): number {
  const depths = rules.cover_depths_mm?.value as Record<string, number> | null;
  if (!depths) return 450;
  const key = surface.toLowerCase();
  return depths[key] ?? 450;
}

function requiresTrafficManagement(segments: RouteSegment[], rules: EvHubRules): boolean {
  const tmRules = rules.traffic_management_rules?.value as Record<string, boolean> | null;
  if (!tmRules) {
    // Conservative default: any carriageway segment requires TM
    return segments.some((s) => s.surface_type === "CARRIAGEWAY");
  }
  return segments.some((s) => {
    const key = `${s.surface_type.toLowerCase()}_requires_tm`;
    return tmRules[key] === true;
  });
}

export function segmentRoute(
  rawSegments: RawRouteSegment[],
  rawCrossings: RawCrossing[],
  rules: EvHubRules
): RouteQuantities {
  const segments: RouteSegment[] = rawSegments.map((rs, i) => ({
    segment_id: `SEG_${String(i + 1).padStart(3, "0")}`,
    surface_type: rs.surface_type,
    length_m: Math.round(rs.length_m * 100) / 100,
    cover_depth_mm: getCoverDepth(rs.surface_type, rules),
    duct_required: true, // Conservative default
  }));

  const crossings: RouteCrossing[] = rawCrossings.map((rc, i) => ({
    crossing_id: `CROSS_${String(i + 1).padStart(3, "0")}`,
    crossing_type: rc.crossing_type,
    width_m: rc.width_m,
    method: rc.method ?? "OPEN_CUT",
  }));

  const total_length_m = segments.reduce((sum, s) => sum + s.length_m, 0);

  return {
    segments,
    crossings,
    total_length_m: Math.round(total_length_m * 100) / 100,
    traffic_management_required: requiresTrafficManagement(segments, rules),
  };
}
