/**
 * GRIDWISE CONNECT — Master Orchestrator
 * 
 * Single entry point that runs the full end-to-end pipeline:
 * 
 *   Site Input → Asset Discovery → Feasibility & POC → Route & Streetworks
 *   → Electrical Validation → Commercial & Delivery → Visuals
 * 
 * Returns a complete GridwiseProject object.
 */

import type { GridwiseProject, SiteInput, VisualPack, PipelineProgress } from "./types";
import { runAssetEngine } from "./assetEngine";
import { runFeasibilityEngine } from "./feasibilityEngine";
import { runRouteEngine } from "./routeEngine";
import { runElectricalEngine } from "./electricalEngine";
import { runCommercialEngine } from "./commercialEngine";
import { buildAuditTrace } from "../evHub/audit";
import { loadRuleSet, getBaselineRules } from "../evHub/ruleLoader";
import { resolveDnoAnchor } from "../evHub/dnoAnchor";
import type { UnitRates } from "../connectionCosts";

/**
 * Generate a unique run ID for this pipeline execution.
 */
function generateRunId(): string {
  return `GW-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/**
 * Run the complete Gridwise Connect pipeline.
 * 
 * @param input - Site configuration and demand parameters
 * @param options - Optional configuration (unit rates, progress callback)
 * @returns Complete GridwiseProject with all engine outputs
 * 
 * @example
 * ```ts
 * const project = await runGridwiseProject({
 *   site_name: "Tesco Exeter",
 *   lat: 50.725,
 *   lng: -3.527,
 *   proposed_kw: 150,
 *   charger_count: 4,
 *   charger_kw_each: 50,
 *   extraneous_within_2p5m: false,
 * });
 * 
 * console.log(project.feasibility.feasibility_state); // "LV_OK"
 * console.log(project.commercial.cost_range);          // { low, mid, high }
 * ```
 */
export async function runGridwiseProject(
  input: SiteInput,
  options?: {
    unitRates?: UnitRates;
    onProgress?: (progress: PipelineProgress) => void;
    /** Pre-captured visuals (map screenshot, street view) */
    visuals?: Partial<VisualPack>;
    /** DNO lookup result from spatial query (used for auto-detection) */
    dnoLookupResult?: string;
  }
): Promise<GridwiseProject> {
  const runId = generateRunId();
  const onProgress = options?.onProgress;

  const stages = [
    "ASSET_DISCOVERY",
    "FEASIBILITY",
    "ROUTE_DESIGN",
    "ELECTRICAL_VALIDATION",
    "COMMERCIAL",
    "COMPLETE",
  ] as const;

  const report = (stageIndex: number, message: string) => {
    onProgress?.({
      stage: stages[stageIndex],
      stage_index: stageIndex,
      total_stages: stages.length,
      message,
    });
  };

  try {
    // ── Stage 1: Asset Discovery ──
    report(0, "Searching for nearby network assets...");
    const assets = await runAssetEngine(input);

    // ── Stage 2: Feasibility & POC ──
    report(1, "Running feasibility assessment...");
    const feasibility = await runFeasibilityEngine(input, assets, options?.dnoLookupResult);

    // ── Stage 3: Route & Streetworks ──
    report(2, "Designing route and assessing streetworks...");
    const route = await runRouteEngine(input, assets, feasibility);

    // ── Stage 4: Electrical Validation ──
    report(3, "Validating electrical design...");
    const electrical = runElectricalEngine(input, feasibility, route);

    // ── Stage 5: Commercial ──
    report(4, "Generating commercial outputs...");
    const commercial = runCommercialEngine(
      input, assets, feasibility, route, electrical,
      options?.unitRates
    );

    // ── Visuals (populated by UI, passed in or empty) ──
    const visuals: VisualPack = {
      map_screenshot: options?.visuals?.map_screenshot,
      street_view_captures: options?.visuals?.street_view_captures ?? [],
      boundary_overlay: input.boundary_geojson,
      route_overlay: input.route_geojson,
      poc_marker: undefined,
      supply_point_marker: { lat: input.lat, lng: input.lng },
    };

    // ── Audit Trace ──
    const rules = getBaselineRules();
    const audit = buildAuditTrace(
      rules,
      feasibility.cable_selection,
      route.route_quantities,
      feasibility.electrical_sizing,
      feasibility.earthing,
      feasibility.reinforcement
    );

    report(5, "Pipeline complete.");

    return {
      version: "GRIDWISE_CONNECT_V1",
      run_id: runId,
      timestamp: new Date().toISOString(),
      site: input,
      assets,
      feasibility,
      route,
      electrical,
      commercial,
      visuals,
      audit,
    };
  } catch (error) {
    onProgress?.({
      stage: "ERROR",
      stage_index: -1,
      total_stages: stages.length,
      message: "Pipeline failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
