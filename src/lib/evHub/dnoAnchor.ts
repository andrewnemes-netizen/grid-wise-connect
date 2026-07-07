/**
 * Module A: DNO Licence Area Anchor
 * Detects site location → matches to DNO licence area → selects rule_set_id
 */
import type { DnoKey, DnoAnchorResult } from "./types";

const DNO_RULE_SET_MAP: Record<DnoKey, string> = {
  UKPN: "DNO_EV_HUB_V1",
  NPG: "DNO_EV_HUB_V1",
  ENWL: "DNO_EV_HUB_V1",
  NGED: "DNO_EV_HUB_V1",
  SPEN: "DNO_EV_HUB_V1",
  SSEN: "DNO_EV_HUB_V1",
  NIE: "DNO_EV_HUB_V1",
};

/** Normalise DNO name variations to canonical key */
function normaliseDnoName(raw: string): DnoKey | null {
  const upper = raw.toUpperCase().trim();
  if (upper.includes("UKPN") || upper.includes("UK POWER")) return "UKPN";
  if (upper.includes("NPG") || upper.includes("NORTHERN POWERGRID")) return "NPG";
  if (upper.includes("ENWL") || upper.includes("ELECTRICITY NORTH WEST")) return "ENWL";
  if (upper.includes("NGED") || upper.includes("NATIONAL GRID") || upper.includes("WESTERN POWER") || upper.includes("WPD")) return "NGED";
  if (upper.includes("SPEN") || upper.includes("SP ENERGY") || upper.includes("SCOTTISHPOWER")) return "SPEN";
  if (upper.includes("SSEN") || upper.includes("SCOTTISH AND SOUTHERN")) return "SSEN";
  if (upper.includes("NIE") || upper.includes("NORTHERN IRELAND ELECTRICITY")) return "NIE";
  return null;
}

export interface DnoAnchorInput {
  lat: number;
  lng: number;
  dno_override?: DnoKey;
}

/**
 * Resolve the DNO for a given site.
 * Phase 1: uses override or spatial lookup result string.
 * In production, spatialLookupResult comes from PostGIS ST_Intersects against licence area polygons.
 */
export function resolveDnoAnchor(
  input: DnoAnchorInput,
  spatialLookupResult?: string
): DnoAnchorResult {
  // Override takes priority
  if (input.dno_override) {
    return {
      dno_key: input.dno_override,
      rule_set_id: DNO_RULE_SET_MAP[input.dno_override],
    };
  }

  // Try spatial lookup result
  if (spatialLookupResult) {
    const key = normaliseDnoName(spatialLookupResult);
    if (key) {
      return {
        dno_key: key,
        rule_set_id: DNO_RULE_SET_MAP[key],
      };
    }
  }

  // Fallback — shouldn't happen in prod but provides safe default
  throw new Error("Unable to determine DNO licence area for site location");
}
