/**
 * GRIDWISE ENGINE 4 — Electrical & Safety Validation
 * 
 * Combines EV Hub feasibility-level sizing with detailed
 * ICP-grade electrical validation when cable data is available.
 */

import { runElectricalValidation, type ElectricalValidationResult } from "../electricalEngine";
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
    // TODO: Look up actual impedance and ratings from cable_catalogue
    // For now, use conservative defaults for the validation framework
    try {
      validation = runElectricalValidation({
        proposed_kw: input.proposed_kw,
        mains_length_m: route.route_quantities.total_length_m * 0.7, // Approximate mains portion
        service_length_m: route.route_quantities.total_length_m * 0.3, // Approximate service portion
        mains_impedance_per_km: 0.32, // Conservative 185mm² XLPE
        service_impedance_per_km: 0.64, // Conservative 95mm² XLPE
        mains_rating_a: 400,
        service_rating_a: 200,
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
