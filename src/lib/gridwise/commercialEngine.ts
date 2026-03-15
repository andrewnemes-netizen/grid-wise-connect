/**
 * GRIDWISE ENGINE 5 — Commercial & Delivery
 * 
 * Translates engineering outputs into cost estimates, BOQ/BOM,
 * and audience-filtered pack views (Client / DNO / Installer).
 */

import {
  estimateConnectionCost,
  generateBom,
  type CostEstimate,
  type BomItem,
  type UnitRates,
  DEFAULT_UNIT_RATES,
} from "../connectionCosts";
import type {
  SiteInput,
  AssetSearchResult,
  FeasibilityDecision,
  RouteDesign,
  ElectricalDesign,
  CommercialPack,
  FilteredPack,
  PackAudience,
} from "./types";
import type { SplitBoq } from "../evHub/types";
import { generateSplitBoq } from "../evHub/boqGenerator";

/** Variance factors for cost range */
const RANGE_LOW_FACTOR = 0.85;
const RANGE_HIGH_FACTOR = 1.25;

/**
 * Run the commercial engine — cost estimation + BOM + engineering BOQ.
 */
export function runCommercialEngine(
  input: SiteInput,
  assets: AssetSearchResult,
  feasibility: FeasibilityDecision,
  route: RouteDesign,
  electrical: ElectricalDesign,
  unitRates?: UnitRates
): CommercialPack {
  const rates = unitRates ?? DEFAULT_UNIT_RATES;

  // Connection cost estimate
  const costEstimate = estimateConnectionCost(
    {
      proposed_kw: input.proposed_kw,
      distances: assets.distances,
      constraints: {
        capacity_flag: assets.constraints.capacity_flag,
        min_footway_m: assets.constraints.min_footway_m,
        min_carriageway_m: assets.constraints.min_carriageway_m,
      },
      nearest_headroom_kw: assets.nearest_substation?.headroom_kw ?? undefined,
      voltage_override: input.voltage_override,
      surface_split: route.surface_split,
    },
    rates
  );

  // Bill of Materials
  const bom = generateBom(
    {
      proposed_kw: input.proposed_kw,
      distances: assets.distances,
      constraints: {
        capacity_flag: assets.constraints.capacity_flag,
        min_footway_m: assets.constraints.min_footway_m,
        min_carriageway_m: assets.constraints.min_carriageway_m,
      },
      nearest_headroom_kw: assets.nearest_substation?.headroom_kw ?? undefined,
      voltage_override: input.voltage_override,
      surface_split: route.surface_split,
    },
    rates
  );

  // Engineering BOQ from EV Hub engine
  const engineeringBoq = generateSplitBoq(
    route.route_quantities,
    electrical.sizing,
    electrical.earthing,
    input.charger_count
  );

  // Cost range
  const mid = costEstimate.total_estimate;
  const costRange = {
    low: Math.round(mid * RANGE_LOW_FACTOR),
    mid,
    high: Math.round(mid * RANGE_HIGH_FACTOR),
  };

  return {
    cost_estimate: costEstimate,
    bom,
    engineering_boq: engineeringBoq,
    cost_range: costRange,
  };
}

/**
 * Filter commercial pack for a specific audience.
 * 
 * Client: sees project price, commercial summary, no unit costs
 * Installer: sees quantities and unit costs, no client margin
 * DNO: sees engineering data only, no pricing
 */
export function filterPackForAudience(
  commercial: CommercialPack,
  audience: PackAudience
): FilteredPack {
  switch (audience) {
    case "client":
      return {
        audience,
        visible_items: commercial.bom.map(item => ({
          ...item,
          // Hide unit costs, show category totals
          unit_cost: 0,
        })),
        show_pricing: true,
        show_margin: false,
        total_shown: commercial.cost_estimate.total_estimate,
      };

    case "installer":
      return {
        audience,
        visible_items: commercial.bom,
        show_pricing: true,
        show_margin: false, // No client margin visible
        total_shown: commercial.cost_estimate.subtotal, // Pre-margin subtotal
      };

    case "dno":
      return {
        audience,
        visible_items: commercial.bom.map(item => ({
          ...item,
          unit_cost: 0,
          total_cost: 0,
        })),
        show_pricing: false,
        show_margin: false,
        total_shown: null,
      };
  }
}
