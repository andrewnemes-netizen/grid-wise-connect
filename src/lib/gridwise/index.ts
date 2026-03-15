/**
 * GRIDWISE CONNECT — Public API
 * 
 * Single import for the unified pipeline.
 * 
 * Usage:
 *   import { runGridwiseProject } from "@/lib/gridwise";
 */

// Master orchestrator
export { runGridwiseProject } from "./orchestrator";

// Individual engines (for targeted re-runs)
export { runAssetEngine } from "./assetEngine";
export { runFeasibilityEngine } from "./feasibilityEngine";
export { runRouteEngine } from "./routeEngine";
export { runElectricalEngine } from "./electricalEngine";
export { runCommercialEngine, filterPackForAudience } from "./commercialEngine";

// Types
export type {
  GridwiseProject,
  SiteInput,
  AssetSearchResult,
  FeasibilityDecision,
  RouteDesign,
  ElectricalDesign,
  CommercialPack,
  FilteredPack,
  VisualPack,
  PackAudience,
  PipelineProgress,
  PipelineStage,
  NearestAsset,
  StreetworksAssessment,
} from "./types";
