/**
 * Voltage Comparison Engine
 *
 * Runs LV, HV (11kV), and EHV (33kV) optimisers in parallel against the same route,
 * then ranks the options by total installed cost to recommend the
 * most cost-effective voltage tier.
 */

import { runLvOptimiser, type OptimiserInput, type OptimiserResult } from "./lvOptimiser";
import { runHvOptimiser, type HvOptimiserInput, type HvOptimiserResult } from "./hvOptimiser";
import { runEhvOptimiser, type EhvOptimiserInput, type EhvOptimiserResult } from "./ehvOptimiser";
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
  voltage: "LV" | "HV" | "EHV";
  status: "OK" | "NO_PASSING_SOLUTION";
  total_installed_cost: number | null;
  design_current_a: number | null;
  vd_pct: number | null;
  passes_all: boolean;
  cable_type: string | null;
  transformer_info: string | null;
  constraint_flags: string[];
}

export interface VoltageComparisonResult {
  recommended: "LV" | "HV" | "EHV" | null;
  recommendation_reason: string;
  tiers: VoltageComparisonTier[];
  lv_result: OptimiserResult;
  hv_result: HvOptimiserResult;
  ehv_result: EhvOptimiserResult;
  cost_difference_pct: number | null;
}

export function runVoltageComparison(input: VoltageComparisonInput): VoltageComparisonResult {
  const { proposed_kw, route_length_m, catalogue, unit_rates, service_length_cap_m } = input;

  // Run all three optimisers
  const lvResult = runLvOptimiser({
    proposed_kw,
    route_length_m,
    catalogue,
    unit_rates,
    service_length_cap_m,
  });

  const hvResult = runHvOptimiser({
    proposed_kw,
    route_length_m,
    catalogue,
    unit_rates,
  });

  const ehvResult = runEhvOptimiser({
    proposed_kw,
    route_length_m,
    catalogue,
    unit_rates,
  });

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
    transformer_info: null,
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

  const ehvTier: VoltageComparisonTier = {
    voltage: "EHV",
    status: ehvResult.status,
    total_installed_cost: ehvResult.selected?.cost.total_installed_cost ?? null,
    design_current_a: ehvResult.selected?.electrical.design_current_a ?? null,
    vd_pct: ehvResult.selected?.electrical.total_vd_pct ?? null,
    passes_all: ehvResult.selected?.passes_all ?? false,
    cable_type: ehvResult.selected?.network_edge.cable_type ?? null,
    transformer_info: ehvResult.selected
      ? `${ehvResult.selected.cost.transformer_count}× ${ehvResult.selected.cost.transformer_size_kva}kVA`
      : null,
    constraint_flags: ehvResult.selected?.constraint_flags ?? ehvResult.constraint_failures,
  };

  const tiers = [lvTier, hvTier, ehvTier];

  // Find cheapest passing tier
  const passingTiers = tiers.filter((t) => t.passes_all && t.total_installed_cost !== null);
  let recommended: "LV" | "HV" | "EHV" | null = null;
  let reason = "";
  let costDiffPct: number | null = null;

  if (passingTiers.length === 0) {
    reason = "No voltage tier produces a passing solution for this route and demand.";
  } else if (passingTiers.length === 1) {
    recommended = passingTiers[0].voltage;
    reason = `Only ${recommended} has a passing solution.`;
  } else {
    // Sort by cost
    passingTiers.sort((a, b) => a.total_installed_cost! - b.total_installed_cost!);
    recommended = passingTiers[0].voltage;
    const cheapest = passingTiers[0].total_installed_cost!;
    const nextCheapest = passingTiers[1].total_installed_cost!;
    costDiffPct = Math.round(((nextCheapest - cheapest) / cheapest) * 100);
    reason = `${recommended} is the cheapest passing option. ${passingTiers.length} tier${passingTiers.length > 1 ? "s" : ""} pass electrical validation.`;
  }

  return {
    recommended,
    recommendation_reason: reason,
    tiers,
    lv_result: lvResult,
    hv_result: hvResult,
    ehv_result: ehvResult,
    cost_difference_pct: costDiffPct,
  };
}
