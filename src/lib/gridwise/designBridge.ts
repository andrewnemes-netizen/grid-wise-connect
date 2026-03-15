/**
 * GRIDWISE CONNECT → DESIGN MODE BRIDGE
 * 
 * Converts a completed GridwiseProject pipeline result into
 * Design Mode elements (equipment markers + cables) that can
 * be persisted and edited on the map.
 * 
 * Placement logic:
 * - Transformer at nearest substation (source)
 * - LV/HV cable along route geometry
 * - Joints at ~200m intervals along the route
 * - Feeder pillar near the destination
 * - Cutouts at destination (grouped by charger count)
 * - EV chargers at destination (spread slightly)
 * - RMU added when HV connection is required
 */

import type { GridwiseProject } from "./types";
import type { EquipmentType, CableType } from "@/hooks/useDesignMode";

export interface DesignElementPlacement {
  element_type: EquipmentType;
  label: string;
  lng: number;
  lat: number;
  properties_json: Record<string, unknown>;
}

export interface DesignCablePlacement {
  cable_type: CableType;
  label: string;
  coordinates: [number, number][];
}

export interface DesignConversionResult {
  elements: DesignElementPlacement[];
  cables: DesignCablePlacement[];
  summary: string;
}

/**
 * Interpolate a point along a LineString at a given fraction (0–1).
 */
function interpolateAlongRoute(
  coords: [number, number][],
  fraction: number
): [number, number] {
  if (coords.length < 2 || fraction <= 0) return coords[0];
  if (fraction >= 1) return coords[coords.length - 1];

  // Compute cumulative distances
  const distances: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    distances.push(distances[i - 1] + R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  const totalDist = distances[distances.length - 1];
  const targetDist = fraction * totalDist;

  for (let i = 1; i < distances.length; i++) {
    if (distances[i] >= targetDist) {
      const segFraction =
        (targetDist - distances[i - 1]) / (distances[i] - distances[i - 1]);
      const [lon1, lat1] = coords[i - 1];
      const [lon2, lat2] = coords[i];
      return [
        lon1 + (lon2 - lon1) * segFraction,
        lat1 + (lat2 - lat1) * segFraction,
      ];
    }
  }
  return coords[coords.length - 1];
}

/**
 * Offset a point slightly for visual separation (in degrees, ~5m).
 */
function offsetPoint(
  lng: number,
  lat: number,
  index: number,
  total: number
): [number, number] {
  const angle = (2 * Math.PI * index) / Math.max(total, 1);
  const offsetDeg = 0.00005; // ~5m
  return [lng + Math.cos(angle) * offsetDeg, lat + Math.sin(angle) * offsetDeg];
}

/**
 * Convert a completed GridwiseProject into design elements and cables.
 */
export function convertGridwiseToDesign(
  project: GridwiseProject
): DesignConversionResult {
  const elements: DesignElementPlacement[] = [];
  const cables: DesignCablePlacement[] = [];

  const routeCoords = project.site.route_geojson?.coordinates as
    | [number, number][]
    | undefined;
  const destLng = project.site.lng;
  const destLat = project.site.lat;
  const isHv =
    project.feasibility.feasibility_state === "HV_CONNECTION_REQUIRED";

  // ── 1. Transformer at source (nearest substation) ──
  const sub = project.assets.nearest_substation;
  if (sub) {
    // Use raw_metrics to get substation coords if available, otherwise estimate from route start
    const subCoords = routeCoords?.[0] ?? [destLng, destLat];
    elements.push({
      element_type: "transformer",
      label: `Transformer — ${sub.name ?? "Primary"}`,
      lng: subCoords[0],
      lat: subCoords[1],
      properties_json: {
        source: "gridwise_connect",
        run_id: project.run_id,
        asset_id: sub.asset_id,
        headroom_kw: sub.headroom_kw,
        capacity_kw: sub.capacity_kw,
      },
    });
  }

  // ── 2. RMU if HV connection required ──
  if (isHv && routeCoords && routeCoords.length >= 2) {
    // Place RMU at 10% along route (near source)
    const rmuPos = interpolateAlongRoute(routeCoords, 0.1);
    elements.push({
      element_type: "rmu",
      label: "RMU — HV Switchgear",
      lng: rmuPos[0],
      lat: rmuPos[1],
      properties_json: {
        source: "gridwise_connect",
        run_id: project.run_id,
        reason: "HV connection required",
      },
    });
  }

  // ── 3. Cable along route ──
  if (routeCoords && routeCoords.length >= 2) {
    const cableType: CableType = isHv ? "hv_cable" : "lv_main";
    const cableLabel = isHv ? "HV Cable — Route" : "LV Main — Route";
    cables.push({
      cable_type: cableType,
      label: cableLabel,
      coordinates: routeCoords,
    });
  }

  // ── 4. Joints at intervals along route ──
  if (routeCoords && routeCoords.length >= 2) {
    const totalLength = project.route.route_quantities.total_length_m;
    const jointSpacing = 200; // metres
    const jointCount = Math.floor(totalLength / jointSpacing);

    for (let i = 1; i <= jointCount; i++) {
      const fraction = (i * jointSpacing) / totalLength;
      if (fraction >= 0.95) break; // Don't place joint too close to end
      const pos = interpolateAlongRoute(routeCoords, fraction);
      elements.push({
        element_type: "joint",
        label: `Joint ${i}`,
        lng: pos[0],
        lat: pos[1],
        properties_json: {
          source: "gridwise_connect",
          run_id: project.run_id,
          distance_from_source_m: Math.round(i * jointSpacing),
        },
      });
    }
  }

  // ── 5. Feeder Pillar near destination ──
  const fpPos = routeCoords
    ? interpolateAlongRoute(routeCoords, 0.92)
    : [destLng, destLat] as [number, number];
  elements.push({
    element_type: "feeder_pillar",
    label: "Feeder Pillar — Distribution",
    lng: fpPos[0],
    lat: fpPos[1],
    properties_json: {
      source: "gridwise_connect",
      run_id: project.run_id,
    },
  });

  // ── 6. Cutouts at destination ──
  const cutoutCount = Math.max(1, Math.ceil(project.site.charger_count / 2));
  for (let i = 0; i < cutoutCount; i++) {
    const [cLng, cLat] = offsetPoint(destLng, destLat, i, cutoutCount + project.site.charger_count);
    elements.push({
      element_type: "cutout",
      label: `Cutout ${i + 1}`,
      lng: cLng,
      lat: cLat,
      properties_json: {
        source: "gridwise_connect",
        run_id: project.run_id,
      },
    });
  }

  // ── 7. EV Chargers at destination ──
  for (let i = 0; i < project.site.charger_count; i++) {
    const [cLng, cLat] = offsetPoint(
      destLng,
      destLat,
      cutoutCount + i,
      cutoutCount + project.site.charger_count
    );
    elements.push({
      element_type: "ev_charger",
      label: `EV Charger ${i + 1} (${project.site.charger_kw_each}kW)`,
      lng: cLng,
      lat: cLat,
      properties_json: {
        source: "gridwise_connect",
        run_id: project.run_id,
        kw: project.site.charger_kw_each,
      },
    });
  }

  // ── 8. LV Service cables from feeder pillar to each cutout ──
  for (let i = 0; i < cutoutCount; i++) {
    const cutout = elements.find(
      (e) => e.element_type === "cutout" && e.label === `Cutout ${i + 1}`
    );
    if (cutout) {
      cables.push({
        cable_type: "lv_service",
        label: `LV Service ${i + 1}`,
        coordinates: [
          [fpPos[0], fpPos[1]],
          [cutout.lng, cutout.lat],
        ],
      });
    }
  }

  const summary = [
    `${elements.length} equipment items`,
    `${cables.length} cables`,
    `placed from ${project.run_id}`,
  ].join(" · ");

  return { elements, cables, summary };
}
