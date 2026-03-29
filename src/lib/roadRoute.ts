/**
 * Road-following route via OSRM public API.
 * Falls back to straight line if routing fails.
 */

const OSRM_BASE = "https://router.project-osrm.org/route/v1/foot";

export async function fetchRoadRoute(
  from: [number, number],
  to: [number, number]
): Promise<[number, number][]> {
  try {
    const url = `${OSRM_BASE}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return [from, to];
    const data = await res.json();
    const coords = data?.routes?.[0]?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      return coords as [number, number][];
    }
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
      return {
        id: line.id,
        label: line.label,
        coords,
        color: line.color,
        distance_m: line.distance_m,
      };
    })
  );
  return results;
}
