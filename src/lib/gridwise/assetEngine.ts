/**
 * GRIDWISE ENGINE 1 — Site & Asset Discovery
 * 
 * Wraps the existing score-site edge function and scoring engine
 * into the unified AssetSearchResult interface.
 * Also searches for the nearest compatible LV underground main cable
 * or HV/EHV asset depending on the proposed load.
 */

import { supabase } from "@/integrations/supabase/client";
import { buildRawMetrics, type RawMetrics } from "../scoringEngine";
import type { SiteInput, AssetSearchResult, NearestAsset } from "./types";
import { mapRpcToLvCableMatch, type LvCableMatch } from "./lvCableParser";

// ── HV asset result from RPC ────────────────────────────────

export interface HvAssetMatch {
  assetId: string;
  assetType: "cable" | "substation";
  name: string | null;
  voltageKv: number;
  capacityValue: number | null;
  capacityFlag: string;
  distanceM: number;
  snapDistanceM: number;
  snapLon: number;
  snapLat: number;
  sourceTable: string;
  attrsJson: Record<string, unknown> | null;
}

function mapRpcToHvAssetMatch(row: Record<string, unknown>): HvAssetMatch {
  return {
    assetId: String(row.asset_id ?? ""),
    assetType: String(row.asset_type ?? "cable") as "cable" | "substation",
    name: row.name ? String(row.name) : null,
    voltageKv: Number(row.voltage_kv ?? 0),
    capacityValue: row.capacity_value != null ? Number(row.capacity_value) : null,
    capacityFlag: String(row.capacity_flag ?? "unknown"),
    distanceM: Number(row.distance_m ?? 0),
    snapDistanceM: Number(row.snap_distance_m ?? 0),
    snapLon: Number(row.snap_lon ?? 0),
    snapLat: Number(row.snap_lat ?? 0),
    sourceTable: String(row.source_table ?? ""),
    attrsJson: (row.attrs_json as Record<string, unknown>) ?? null,
  };
}

// ── Voltage range helper ────────────────────────────────────

function getHvVoltageRange(proposedKw: number): { min: number; max: number } {
  // LV: handled separately via find_nearest_compatible_lv_main
  // HV (11kV–33kV): typical for 100kW–5MW loads
  // EHV (66kV–132kV): typical for 5MW+ loads
  if (proposedKw >= 5000) return { min: 33, max: 132 };
  if (proposedKw >= 1000) return { min: 11, max: 66 };
  return { min: 11, max: 33 };
}

function isLvLoad(proposedKw: number, voltageOverride?: string): boolean {
  if (voltageOverride === "LV") return true;
  if (voltageOverride === "HV" || voltageOverride === "EHV") return false;
  return proposedKw <= 100;
}

// ── LV cable search ─────────────────────────────────────────

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
 * Route-aware variant: measures the shortest spur from any point on the drawn
 * cable route to the nearest compatible LV main. Returns 0m distance when the
 * route already crosses or touches the main, eliminating double-counting in
 * the BoQ. Falls back to the point-based search if the RPC is unavailable.
 */
export async function findNearestLvMainForRoute(
  routeCoords: Array<[number, number]>
): Promise<LvCableMatch | null> {
  if (!routeCoords || routeCoords.length === 0) return null;

  // Single-point routes degrade to the legacy point-based search.
  if (routeCoords.length === 1) {
    const [lng, lat] = routeCoords[0];
    return findNearestLvMain(lng, lat);
  }

  const routeGeojson = {
    type: "LineString",
    coordinates: routeCoords,
  };

  const searchRadii = [25, 50, 100];
  for (const radius of searchRadii) {
    try {
      const { data, error } = await (supabase.rpc as any)("find_nearest_compatible_lv_main_route", {
        p_route_geojson: routeGeojson,
        p_search_m: radius,
      });

      if (error) {
        console.warn(`LV route search (${radius}m) error:`, error.message);
        continue;
      }

      const rows = Array.isArray(data) ? data : data ? [data] : [];
      if (rows.length > 0 && rows[0].cable_id) {
        return mapRpcToLvCableMatch(rows[0]);
      }
    } catch (err) {
      console.warn(`LV route search (${radius}m) failed:`, err);
    }
  }

  // Final fallback: try the destination pin via the legacy RPC.
  const [lng, lat] = routeCoords[routeCoords.length - 1];
  return findNearestLvMain(lng, lat);
}

// ── HV/EHV asset search ─────────────────────────────────────

/**
 * Search for the nearest HV/EHV cable or substation
 * using staged search radii (100 → 250 → 500m).
 */
export async function findNearestHvAsset(
  lng: number,
  lat: number,
  proposedKw: number
): Promise<HvAssetMatch | null> {
  const searchRadii = [100, 250, 500];
  const { min, max } = getHvVoltageRange(proposedKw);

  for (const radius of searchRadii) {
    try {
      const { data, error } = await supabase.rpc("find_nearest_hv_asset", {
        p_lon: lng,
        p_lat: lat,
        p_search_m: radius,
        p_min_voltage_kv: min,
        p_max_voltage_kv: max,
      });

      if (error) {
        console.warn(`HV asset search (${radius}m) error:`, error.message);
        continue;
      }

      const rows = Array.isArray(data) ? data : data ? [data] : [];
      if (rows.length > 0 && rows[0].asset_id) {
        return mapRpcToHvAssetMatch(rows[0]);
      }
    } catch (err) {
      console.warn(`HV asset search (${radius}m) failed:`, err);
    }
  }

  return null;
}

// ── Main asset engine ───────────────────────────────────────

/**
 * Discover all candidate connection assets near the site.
 * For LV loads: finds nearest LV underground cable or substation.
 * For HV/EHV loads: finds nearest HV/EHV cable or substation.
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

  if (scoreData && scoreData.error) {
    console.warn("score-site returned error payload:", scoreData.error);
    scoreData = null;
  }

  const distances = scoreData?.distances || { primary_m: 9999, feeder_m: 9999, capacity_segment_m: 9999 };
  const constraints = scoreData?.constraints || {};
  const nearestSubs = scoreData?.nearest_substations || [];

  const rawMetrics = buildRawMetrics(scoreData || { distances, constraints, nearest_substations: nearestSubs }, input.proposed_kw);

  // Map nearest substation from score-site
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

  // ── Voltage-aware POC search ──────────────────────────────
  let nearestCableSegment: NearestAsset | null = null;
  let nearestHvAsset: NearestAsset | null = null;

  const lvLoad = isLvLoad(input.proposed_kw, input.voltage_override);

  if (lvLoad) {
    // LV: search for nearest compatible LV underground main cable
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
  } else {
    // HV/EHV: search for nearest HV/EHV cable or substation
    try {
      const hvMatch = await findNearestHvAsset(input.lng, input.lat, input.proposed_kw);
      if (hvMatch) {
        const isHvCable = hvMatch.assetType === "cable";
        nearestHvAsset = {
          asset_id: hvMatch.assetId,
          asset_type: isHvCable ? "cable_segment" : "substation",
          name: hvMatch.name || `${hvMatch.voltageKv}kV ${hvMatch.assetType}`,
          distance_m: hvMatch.snapDistanceM,
          headroom_kw: null,
          utilisation_pct: null,
          capacity_kw: hvMatch.capacityValue,
          voltage_kv: hvMatch.voltageKv,
          confidence: hvMatch.capacityFlag === "green" ? "high" : "medium",
          snap_point: { lng: hvMatch.snapLon, lat: hvMatch.snapLat },
          hv_source_table: hvMatch.sourceTable,
          hv_capacity_flag: hvMatch.capacityFlag,
          hv_circuit_name: hvMatch.attrsJson?.circuit_name as string
            ?? hvMatch.attrsJson?.["circuit name"] as string
            ?? undefined,
        };

        // If it's a cable, put in cable_segment slot; if substation, it becomes nearest_substation override
        if (isHvCable) {
          nearestCableSegment = nearestHvAsset;
        }
      }
    } catch (err) {
      console.warn("HV asset search failed, continuing without:", err);
    }
  }

  // For HV: if we found a closer HV substation than the score-site one, use it
  const effectiveNearestSubstation = (nearestHvAsset && nearestHvAsset.asset_type === "substation"
    && (!nearestSubstation || nearestHvAsset.distance_m < nearestSubstation.distance_m))
    ? nearestHvAsset
    : nearestSubstation;

  return {
    nearest_substation: effectiveNearestSubstation,
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
