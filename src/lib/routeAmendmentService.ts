/**
 * Route Amendment Service
 *
 * Captures AI-generated route baselines and engineer corrections,
 * computes diffs, and persists them for the learning pipeline.
 */

import { supabase } from "@/integrations/supabase/client";

export interface RouteBaseline {
  routeGeojson: Record<string, unknown> | null;
  pocLat: number | null;
  pocLng: number | null;
  distanceM: number | null;
  costEstimate: Record<string, unknown> | null;
  surfaceSplit: Record<string, unknown> | null;
}

export interface AmendmentContext {
  siteId: string | null;
  studyId: string | null;
  dnoRegion: string | null;
  voltageLevel: string | null;
  proposedKw: number | null;
}

/**
 * Capture the current state as a baseline snapshot.
 */
export function captureBaseline(params: {
  routeGeojson?: any;
  pocLat?: number | null;
  pocLng?: number | null;
  distanceM?: number | null;
  costEstimate?: any;
  surfaceSplit?: any;
}): RouteBaseline {
  return {
    routeGeojson: params.routeGeojson ?? null,
    pocLat: params.pocLat ?? null,
    pocLng: params.pocLng ?? null,
    distanceM: params.distanceM ?? null,
    costEstimate: params.costEstimate ?? null,
    surfaceSplit: params.surfaceSplit ?? null,
  };
}

/**
 * Haversine distance between two points in metres.
 */
function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Detect whether an amendment occurred by comparing baseline to current state.
 */
export function hasAmendment(baseline: RouteBaseline, current: RouteBaseline): boolean {
  // POC moved
  if (
    baseline.pocLat != null && baseline.pocLng != null &&
    current.pocLat != null && current.pocLng != null
  ) {
    const shift = haversineM(baseline.pocLat, baseline.pocLng, current.pocLat, current.pocLng);
    if (shift > 5) return true; // >5m shift
  }

  // Distance changed by >10%
  if (baseline.distanceM && current.distanceM) {
    const pct = Math.abs(current.distanceM - baseline.distanceM) / baseline.distanceM;
    if (pct > 0.1) return true;
  }

  // Route GeoJSON changed
  if (
    JSON.stringify(baseline.routeGeojson) !== JSON.stringify(current.routeGeojson) &&
    baseline.routeGeojson != null && current.routeGeojson != null
  ) {
    return true;
  }

  return false;
}

/**
 * Save a route amendment record to the database.
 */
export async function recordAmendment(
  context: AmendmentContext,
  aiBaseline: RouteBaseline,
  engCurrent: RouteBaseline,
  notes?: string
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Compute diffs
  const distanceDelta = (engCurrent.distanceM ?? 0) - (aiBaseline.distanceM ?? 0);

  let costDeltaPct: number | null = null;
  const aiTotal = (aiBaseline.costEstimate as any)?.total_estimate;
  const engTotal = (engCurrent.costEstimate as any)?.total_estimate;
  if (aiTotal && aiTotal > 0 && engTotal) {
    costDeltaPct = ((engTotal - aiTotal) / aiTotal) * 100;
  }

  let pocShiftM: number | null = null;
  if (
    aiBaseline.pocLat != null && aiBaseline.pocLng != null &&
    engCurrent.pocLat != null && engCurrent.pocLng != null
  ) {
    pocShiftM = haversineM(aiBaseline.pocLat, aiBaseline.pocLng, engCurrent.pocLat, engCurrent.pocLng);
  }

  const { data, error } = await supabase
    .from("route_amendments" as any)
    .insert({
      site_id: context.siteId,
      study_id: context.studyId,
      created_by: user.id,
      dno_region: context.dnoRegion,
      voltage_level: context.voltageLevel,
      proposed_kw: context.proposedKw,
      ai_route_geojson: aiBaseline.routeGeojson,
      ai_poc_lat: aiBaseline.pocLat,
      ai_poc_lng: aiBaseline.pocLng,
      ai_distance_m: aiBaseline.distanceM,
      ai_cost_estimate: aiBaseline.costEstimate,
      ai_surface_split: aiBaseline.surfaceSplit,
      eng_route_geojson: engCurrent.routeGeojson,
      eng_poc_lat: engCurrent.pocLat,
      eng_poc_lng: engCurrent.pocLng,
      eng_distance_m: engCurrent.distanceM,
      eng_cost_estimate: engCurrent.costEstimate,
      eng_surface_split: engCurrent.surfaceSplit,
      distance_delta_m: Math.round(distanceDelta),
      cost_delta_pct: costDeltaPct != null ? Math.round(costDeltaPct * 10) / 10 : null,
      poc_shift_m: pocShiftM != null ? Math.round(pocShiftM) : null,
      amendment_notes: notes || null,
      approved_for_training: false,
    } as any)
    .select("id")
    .single();

  if (error) {
    console.error("Failed to record route amendment:", error);
    return null;
  }

  return (data as any)?.id ?? null;
}
