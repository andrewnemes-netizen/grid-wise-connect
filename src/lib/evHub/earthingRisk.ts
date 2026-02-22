/**
 * Module F: Earthing Risk Module (CRITICAL)
 * IF extraneous_within_2p5m == TRUE → ENGINEERING_REVIEW_REQUIRED
 * No automatic PME approval. No automatic O-PEN mitigation.
 */
import type { EarthingResult, EarthingSelection, EvHubRules } from "./types";

export interface EarthingInput {
  extraneous_within_2p5m: boolean;
  site_has_metallic_services: boolean;
  /** Additional risk factors */
  additional_flags?: string[];
}

export function assessEarthingRisk(
  input: EarthingInput,
  rules: EvHubRules
): EarthingResult {
  const reason_codes: string[] = [];
  const warnings: string[] = [];
  let review_required = false;
  let selected: EarthingSelection = "UNCONFIRMED";

  // Threshold from rules (default 2.5m per ESQCR)
  const _threshold = (rules.extraneous_distance_threshold_m?.value as number) ?? 2.5;

  // CRITICAL: Extraneous conductive parts within threshold
  if (input.extraneous_within_2p5m) {
    review_required = true;
    reason_codes.push("EXTRANEOUS_WITHIN_2P5M");
    warnings.push("Extraneous conductive parts detected within threshold distance. Engineering review required before earthing selection.");
  }

  // Metallic services present
  if (input.site_has_metallic_services) {
    review_required = true;
    reason_codes.push("METALLIC_SERVICES_PRESENT");
    warnings.push("Metallic services present at site. Bonding assessment required.");
  }

  // Additional flags
  if (input.additional_flags) {
    for (const flag of input.additional_flags) {
      reason_codes.push(flag);
      review_required = true;
    }
  }

  // If earthing rule data is pending, always require review
  if (rules.extraneous_distance_threshold_m?.pending) {
    review_required = true;
    reason_codes.push("EARTHING_RULES_PENDING");
  }

  // NEVER auto-approve PME or O-PEN
  // Selected remains UNCONFIRMED until human review
  if (!review_required && reason_codes.length === 0) {
    // No risk factors — still UNCONFIRMED (conservative)
    warnings.push("No risk factors detected but earthing selection requires site survey confirmation.");
    selected = "UNCONFIRMED";
  }

  return {
    selected,
    review_required,
    reason_codes,
    warnings,
  };
}
