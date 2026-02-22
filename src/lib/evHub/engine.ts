/**
 * EV_HUB_ENGINE_V1_FRAMEWORK
 * Main orchestrator / state machine for the EV Hub DNO Engine
 */
import type {
  EvHubEngineInput,
  EvHubEngineOutput,
  FeasibilityState,
  RouteQuantities,
} from "./types";
import { resolveDnoAnchor } from "./dnoAnchor";
import { loadRuleSet } from "./ruleLoader";
import { selectCandidateCable, type CableCandidate } from "./cableSelection";
import { segmentRoute, type RawRouteSegment, type RawCrossing } from "./routeSegmentation";
import { computeElectricalSizing } from "./electricalSizing";
import { assessEarthingRisk } from "./earthingRisk";
import { assessReinforcement } from "./reinforcement";
import { generateSplitBoq } from "./boqGenerator";
import { buildAuditTrace, applyConfidenceEscalation } from "./audit";

export interface EngineContext {
  /** Spatial lookup result for DNO (from PostGIS or user selection) */
  dnoLookupResult?: string;
  /** Nearby LV cable candidates (from spatial query) */
  cableCandidates?: CableCandidate[];
  /** Route segments classified by surface type */
  routeSegments?: RawRouteSegment[];
  /** Route crossings */
  routeCrossings?: RawCrossing[];
  /** Network headroom at connection point (kVA) */
  networkHeadroomKva?: number | null;
  /** Fault level at connection point (kA) */
  faultLevelKa?: number | null;
  /** Transformer loading (%) */
  transformerLoadingPct?: number | null;
  /** Transformer capacity (kVA) */
  transformerCapacityKva?: number | null;
  /** Whether site has metallic services */
  siteHasMetallicServices?: boolean;
}

/**
 * Run the full EV Hub engine pipeline.
 * Returns a complete EvHubEngineOutput payload.
 */
export async function runEvHubEngine(
  input: EvHubEngineInput,
  context: EngineContext = {}
): Promise<EvHubEngineOutput> {
  // ── A) DNO Anchor ──
  const dnoAnchor = resolveDnoAnchor(
    { lat: input.site_lat, lng: input.site_lng, dno_override: input.dno_override },
    context.dnoLookupResult
  );

  // ── B) Load Rules ──
  const ruleSet = await loadRuleSet(dnoAnchor.dno_key, dnoAnchor.rule_set_id);
  const rules = ruleSet.rules;

  // ── C) Cable Selection ──
  const cableSelection = selectCandidateCable(
    context.cableCandidates ?? [],
    rules
  );

  // ── D) Route Segmentation ──
  const routeQuantities: RouteQuantities = segmentRoute(
    context.routeSegments ?? [],
    context.routeCrossings ?? [],
    rules
  );

  // ── E) Electrical Sizing ──
  const electricalSizing = computeElectricalSizing(
    {
      charger_count: input.charger_count,
      charger_kw_each: input.charger_kw_each,
      diversity_factor: input.diversity_factor ?? 1.0,
      extraneous_within_2p5m: input.extraneous_within_2p5m,
      network_headroom_kva: context.networkHeadroomKva ?? null,
      transformer_loading_pct: context.transformerLoadingPct ?? null,
    },
    rules
  );

  // ── F) Earthing Risk ──
  const earthing = assessEarthingRisk(
    {
      extraneous_within_2p5m: input.extraneous_within_2p5m,
      site_has_metallic_services: context.siteHasMetallicServices ?? false,
    },
    rules
  );

  // ── G) Reinforcement ──
  const reinforcement = assessReinforcement(
    {
      total_demand_kva: electricalSizing.total_demand_kva,
      network_headroom_kva: context.networkHeadroomKva ?? null,
      fault_level_ka: context.faultLevelKa ?? null,
      transformer_loading_pct: context.transformerLoadingPct ?? null,
      transformer_capacity_kva: context.transformerCapacityKva ?? null,
    },
    rules
  );

  // ── H) Split BOQ ──
  const boq = generateSplitBoq(
    routeQuantities,
    electricalSizing,
    earthing,
    input.charger_count,
    rules
  );

  // ── I) Audit Trace ──
  const audit = buildAuditTrace(
    rules,
    cableSelection,
    routeQuantities,
    electricalSizing,
    earthing,
    reinforcement
  );

  // ── Final feasibility state (worst-case across modules) ──
  let feasibilityState: FeasibilityState = electricalSizing.state;

  // Earthing can escalate
  if (earthing.review_required && feasibilityState === "LV_OK") {
    feasibilityState = "ENGINEERING_REVIEW_REQUIRED";
  }

  // Reinforcement can escalate
  if (reinforcement.state === "STUDY_REQUIRED" && feasibilityState === "LV_OK") {
    feasibilityState = "DNO_STUDY_REQUIRED";
  }
  if (reinforcement.state === "LV_REINFORCEMENT_REQUIRED" &&
    (feasibilityState === "LV_OK" || feasibilityState === "DNO_STUDY_REQUIRED")) {
    feasibilityState = "LV_REINFORCEMENT_REQUIRED";
  }
  if (reinforcement.state === "HV_REINFORCEMENT_REQUIRED") {
    feasibilityState = "HV_CONNECTION_REQUIRED";
  }

  // Confidence escalation
  feasibilityState = applyConfidenceEscalation(feasibilityState, audit);

  return {
    version: "EV_HUB_ENGINE_V1_FRAMEWORK",
    dno_anchor: dnoAnchor,
    cable_selection: cableSelection,
    route_quantities: routeQuantities,
    electrical_sizing: electricalSizing,
    earthing,
    reinforcement,
    boq,
    feasibility_state: feasibilityState,
    audit,
  };
}
