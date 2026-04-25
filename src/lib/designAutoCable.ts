/**
 * Live Site Designer — auto-cable helper.
 *
 * On EV charger drop we automatically draw an LV service cable from the new
 * asset to the nearest valid Point of Connection. POCs are scored by type
 * (transformer > RMU > feeder pillar > cutout) and then by haversine distance.
 */

import type { DesignElement, EquipmentType } from "@/hooks/useDesignMode";

/**
 * Default priority of POC types when no explicit allow-list is supplied.
 * Higher = preferred when distances are otherwise comparable.
 */
const POC_PRIORITY: Partial<Record<EquipmentType, number>> = {
  transformer: 4,
  rmu: 3,
  feeder_pillar: 2,
  cutout: 1,
};

function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const lat1r = (lat1 * Math.PI) / 180;
  const lat2r = (lat2 * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1r) * Math.cos(lat2r) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export interface NearestPoc {
  element: DesignElement;
  distance_m: number;
}

/**
 * Find the best Point of Connection for a newly dropped charger / load.
 * Returns null if no candidate POCs are placed yet.
 */
export function findNearestPoc(
  drop: [number, number],
  elements: DesignElement[],
  options?: { maxDistanceM?: number; allowedTypes?: EquipmentType[] }
): NearestPoc | null {
  const max = options?.maxDistanceM ?? 1000;
  const allowed = options?.allowedTypes ? new Set(options.allowedTypes) : null;
  let best: NearestPoc | null = null;
  for (const el of elements) {
    if (allowed && !allowed.has(el.element_type)) continue;
    const priority = POC_PRIORITY[el.element_type] ?? 0;
    if (priority === 0) continue;
    const d = haversineMeters(drop, [el.lng, el.lat]);
    if (d > max) continue;
    if (
      !best ||
      // Prefer higher priority; break ties on distance.
      priority > (POC_PRIORITY[best.element.element_type] ?? 0) ||
      (priority === (POC_PRIORITY[best.element.element_type] ?? 0) && d < best.distance_m)
    ) {
      best = { element: el, distance_m: d };
    }
  }
  return best;
}

/**
 * Find the nearest Feeder Pillar to a drop point. Used as the primary POC
 * for EV-charger drops — every EVCP service cable should land on a feeder
 * pillar if one exists within the search radius (default 250 m).
 */
export function findNearestFeederPillar(
  drop: [number, number],
  elements: DesignElement[],
  options?: { maxDistanceM?: number }
): NearestPoc | null {
  return findNearestPoc(drop, elements, {
    maxDistanceM: options?.maxDistanceM ?? 250,
    allowedTypes: ["feeder_pillar"],
  });
}

/** Build straight-line coordinates from a drop point to a POC. */
export function straightCableTo(
  drop: [number, number],
  poc: DesignElement
): [number, number][] {
  return [drop, [poc.lng, poc.lat]];
}