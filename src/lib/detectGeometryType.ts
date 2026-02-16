/**
 * Detect the dominant geometry type from a set of GeoJSON features.
 * Normalizes Multi* variants (e.g., MultiPolygon → Polygon).
 * Returns the most common base type, or "Mixed" if no clear majority.
 */
export function detectGeometryType(
  features: GeoJSON.Feature[]
): string {
  const counts: Record<string, number> = {};

  for (const f of features) {
    if (!f.geometry?.type) continue;
    // Normalize Multi variants
    const base = f.geometry.type.replace(/^Multi/, "");
    counts[base] = (counts[base] || 0) + 1;
  }

  const entries = Object.entries(counts);
  if (entries.length === 0) return "Unknown";
  if (entries.length === 1) return entries[0][0];

  // Find dominant type (>50% of features)
  const total = entries.reduce((sum, [, c]) => sum + c, 0);
  entries.sort((a, b) => b[1] - a[1]);
  const [topType, topCount] = entries[0];

  if (topCount / total > 0.5) return topType;
  return "Mixed";
}
