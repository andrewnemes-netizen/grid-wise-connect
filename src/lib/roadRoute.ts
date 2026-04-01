/**
 * Road-following route via OSRM public API.
 * Falls back to straight line if routing fails or detour is excessive.
 *
 * Uses `foot` profile (most permissive for road access).
 * Adds `continue_straight=true` for the most direct path.
 * Caps detour ratio at 2.5x straight-line distance — cable excavation
 * can go on either side of any road in any direction, so long detours
 * around one-way systems / block perimeters are unnecessary.
 */

const OSRM_BASE = "https://router.project-osrm.org/route/v1/foot";

/** Haversine distance in metres between two [lng, lat] points */
function haversineM(a: [number, number], b: [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * sinLng * sinLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const MAX_DETOUR_RATIO = 2.5;

function lineDistanceM(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineM(coords[i - 1], coords[i]);
  }
  return Math.round(total);
}

export async function fetchRoadRoute(
  from: [number, number],
  to: [number, number]
): Promise<[number, number][]> {
  try {
    const url = `${OSRM_BASE}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson&continue_straight=true`;
    const res = await fetch(url);
    if (!res.ok) return [from, to];
    const data = await res.json();
    const route = data?.routes?.[0];
    const coords = route?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return [from, to];

    // Check detour ratio — if OSRM route is >2.5x the straight-line
    // distance, fall back to straight line (excavation doesn't need
    // to follow one-way or pedestrian routing rules)
    const straightM = haversineM(from, to);
    const routeM = route.distance ?? 0;
    if (straightM > 0 && routeM / straightM > MAX_DETOUR_RATIO) {
      console.warn(
        `OSRM detour ratio ${(routeM / straightM).toFixed(1)}x exceeds cap (${MAX_DETOUR_RATIO}x), using straight line`
      );
      return [from, to];
    }

    return coords as [number, number][];
  } catch (e) {
    console.warn("OSRM route fetch failed, using straight line:", e);
  }
  return [from, to];
}

/**
 * Fetch road-following routes for multiple connection lines in parallel.
 * Each line gets its coords replaced with the road-following geometry.
 */
export async function fetchAllRoadRoutes(
  lines: { id: string; label: string; origin: [number, number]; destination: [number, number]; color: string; distance_m: number }[]
): Promise<{ id: string; label: string; coords: [number, number][]; color: string; distance_m: number }[]> {
  const results = await Promise.all(
    lines.map(async (line) => {
      const coords = await fetchRoadRoute(line.origin, line.destination);
      const routedDistanceM = lineDistanceM(coords);
      return {
        id: line.id,
        label: line.label,
        coords,
        color: line.color,
        distance_m: routedDistanceM > 0 ? routedDistanceM : line.distance_m,
      };
    })
  );
  return results;
}
