/**
 * CONNECT → DESIGN MODE BRIDGE
 * 
 * Converts a Connect assessment (route + source asset + kW)
 * into Design Mode elements and cables.
 * 
 * Simpler than the Gridwise bridge — focuses on the drawn route
 * and basic equipment placement based on voltage level.
 */

import type { EquipmentType, CableType } from "@/hooks/useDesignMode";
import type { ConnectEndpoints } from "@/components/map/AssessmentPanel";

export interface ConnectDesignResult {
  elements: { element_type: EquipmentType; label: string; lng: number; lat: number; properties_json: Record<string, unknown> }[];
  cables: { cable_type: CableType; label: string; coordinates: [number, number][] }[];
  summary: string;
}

function interpolateAlongRoute(
  coords: [number, number][],
  fraction: number
): [number, number] {
  if (coords.length < 2 || fraction <= 0) return coords[0];
  if (fraction >= 1) return coords[coords.length - 1];

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

function offsetPoint(lng: number, lat: number, index: number, total: number): [number, number] {
  const angle = (2 * Math.PI * index) / Math.max(total, 1);
  const offsetDeg = 0.00005;
  return [lng + Math.cos(angle) * offsetDeg, lat + Math.sin(angle) * offsetDeg];
}

/**
 * Convert a Connect assessment into Design Mode elements.
 */
export function convertConnectToDesign(
  endpoints: ConnectEndpoints,
  options: {
    voltageLevel: string;
    proposedKw: number;
    sourceName: string;
  }
): ConnectDesignResult {
  const elements: ConnectDesignResult["elements"] = [];
  const cables: ConnectDesignResult["cables"] = [];
  const routeCoords = endpoints.routeCoords;
  const [destLng, destLat] = endpoints.destination.lngLat;
  const [srcLng, srcLat] = endpoints.source.lngLat;
  const isHv = options.voltageLevel === "HV" || options.voltageLevel === "EHV";

  // ── 1. Source equipment ──
  if (isHv) {
    // RMU at source for HV
    elements.push({
      element_type: "rmu",
      label: `RMU — ${options.sourceName}`,
      lng: srcLng,
      lat: srcLat,
      properties_json: { source: "connect_assessment", voltage: options.voltageLevel },
    });
  }

  // ── 2. Cable along route ──
  if (routeCoords.length >= 2) {
    const cableType: CableType = isHv ? "hv_cable" : "lv_main";
    cables.push({
      cable_type: cableType,
      label: isHv ? "HV Cable — Route" : "LV Main — Route",
      coordinates: routeCoords,
    });

    // Joints at ~200m intervals
    const totalLength = routeCoords.reduce((sum, _, i) => {
      if (i === 0) return 0;
      const [lon1, lat1] = routeCoords[i - 1];
      const [lon2, lat2] = routeCoords[i];
      const R = 6371000;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
      return sum + R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }, 0);

    const jointCount = Math.floor(totalLength / 200);
    for (let i = 1; i <= jointCount; i++) {
      const fraction = (i * 200) / totalLength;
      if (fraction >= 0.95) break;
      const pos = interpolateAlongRoute(routeCoords, fraction);
      elements.push({
        element_type: "joint",
        label: `Joint ${i}`,
        lng: pos[0],
        lat: pos[1],
        properties_json: { source: "connect_assessment", distance_m: Math.round(i * 200) },
      });
    }
  }

  // ── 3. Feeder pillar near destination ──
  const fpPos = routeCoords.length >= 2
    ? interpolateAlongRoute(routeCoords, 0.92)
    : [destLng, destLat] as [number, number];
  elements.push({
    element_type: "feeder_pillar",
    label: "Feeder Pillar — Distribution",
    lng: fpPos[0],
    lat: fpPos[1],
    properties_json: { source: "connect_assessment" },
  });

  // ── 4. Cutout at destination ──
  elements.push({
    element_type: "cutout",
    label: "Cutout — Supply Point",
    lng: destLng,
    lat: destLat,
    properties_json: { source: "connect_assessment", proposed_kw: options.proposedKw },
  });

  // ── 5. LV Service from feeder pillar to cutout ──
  cables.push({
    cable_type: "lv_service",
    label: "LV Service — Supply",
    coordinates: [
      [fpPos[0], fpPos[1]],
      [destLng, destLat],
    ],
  });

  const summary = `${elements.length} equipment · ${cables.length} cables`;
  return { elements, cables, summary };
}
