/**
 * GRIDWISE ENGINE 4 — Electrical & Safety Validation
 * 
 * Combines EV Hub feasibility-level sizing with detailed
 * ICP-grade electrical validation when cable data is available.
 */

import { runElectricalValidation, type ElectricalValidationResult } from "../electricalEngine";
import { selectCableForLoad } from "../connectionCosts";
import type { SiteInput, FeasibilityDecision, RouteDesign, ElectricalDesign } from "./types";

/**
 * Run electrical and safety validation.
 * Uses feasibility results + optional detailed cable validation.
 */
export function runElectricalEngine(
  input: SiteInput,
  feasibility: FeasibilityDecision,
  route: RouteDesign
): ElectricalDesign {
  let validation: ElectricalValidationResult | null = null;

  // If we have cable selections (not PENDING), run detailed validation
  const serviceCable = feasibility.electrical_sizing.service_cable;
  const lvMainCable = feasibility.electrical_sizing.lv_main_cable;

  if (serviceCable !== "PENDING" && lvMainCable !== "PENDING") {
    // Select cables based on load using DNO kVA thresholds
    const kva = input.proposed_kw / 0.95;
    const voltageLevel = kva <= 275 ? "LV" as const : input.proposed_kw <= 1500 ? "HV" as const : "EHV" as const;
    const mainsCable = selectCableForLoad(input.proposed_kw, voltageLevel);
    // Service cable is typically one size down for LV, same for HV/EHV
    const serviceCableSelection = voltageLevel === "LV"
      ? selectCableForLoad(input.proposed_kw * 0.5, "LV") // Service portion carries less
      : mainsCable;

    try {
      validation = runElectricalValidation({
        proposed_kw: input.proposed_kw,
        mains_length_m: route.route_quantities.total_length_m * 0.7,
        service_length_m: route.route_quantities.total_length_m * 0.3,
        mains_impedance_per_km: mainsCable.impedance_per_km,
        service_impedance_per_km: serviceCableSelection.impedance_per_km,
        mains_rating_a: mainsCable.current_rating_a,
        service_rating_a: serviceCableSelection.current_rating_a,
        diversity_factor: input.diversity_factor ?? 1.0,
      });
    } catch (e) {
      console.warn("Electrical validation skipped:", e);
    }
  }

  return {
    sizing: feasibility.electrical_sizing,
    validation,
    earthing: feasibility.earthing,
    reinforcement: feasibility.reinforcement,
  };
}
