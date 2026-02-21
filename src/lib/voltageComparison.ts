/**
 * Voltage Comparison Engine
 *
 * Runs LV and HV (11kV) optimisers in parallel against the same route,
 * then ranks the options by total installed cost to recommend the
 * most cost-effective voltage tier.
 */

import { runLvOptimiser, type OptimiserInput, type OptimiserResult } from "./lvOptimiser";
import { runHvOptimiser, type HvOptimiserInput, type HvOptimiserResult } from "./hvOptimiser";
import type { CableCatalogueEntry } from "./lvOptimiser";
import type { UnitRates } from "./connectionCosts";

export interface VoltageComparisonInput {
  proposed_kw: number;
  route_length_m: number;
  catalogue: CableCatalogueEntry[];
  unit_rates?: UnitRates;
  /** LV-specific overrides */
  service_length_cap_m?: number;
}

export interface VoltageComparisonTier {
  voltage: "LV" | "HV";
  status: "OK" | "NO_PASSING_SOLUTION";
  total_installed_cost: number | null;
  design_current_a: number | null;
  vd_pct: number | null;
  passes_all: boolean;
  /** Summary details */
  cable_type: string | null;
  transformer_info: string | null;
  constraint_flags: string[];
}

export interface VoltageComparisonResult {
  recommended: "LV" | "HV" | null;
  recommendation_reason: string;
  tiers: VoltageComparisonTier[];
  lv_result: OptimiserResult;
  hv_result: HvOptimiserResult;
  cost_difference_pct: number | null;
}

export function runVoltageComparison(input: VoltageComparisonInput): VoltageComparisonResult {
  const { proposed_kw, route_length_m, catalogue, unit_rates, service_length_cap_m } = input;

  // Run LV optimiser
  const lvInput: OptimiserInput = {
    proposed_kw,
    route_length_m,
    catalogue,
    unit_rates,
    service_length_cap_m,
  };
  const lvResult = runLvOptimiser(lvInput);

  // Run HV optimiser
  const hvInput: HvOptimiserInput = {
    proposed_kw,
    route_length_m,
    catalogue,
    unit_rates,
  };
  const hvResult = runHvOptimiser(hvInput);

  // Build tier summaries
  const lvTier: VoltageComparisonTier = {
    voltage: "LV",
    status: lvResult.status,
    total_installed_cost: lvResult.selected?.cost.total_installed_cost ?? null,
    design_current_a: lvResult.selected?.electrical.design_current_a ?? null,
    vd_pct: lvResult.selected?.electrical.total_vd_pct ?? null,
    passes_all: lvResult.selected?.passes_all ?? false,
    cable_type: lvResult.selected
      ? `${lvResult.selected.network_edges[0]?.cable_type} / ${lvResult.selected.network_edges[1]?.cable_type}`
      : null,
    transformer_info: null, // LV has no transformer
    constraint_flags: lvResult.selected?.constraint_flags ?? lvResult.constraint_failures,
  };

  const hvTier: VoltageComparisonTier = {
    voltage: "HV",
    status: hvResult.status,
    total_installed_cost: hvResult.selected?.cost.total_installed_cost ?? null,
    design_current_a: hvResult.selected?.electrical.design_current_a ?? null,
    vd_pct: hvResult.selected?.electrical.total_vd_pct ?? null,
    passes_all: hvResult.selected?.passes_all ?? false,
    cable_type: hvResult.selected?.network_edge.cable_type ?? null,
    transformer_info: hvResult.selected
      ? `${hvResult.selected.cost.transformer_count}× ${hvResult.selected.cost.transformer_size_kva}kVA`
      : null,
    constraint_flags: hvResult.selected?.constraint_flags ?? hvResult.constraint_failures,
  };

  const tiers = [lvTier, hvTier];

  // Determine recommendation
  let recommended: "LV" | "HV" | null = null;
  let reason = "";
  let costDiffPct: number | null = null;

  const lvPasses = lvTier.passes_all;
  const hvPasses = hvTier.passes_all;
  const lvCost = lvTier.total_installed_cost;
  const hvCost = hvTier.total_installed_cost;

  if (lvPasses && hvPasses && lvCost !== null && hvCost !== null) {
    costDiffPct = Math.round(((hvCost - lvCost) / lvCost) * 100);
    if (lvCost <= hvCost) {
      recommended = "LV";
      reason = `LV is ${Math.abs(costDiffPct)}% cheaper than HV. Both pass electrical validation.`;
    } else {
      recommended = "HV";
      costDiffPct = Math.round(((lvCost - hvCost) / hvCost) * 100);
      reason = `HV is ${Math.abs(costDiffPct)}% cheaper than LV. Both pass electrical validation.`;
    }
  } else if (lvPasses && !hvPasses) {
    recommended = "LV";
    reason = "Only LV has a passing solution.";
  } else if (!lvPasses && hvPasses) {
    recommended = "HV";
    reason = "Only HV has a passing solution. LV fails electrical constraints.";
  } else {
    recommended = null;
    reason = "Neither LV nor HV produce a passing solution for this route and demand.";
  }

  return {
    recommended,
    recommendation_reason: reason,
    tiers,
    lv_result: lvResult,
    hv_result: hvResult,
    cost_difference_pct: costDiffPct,
  };
}
