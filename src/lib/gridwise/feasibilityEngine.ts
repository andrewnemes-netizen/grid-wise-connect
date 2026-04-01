/**
 * GRIDWISE ENGINE 2 — Feasibility & POC Selection
 * 
 * Wraps the EV Hub engine pipeline (DNO anchor, cable selection,
 * electrical sizing, earthing, reinforcement) into FeasibilityDecision.
 */

import { runEvHubEngine, type EngineContext } from "../evHub/engine";
import {
  calculateViabilityIndex,
  getViabilityBand,
  getDeploymentClass,
  getGridReadiness,
  getReinforcementProbability,
} from "../scoringEngine";
import type { SiteInput, AssetSearchResult, FeasibilityDecision } from "./types";
import type { CableCandidate } from "../evHub/cableSelection";

/**
 * Run feasibility assessment using the EV Hub engine + scoring engine.
 */
export async function runFeasibilityEngine(
  input: SiteInput,
  assets: AssetSearchResult,
  dnoLookupResult?: string
): Promise<FeasibilityDecision> {
  // Build engine context from asset search results
  // Prefer cable data when available (LV or HV)
  const cableAsset = assets.nearest_cable_segment;
  const hasCable = !!cableAsset;

  const context: EngineContext = {
    dnoLookupResult,
    networkHeadroomKva: hasCable && cableAsset.ducted_kva
      ? cableAsset.ducted_kva
      : hasCable && cableAsset.capacity_kw
        ? cableAsset.capacity_kw
        : assets.nearest_substation?.headroom_kw
          ? assets.nearest_substation.headroom_kw / 0.95
          : null,
    transformerLoadingPct: assets.nearest_substation?.utilisation_pct ?? null,
    transformerCapacityKva: hasCable && cableAsset.direct_kva
      ? cableAsset.direct_kva
      : hasCable && cableAsset.capacity_kw
        ? cableAsset.capacity_kw
        : assets.nearest_substation?.capacity_kw
          ? assets.nearest_substation.capacity_kw / 0.95
          : null,
    siteHasMetallicServices: false,
    cableCandidates: [],
  };

  // Run the full EV Hub engine
  const evHubOutput = await runEvHubEngine(
    {
      site_lat: input.lat,
      site_lng: input.lng,
      charger_count: input.charger_count,
      charger_kw_each: input.charger_kw_each,
      diversity_factor: input.diversity_factor,
      extraneous_within_2p5m: input.extraneous_within_2p5m,
      route_geojson: input.route_geojson,
      lv_cable_layer_available: false,
      dno_override: input.dno_override,
    },
    context
  );

  // Calculate scoring from raw metrics
  const viabilityIndex = calculateViabilityIndex(assets.raw_metrics);
  const viabilityBand = getViabilityBand(viabilityIndex);
  const deploymentClass = getDeploymentClass(assets.raw_metrics);
  const gridReadiness = getGridReadiness(assets.raw_metrics);
  const reinforcementProbability = getReinforcementProbability(assets.raw_metrics);

  return {
    dno_anchor: evHubOutput.dno_anchor,
    feasibility_state: evHubOutput.feasibility_state,
    cable_selection: evHubOutput.cable_selection,
    electrical_sizing: evHubOutput.electrical_sizing,
    earthing: evHubOutput.earthing,
    reinforcement: evHubOutput.reinforcement,
    viability_index: viabilityIndex,
    viability_band: viabilityBand,
    deployment_class: deploymentClass,
    grid_readiness: gridReadiness,
    reinforcement_probability: reinforcementProbability,
  };
}
