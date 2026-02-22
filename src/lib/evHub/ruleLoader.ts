/**
 * Module B: Rule Catalogue Loader
 * Loads versioned rule JSON by rule_set_id, with confidence & pending field support
 */
import type { DnoKey, EvHubRuleSet, EvHubRules, RuleField, ConfidenceLevel } from "./types";
import { supabase } from "@/integrations/supabase/client";

/** Create a rule field with defaults */
export function makeRuleField(
  value: unknown,
  confidence: ConfidenceLevel = "HIGH",
  source: string = "default",
  pending: boolean = false
): RuleField {
  return { value, confidence, source, pending };
}

/** UK-wide baseline rules — used when no DNO-specific ruleset exists */
export function getBaselineRules(): EvHubRules {
  return {
    lv_max_demand_kva: makeRuleField(276, "HIGH", "UK_baseline"),
    service_cable_default: makeRuleField("pending", "LOW", "UK_baseline", true),
    lv_main_cables: makeRuleField([], "LOW", "UK_baseline", true),
    cover_depths_mm: makeRuleField(
      { footway: 450, carriageway: 600, verge: 450 },
      "MEDIUM",
      "UK_baseline"
    ),
    extraneous_distance_threshold_m: makeRuleField(2.5, "HIGH", "UK_baseline"),
    headroom_factor: makeRuleField(null, "LOW", "UK_baseline", true),
    fault_level_thresholds: makeRuleField(null, "LOW", "UK_baseline", true),
    transformer_loading_thresholds: makeRuleField(null, "LOW", "UK_baseline", true),
    reinforcement_mitigation_sequence: makeRuleField([], "LOW", "UK_baseline", true),
    cable_scoring_weights: makeRuleField(
      { distance: 0.4, capacity: 0.3, age: 0.15, accessibility: 0.15 },
      "MEDIUM",
      "UK_baseline"
    ),
    protection_grading: makeRuleField(null, "LOW", "UK_baseline", true),
    traffic_management_rules: makeRuleField(
      { carriageway_requires_tm: true, footway_requires_tm: false },
      "MEDIUM",
      "UK_baseline"
    ),
  };
}

/**
 * Load rule set from database by DNO key and rule_set_id.
 * Falls back to UK_ALL baseline, then to hardcoded defaults.
 */
export async function loadRuleSet(
  dnoKey: DnoKey,
  ruleSetId: string = "DNO_EV_HUB_V1"
): Promise<EvHubRuleSet> {
  // Try DNO-specific first
  let { data: row } = await (supabase as any)
    .from("ev_hub_rulesets")
    .select("*")
    .eq("dno_key", dnoKey)
    .eq("rule_set_id", ruleSetId)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fall back to UK_ALL
  if (!row) {
    const { data: baseline } = await (supabase as any)
      .from("ev_hub_rulesets")
      .select("*")
      .eq("dno_key", "UK_ALL")
      .eq("rule_set_id", ruleSetId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    row = baseline;
  }

  if (row) {
    return {
      id: row.id,
      dno_key: row.dno_key as DnoKey | "UK_ALL",
      rule_set_id: row.rule_set_id,
      version: row.version,
      is_active: row.is_active,
      rules: row.rules_json as unknown as EvHubRules,
    };
  }

  // Final fallback to hardcoded baseline
  return {
    id: "baseline-fallback",
    dno_key: "UK_ALL",
    rule_set_id: ruleSetId,
    version: "v0-fallback",
    is_active: true,
    rules: getBaselineRules(),
  };
}
