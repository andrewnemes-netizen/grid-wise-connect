/**
 * GRIDWISE ENGINE 1 — Site & Asset Discovery
 * 
 * Wraps the existing score-site edge function and scoring engine
 * into the unified AssetSearchResult interface.
 * Also searches for the nearest compatible LV underground main cable.
 */

import { supabase } from "@/integrations/supabase/client";
import { buildRawMetrics, type RawMetrics } from "../scoringEngine";
import type { SiteInput, AssetSearchResult, NearestAsset } from "./types";
import { mapRpcToLvCableMatch, type LvCableMatch } from "./lvCableParser";

/**
 * Search for the nearest compatible LV underground main cable
 * using the PostGIS RPC with staged search radii (25 → 50 → 100m).
 */
export async function findNearestLvMain(
  lng: number,
  lat: number
): Promise<LvCableMatch | null> {
  const searchRadii = [25, 50, 100];

  for (const radius of searchRadii) {
    try {
      const { data, error } = await supabase.rpc("find_nearest_compatible_lv_main", {
        p_lon: lng,
        p_lat: lat,
        p_search_m: radius,
      });

      if (error) {
        console.warn(`LV main search (${radius}m) error:`, error.message);
        continue;
      }

      // RPC returns an array; take the first (best) result
      const rows = Array.isArray(data) ? data : data ? [data] : [];
      if (rows.length > 0 && rows[0].cable_id) {
        return mapRpcToLvCableMatch(rows[0]);
      }
    } catch (err) {
      console.warn(`LV main search (${radius}m) failed:`, err);
    }
  }

  return null;
}

/**
 * Discover all candidate connection assets near the site.
 * Calls the score-site edge function and maps results to AssetSearchResult.
 * Also searches for the nearest compatible LV underground main cable.
 */
export async function runAssetEngine(input: SiteInput): Promise<AssetSearchResult> {
  let scoreData: any = null;

  // Call the existing score-site edge function — gracefully degrade if it fails
  try {
    const { data, error } = await supabase.functions.invoke("score-site", {
      body: {
        lat: input.lat,
        lng: input.lng,
        proposed_kw: input.proposed_kw,
        boundary_geojson: input.boundary_geojson ?? null,
      },
    });

    if (error) {
      console.warn("Asset discovery (score-site) returned error, using fallback:", error.message);
    } else {
      scoreData = data;
    }
  } catch (err) {
    console.warn("Asset discovery (score-site) call failed, using fallback:", err);
  }

  // If score-site returned an error object (e.g. { error: "..." }), treat as no data
  if (scoreData && scoreData.error) {
    console.warn("score-site returned error payload:", scoreData.error);
    scoreData = null;
  }

  // Build fallback-safe results
  const distances = scoreData?.distances || { primary_m: 9999, feeder_m: 9999, capacity_segment_m: 9999 };
  const constraints = scoreData?.constraints || {};
  const nearestSubs = scoreData?.nearest_substations || [];

  // Build raw metrics for scoring
  const rawMetrics = buildRawMetrics(scoreData || { distances, constraints, nearest_substations: nearestSubs }, input.proposed_kw);

  // Map nearest substation
  const nearestSub = nearestSubs[0];
  const nearestSubstation: NearestAsset | null = nearestSub ? {
    asset_id: nearestSub.site_id || nearestSub.id || "unknown",
    asset_type: "substation",
    name: nearestSub.site_name || nearestSub.name,
    distance_m: distances.primary_m,
    headroom_kw: nearestSub.transformer_headroom_kw ?? nearestSub.headroom_kw ?? null,
    utilisation_pct: nearestSub.utilisation_pct ?? null,
    capacity_kw: nearestSub.firm_capacity_kw ?? nearestSub.capacity_kw ?? null,
    voltage_kv: nearestSub.voltage_kv ?? null,
    confidence: nearestSub.transformer_headroom_kw != null ? "high" : "medium",
  } : null;

  // Map alternatives
  const alternatives: NearestAsset[] = nearestSubs.slice(1).map((sub: any, i: number) => ({
    asset_id: sub.site_id || sub.id || `alt_${i}`,
    asset_type: "substation" as const,
    name: sub.site_name || sub.name,
    distance_m: sub.distance_m ?? distances.primary_m + (i + 1) * 200,
    headroom_kw: sub.transformer_headroom_kw ?? sub.headroom_kw ?? null,
    utilisation_pct: sub.utilisation_pct ?? null,
    capacity_kw: sub.firm_capacity_kw ?? sub.capacity_kw ?? null,
    voltage_kv: sub.voltage_kv ?? null,
    confidence: "medium" as const,
  }));

  // Search for nearest compatible LV underground main cable
  let nearestCableSegment: NearestAsset | null = null;
  try {
    const lvMatch = await findNearestLvMain(input.lng, input.lat);
    if (lvMatch) {
      nearestCableSegment = {
        asset_id: lvMatch.assetId || lvMatch.cableId,
        asset_type: "cable_segment",
        name: lvMatch.conductingSectionType,
        distance_m: lvMatch.distanceM,
        headroom_kw: null,
        utilisation_pct: null,
        capacity_kw: lvMatch.ductedKva ?? null,
        voltage_kv: null,
        confidence: lvMatch.evCompatible ? "high" : "medium",
        cable_type: lvMatch.conductingSectionType,
        feeder_name: lvMatch.feederName,
        source_site_name: lvMatch.sourceSiteName,
        snap_point: { lng: lvMatch.snapLon, lat: lvMatch.snapLat },
        direct_kva: lvMatch.directKva,
        ducted_kva: lvMatch.ductedKva,
        green_compatible: lvMatch.greenCompatible,
        ev_compatible: lvMatch.evCompatible,
        parsed_family: lvMatch.parsedFamily,
        parsed_material: lvMatch.parsedMaterial,
        parsed_construction: lvMatch.parsedConstruction,
        cable_score: lvMatch.score,
      };
    }
  } catch (err) {
    console.warn("LV main search failed, continuing without:", err);
  }

  return {
    nearest_substation: nearestSubstation,
    nearest_feeder: null,
    nearest_cable_segment: nearestCableSegment,
    alternatives,
    distances,
    constraints: {
      capacity_flag: constraints.capacity_flag || "unknown",
      ndp_intersect: constraints.ndp_intersect || false,
      wayleave_intersect: constraints.wayleave_intersect || false,
      min_footway_m: constraints.min_footway_m ?? null,
      min_carriageway_m: constraints.min_carriageway_m ?? null,
    },
    raw_metrics: rawMetrics,
  };
}
