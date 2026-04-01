/**
 * Detects and corrects swapped lat/lng for UK locations.
 * UK bounds: lat ∈ [49, 61], lng ∈ [-8, 2].
 * If the values are clearly swapped (lat looks like lng and vice versa), swap them back.
 */
export function normalizeUkCoords(lat: number, lng: number): { lat: number; lng: number } {
  // If lat is in lng range and lng is in lat range → swapped
  if (lat >= -8 && lat <= 2 && lng >= 49 && lng <= 61) {
    return { lat: lng, lng: lat };
  }
  return { lat, lng };
}
