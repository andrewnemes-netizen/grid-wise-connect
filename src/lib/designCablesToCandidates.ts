/**
 * Converts Design Mode cables into CableCandidate[] for the EV Hub engine.
 *
 * Design Mode cables carry geometry and type but not capacity/age data,
 * so we map what we can and leave the rest null (engine handles gracefully).
 */
import type { DesignCable } from "@/hooks/useDesignMode";
import type { CableCandidate } from "@/lib/evHub/cableSelection";

export function designCablesToCandidates(
  cables: DesignCable[],
  siteLat?: number,
  siteLng?: number
): CableCandidate[] {
  return cables.map((cable) => {
    // Use cable length as a proxy distance (design cables are drawn from site)
    const distance_m = cable.length_m;

    // Extract any capacity/age hints from properties_json if present
    const props = cable.properties_json ?? {};
    const capacityHeadroom = typeof props.capacity_headroom_pct === "number"
      ? props.capacity_headroom_pct
      : null;
    const ageYears = typeof props.age_years === "number"
      ? props.age_years
      : null;
    const accessibilityScore = typeof props.accessibility_score === "number"
      ? props.accessibility_score
      : null;

    return {
      cable_segment_id: `DESIGN_${cable.id}`,
      distance_m,
      capacity_headroom_pct: capacityHeadroom,
      age_years: ageYears,
      accessibility_score: accessibilityScore,
    };
  });
}
