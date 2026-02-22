import { describe, it, expect } from "vitest";
import { resolveDnoAnchor } from "@/lib/evHub/dnoAnchor";
import { getBaselineRules, makeRuleField } from "@/lib/evHub/ruleLoader";
import { selectCandidateCable, type CableCandidate } from "@/lib/evHub/cableSelection";
import { segmentRoute, type RawRouteSegment, type RawCrossing } from "@/lib/evHub/routeSegmentation";
import { computeElectricalSizing, type ElectricalInput } from "@/lib/evHub/electricalSizing";
import { assessEarthingRisk, type EarthingInput } from "@/lib/evHub/earthingRisk";
import { assessReinforcement, type ReinforcementInput } from "@/lib/evHub/reinforcement";
import { generateSplitBoq } from "@/lib/evHub/boqGenerator";
import { buildAuditTrace, applyConfidenceEscalation } from "@/lib/evHub/audit";

const rules = getBaselineRules();

// ── Module A: DNO Anchor ──
describe("DNO Anchor", () => {
  it("uses override when provided", () => {
    const result = resolveDnoAnchor({ lat: 51.5, lng: -0.1, dno_override: "UKPN" });
    expect(result.dno_key).toBe("UKPN");
    expect(result.rule_set_id).toBe("DNO_EV_HUB_V1");
  });

  it("resolves from spatial lookup string", () => {
    const result = resolveDnoAnchor({ lat: 54.9, lng: -1.6 }, "Northern Powergrid");
    expect(result.dno_key).toBe("NPG");
  });

  it("throws when no DNO can be determined", () => {
    expect(() => resolveDnoAnchor({ lat: 0, lng: 0 })).toThrow("Unable to determine DNO");
  });

  it("normalises WPD to NGED", () => {
    const result = resolveDnoAnchor({ lat: 51, lng: -2 }, "WPD");
    expect(result.dno_key).toBe("NGED");
  });
});

// ── Module C: Cable Selection ──
describe("Cable Selection", () => {
  it("returns null candidate when no cables provided", () => {
    const result = selectCandidateCable([], rules);
    expect(result.candidate_poc).toBeNull();
    expect(result.warnings).toContain("NO_LV_CABLES_IN_RANGE");
  });

  it("scores and ranks candidates", () => {
    const candidates: CableCandidate[] = [
      { cable_segment_id: "A", distance_m: 200, capacity_headroom_pct: 20, age_years: 30, accessibility_score: 0.5 },
      { cable_segment_id: "B", distance_m: 30, capacity_headroom_pct: 60, age_years: 5, accessibility_score: 0.9 },
    ];
    const result = selectCandidateCable(candidates, rules);
    expect(result.candidate_poc?.cable_segment_id).toBe("B");
    expect(result.candidate_poc!.linkage_tier).toBe("TIER1");
    expect(result.alternatives.length).toBe(1);
  });

  it("assigns TIER3 for distant cables", () => {
    const candidates: CableCandidate[] = [
      { cable_segment_id: "FAR", distance_m: 400, capacity_headroom_pct: null, age_years: null, accessibility_score: null },
    ];
    const result = selectCandidateCable(candidates, rules);
    expect(result.candidate_poc?.linkage_tier).toBe("TIER3");
    expect(result.candidate_poc?.confidence).toBe("LOW");
  });
});

// ── Module D: Route Segmentation ──
describe("Route Segmentation", () => {
  it("segments route and calculates total length", () => {
    const segs: RawRouteSegment[] = [
      { coordinates: [[0, 0], [0, 1]], surface_type: "FOOTWAY", length_m: 100 },
      { coordinates: [[0, 1], [0, 2]], surface_type: "CARRIAGEWAY", length_m: 50 },
    ];
    const result = segmentRoute(segs, [], rules);
    expect(result.total_length_m).toBe(150);
    expect(result.segments.length).toBe(2);
    expect(result.traffic_management_required).toBe(true); // carriageway present
  });

  it("applies cover depths from rules", () => {
    const segs: RawRouteSegment[] = [
      { coordinates: [], surface_type: "CARRIAGEWAY", length_m: 10 },
    ];
    const result = segmentRoute(segs, [], rules);
    expect(result.segments[0].cover_depth_mm).toBe(600);
  });

  it("processes crossings", () => {
    const crossings: RawCrossing[] = [
      { crossing_type: "ROAD", width_m: 6 },
      { crossing_type: "UTILITY", width_m: 1.5, method: "TRENCHLESS" },
    ];
    const result = segmentRoute([], crossings, rules);
    expect(result.crossings.length).toBe(2);
    expect(result.crossings[1].method).toBe("TRENCHLESS");
  });
});

// ── Module E: Electrical Sizing ──
describe("Electrical Sizing", () => {
  const baseInput: ElectricalInput = {
    charger_count: 4,
    charger_kw_each: 50,
    diversity_factor: 0.8,
    extraneous_within_2p5m: false,
    network_headroom_kva: null,
    transformer_loading_pct: null,
  };

  it("calculates demand correctly", () => {
    const result = computeElectricalSizing(baseInput, rules);
    // 4 * 50 * 0.8 / 0.95 = 168.42
    expect(result.total_demand_kva).toBeCloseTo(168.42, 1);
  });

  it("returns LV_OK when under threshold and no extraneous", () => {
    // With baseline rules having pending critical fields, state won't be LV_OK
    // Let's use non-pending rules
    const cleanRules = {
      ...rules,
      service_cable_default: makeRuleField("185mm² Al", "HIGH", "test"),
      lv_main_cables: makeRuleField(["300mm² Al"], "HIGH", "test"),
      protection_grading: makeRuleField({ type: "HRC" }, "HIGH", "test"),
    };
    const result = computeElectricalSizing(baseInput, cleanRules);
    expect(result.state).toBe("LV_OK");
  });

  it("triggers HV when demand exceeds threshold", () => {
    const bigInput: ElectricalInput = { ...baseInput, charger_count: 20, charger_kw_each: 150 };
    const result = computeElectricalSizing(bigInput, rules);
    expect(result.state).toBe("HV_CONNECTION_REQUIRED");
    expect(result.reason_codes).toContain("DEMAND_EXCEEDS_LV_THRESHOLD");
  });

  it("triggers ENGINEERING_REVIEW when extraneous present", () => {
    const result = computeElectricalSizing({ ...baseInput, extraneous_within_2p5m: true }, rules);
    expect(result.state).toBe("ENGINEERING_REVIEW_REQUIRED");
  });

  it("triggers reinforcement when exceeding headroom", () => {
    const cleanRules = {
      ...rules,
      service_cable_default: makeRuleField("185mm² Al", "HIGH", "test"),
      lv_main_cables: makeRuleField(["300mm² Al"], "HIGH", "test"),
      protection_grading: makeRuleField({ type: "HRC" }, "HIGH", "test"),
    };
    const result = computeElectricalSizing({ ...baseInput, network_headroom_kva: 100 }, cleanRules);
    expect(result.state).toBe("LV_REINFORCEMENT_REQUIRED");
  });
});

// ── Module F: Earthing Risk ──
describe("Earthing Risk", () => {
  it("requires review when extraneous parts present", () => {
    const result = assessEarthingRisk({ extraneous_within_2p5m: true, site_has_metallic_services: false }, rules);
    expect(result.review_required).toBe(true);
    expect(result.selected).toBe("UNCONFIRMED");
    expect(result.reason_codes).toContain("EXTRANEOUS_WITHIN_2P5M");
  });

  it("requires review when metallic services present", () => {
    const result = assessEarthingRisk({ extraneous_within_2p5m: false, site_has_metallic_services: true }, rules);
    expect(result.review_required).toBe(true);
    expect(result.reason_codes).toContain("METALLIC_SERVICES_PRESENT");
  });

  it("never auto-approves earthing — always UNCONFIRMED", () => {
    const result = assessEarthingRisk({ extraneous_within_2p5m: false, site_has_metallic_services: false }, rules);
    expect(result.selected).toBe("UNCONFIRMED");
  });
});

// ── Module G: Reinforcement ──
describe("Reinforcement", () => {
  it("returns STUDY_REQUIRED when headroom unavailable", () => {
    const result = assessReinforcement({
      total_demand_kva: 150,
      network_headroom_kva: null,
      fault_level_ka: null,
      transformer_loading_pct: null,
      transformer_capacity_kva: null,
    }, rules);
    expect(result.state).toBe("STUDY_REQUIRED");
    expect(result.reason_codes).toContain("HEADROOM_DATA_UNAVAILABLE");
  });

  it("returns LV_REINFORCEMENT when demand exceeds headroom", () => {
    const nonPendingRules = {
      ...rules,
      headroom_factor: makeRuleField(0.2, "HIGH", "test"),
      fault_level_thresholds: makeRuleField({ minimum_ka: 5, maximum_ka: 25 }, "HIGH", "test"),
      transformer_loading_thresholds: makeRuleField({ max_loading_pct: 80 }, "HIGH", "test"),
    };
    const result = assessReinforcement({
      total_demand_kva: 200,
      network_headroom_kva: 100,
      fault_level_ka: 10,
      transformer_loading_pct: 50,
      transformer_capacity_kva: 500,
    }, nonPendingRules);
    expect(result.state).toBe("LV_REINFORCEMENT_REQUIRED");
  });

  it("returns NO_REINFORCEMENT when headroom is sufficient", () => {
    const nonPendingRules = {
      ...rules,
      headroom_factor: makeRuleField(0.1, "HIGH", "test"),
      fault_level_thresholds: makeRuleField({ minimum_ka: 5, maximum_ka: 25 }, "HIGH", "test"),
      transformer_loading_thresholds: makeRuleField({ max_loading_pct: 80 }, "HIGH", "test"),
    };
    const result = assessReinforcement({
      total_demand_kva: 50,
      network_headroom_kva: 300,
      fault_level_ka: 15,
      transformer_loading_pct: 30,
      transformer_capacity_kva: 500,
    }, nonPendingRules);
    expect(result.state).toBe("NO_REINFORCEMENT");
  });
});

// ── Module H: BOQ Generator ──
describe("BOQ Generator", () => {
  it("generates items across all categories", () => {
    const route = segmentRoute(
      [{ coordinates: [], surface_type: "FOOTWAY", length_m: 200 }],
      [{ crossing_type: "ROAD", width_m: 6 }],
      rules
    );
    const electrical = computeElectricalSizing({
      charger_count: 4, charger_kw_each: 50, diversity_factor: 0.8,
      extraneous_within_2p5m: false, network_headroom_kva: null, transformer_loading_pct: null,
    }, rules);
    const earthing = assessEarthingRisk({ extraneous_within_2p5m: false, site_has_metallic_services: false }, rules);

    const boq = generateSplitBoq(route, electrical, earthing, 4, rules);
    expect(boq.electrical.length).toBeGreaterThan(0);
    expect(boq.civils.length).toBeGreaterThan(0);
    expect(boq.fees.length).toBe(3);
  });

  it("includes traffic management for carriageway routes", () => {
    const route = segmentRoute(
      [{ coordinates: [], surface_type: "CARRIAGEWAY", length_m: 100 }],
      [], rules
    );
    const electrical = computeElectricalSizing({
      charger_count: 2, charger_kw_each: 50, diversity_factor: 1,
      extraneous_within_2p5m: false, network_headroom_kva: null, transformer_loading_pct: null,
    }, rules);
    const earthing = assessEarthingRisk({ extraneous_within_2p5m: false, site_has_metallic_services: false }, rules);

    const boq = generateSplitBoq(route, electrical, earthing, 2, rules);
    expect(boq.traffic_mgmt.length).toBeGreaterThan(0);
  });

  it("generates LV main extension BOQ when route exceeds max service length", () => {
    const enwlRules = {
      ...rules,
      max_service_length_m: makeRuleField(25, "HIGH", "ENWL_ES281"),
      service_cable_default: makeRuleField("185mm2 Al Wavecon", "HIGH", "test"),
      lv_main_cables: makeRuleField(["185mm2 Al"], "HIGH", "test"),
      protection_grading: makeRuleField({ type: "HRC" }, "HIGH", "test"),
    };
    const route = segmentRoute(
      [{ coordinates: [], surface_type: "FOOTWAY", length_m: 55 }],
      [], enwlRules
    );
    const electrical = computeElectricalSizing({
      charger_count: 4, charger_kw_each: 50, diversity_factor: 0.8,
      extraneous_within_2p5m: false, network_headroom_kva: null, transformer_loading_pct: null,
    }, enwlRules);
    const earthing = assessEarthingRisk({ extraneous_within_2p5m: false, site_has_metallic_services: false }, enwlRules);

    const boq = generateSplitBoq(route, electrical, earthing, 4, enwlRules);
    const e001 = boq.electrical.find(i => i.item_code === "E001");
    const e007 = boq.electrical.find(i => i.item_code === "E007");
    const e008 = boq.electrical.find(i => i.item_code === "E008");
    expect(e001?.quantity).toBe(25);
    expect(e007?.quantity).toBe(30);
    expect(e008?.quantity).toBe(1);
  });

  it("no main extension when route under threshold", () => {
    const enwlRules = {
      ...rules,
      max_service_length_m: makeRuleField(25, "HIGH", "ENWL_ES281"),
      service_cable_default: makeRuleField("185mm2 Al Wavecon", "HIGH", "test"),
      lv_main_cables: makeRuleField(["185mm2 Al"], "HIGH", "test"),
      protection_grading: makeRuleField({ type: "HRC" }, "HIGH", "test"),
    };
    const route = segmentRoute(
      [{ coordinates: [], surface_type: "FOOTWAY", length_m: 20 }],
      [], enwlRules
    );
    const electrical = computeElectricalSizing({
      charger_count: 4, charger_kw_each: 50, diversity_factor: 0.8,
      extraneous_within_2p5m: false, network_headroom_kva: null, transformer_loading_pct: null,
    }, enwlRules);
    const earthing = assessEarthingRisk({ extraneous_within_2p5m: false, site_has_metallic_services: false }, enwlRules);

    const boq = generateSplitBoq(route, electrical, earthing, 4, enwlRules);
    const e001 = boq.electrical.find(i => i.item_code === "E001");
    const e007 = boq.electrical.find(i => i.item_code === "E007");
    expect(e001?.quantity).toBe(20);
    expect(e007).toBeUndefined();
  });

  it("adds EARTHING_ALLOWANCE_NR when review required and unconfirmed", () => {
    const earthing = assessEarthingRisk({ extraneous_within_2p5m: true, site_has_metallic_services: false }, rules);
    const route = segmentRoute([{ coordinates: [], surface_type: "FOOTWAY", length_m: 20 }], [], rules);
    const electrical = computeElectricalSizing({
      charger_count: 4, charger_kw_each: 50, diversity_factor: 0.8,
      extraneous_within_2p5m: true, network_headroom_kva: null, transformer_loading_pct: null,
    }, rules);

    const boq = generateSplitBoq(route, electrical, earthing, 4, rules);
    const e009 = boq.electrical.find(i => i.item_code === "E009");
    expect(e009).toBeDefined();
    expect(e009?.description).toContain("non-standard");
  });

  it("ENWL rules allow LV_OK state", () => {
    const enwlRules = {
      ...rules,
      lv_max_demand_kva: makeRuleField(276, "HIGH", "ENWL_ES281"),
      service_cable_default: makeRuleField("185mm2 Al Wavecon", "HIGH", "ENWL_ES281"),
      lv_main_cables: makeRuleField(["185mm2 Al", "300mm2 Al"], "HIGH", "ENWL_ES281"),
      headroom_factor: makeRuleField(0.2, "HIGH", "ENWL_ES281"),
      fault_level_thresholds: makeRuleField({ minimum_ka: 5, maximum_ka: 25 }, "HIGH", "ENWL_ES281"),
      transformer_loading_thresholds: makeRuleField({ max_loading_pct: 80 }, "HIGH", "ENWL_ES281"),
      reinforcement_mitigation_sequence: makeRuleField(["LOAD_MANAGEMENT"], "HIGH", "ENWL_ES281"),
      protection_grading: makeRuleField({ type: "HRC", rating_a: 315 }, "HIGH", "ENWL_ES281"),
      max_service_length_m: makeRuleField(25, "HIGH", "ENWL_ES281"),
    };
    const result = computeElectricalSizing({
      charger_count: 4, charger_kw_each: 50, diversity_factor: 0.8,
      extraneous_within_2p5m: false, network_headroom_kva: null, transformer_loading_pct: null,
    }, enwlRules);
    expect(result.state).toBe("LV_OK");
  });
});

// ── Module I: Audit & Confidence ──
describe("Audit & Confidence", () => {
  it("collects reason codes and pending fields", () => {
    const cableResult = selectCandidateCable([], rules);
    const route = segmentRoute([], [], rules);
    const electrical = computeElectricalSizing({
      charger_count: 4, charger_kw_each: 50, diversity_factor: 0.8,
      extraneous_within_2p5m: false, network_headroom_kva: null, transformer_loading_pct: null,
    }, rules);
    const earthing = assessEarthingRisk({ extraneous_within_2p5m: true, site_has_metallic_services: false }, rules);
    const reinforcement = assessReinforcement({
      total_demand_kva: 168, network_headroom_kva: null, fault_level_ka: null,
      transformer_loading_pct: null, transformer_capacity_kva: null,
    }, rules);

    const audit = buildAuditTrace(rules, cableResult, route, electrical, earthing, reinforcement);
    expect(audit.reason_codes.length).toBeGreaterThan(0);
    expect(audit.pending_fields.length).toBeGreaterThan(0);
    expect(audit.engine_version).toBe("EV_HUB_ENGINE_V1_FRAMEWORK");
  });

  it("escalates LV_OK to DNO_STUDY_REQUIRED when confidence is low", () => {
    const audit = {
      reason_codes: [],
      warnings: [],
      pending_fields: ["protection_grading"],
      confidence_by_field: { protection_grading: "LOW" as const },
      engine_trace: {},
      engine_version: "V1",
      timestamp: new Date().toISOString(),
    };
    const result = applyConfidenceEscalation("LV_OK", audit);
    expect(result).toBe("DNO_STUDY_REQUIRED");
  });

  it("does not escalate non-LV_OK states", () => {
    const audit = {
      reason_codes: [],
      warnings: [],
      pending_fields: ["protection_grading"],
      confidence_by_field: { protection_grading: "LOW" as const },
      engine_trace: {},
      engine_version: "V1",
      timestamp: new Date().toISOString(),
    };
    const result = applyConfidenceEscalation("HV_CONNECTION_REQUIRED", audit);
    expect(result).toBe("HV_CONNECTION_REQUIRED");
  });
});
