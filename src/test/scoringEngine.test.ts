import { describe, it, expect } from "vitest";
import {
  connectionScore, civilsScore, deploymentScore,
  calculateViabilityIndex, getViabilityBand,
  getDeploymentClass, getGridReadiness, getDeploymentFriction,
  getRecommendedVoltage, getReinforcementProbability,
  getCostBand, getFeederConstraintRisk, buildRawMetrics,
  type RawMetrics,
} from "@/lib/scoringEngine";

const makeMetrics = (overrides?: Partial<RawMetrics>): RawMetrics => ({
  connection: {
    nearest_substation_distance_m: 300,
    headroom_kw: 1200,
    utilisation_pct: 55,
    feeder_distance_m: 400,
    capacity_flag: "available",
    ...overrides?.connection,
  },
  civils: {
    constraint_count: 0,
    min_footway_m: 2.0,
    min_carriageway_m: 7.0,
    ndp_intersect: false,
    wayleave_intersect: false,
    data_confidence: "high",
    ...overrides?.civils,
  },
  deployment: {
    proposed_kw: 150,
    capacity_vs_demand_ratio: 1.8,
    distance_band: "close",
    ...overrides?.deployment,
  },
});

describe("connectionScore", () => {
  it("returns high score for close, low-utilisation substation", () => {
    const s = connectionScore(makeMetrics().connection);
    expect(s).toBeGreaterThan(60);
  });

  it("returns low score for far, high-utilisation substation", () => {
    const s = connectionScore({
      nearest_substation_distance_m: 2800,
      headroom_kw: 50,
      utilisation_pct: 95,
      feeder_distance_m: 3000,
      capacity_flag: "constrained",
    });
    expect(s).toBeLessThan(20);
  });

  it("handles null headroom and utilisation gracefully", () => {
    const s = connectionScore({
      nearest_substation_distance_m: 500,
      headroom_kw: null,
      utilisation_pct: null,
      feeder_distance_m: 600,
      capacity_flag: "unknown",
    });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe("civilsScore", () => {
  it("returns 100 for no constraints", () => {
    expect(civilsScore(makeMetrics().civils)).toBe(100);
  });

  it("penalises NDP intersection", () => {
    const s = civilsScore({ ...makeMetrics().civils, ndp_intersect: true });
    expect(s).toBeLessThan(80);
  });

  it("skips width penalties when data_confidence is low", () => {
    const s = civilsScore({
      constraint_count: 0,
      min_footway_m: 0.5, // would normally penalise
      min_carriageway_m: 3.0,
      ndp_intersect: false,
      wayleave_intersect: false,
      data_confidence: "low",
    });
    expect(s).toBe(100); // no penalty applied
  });
});

describe("deploymentScore", () => {
  it("returns high score for good ratio + close band", () => {
    const s = deploymentScore(makeMetrics().deployment);
    expect(s).toBeGreaterThan(70);
  });

  it("handles null capacity_vs_demand_ratio", () => {
    const s = deploymentScore({ proposed_kw: 150, capacity_vs_demand_ratio: null, distance_band: "medium" });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe("calculateViabilityIndex", () => {
  it("returns GREEN for good site", () => {
    const m = makeMetrics();
    const idx = calculateViabilityIndex(m);
    expect(idx).toBeGreaterThanOrEqual(65);
    expect(getViabilityBand(idx)).toBe("GREEN");
  });

  it("returns RED for bad site", () => {
    const m = makeMetrics({
      connection: {
        nearest_substation_distance_m: 3000,
        headroom_kw: 10,
        utilisation_pct: 98,
        feeder_distance_m: 3000,
        capacity_flag: "constrained",
      },
      civils: {
        constraint_count: 3,
        min_footway_m: 0.8,
        min_carriageway_m: 4.0,
        ndp_intersect: true,
        wayleave_intersect: true,
        data_confidence: "high",
      },
      deployment: {
        proposed_kw: 500,
        capacity_vs_demand_ratio: 0.02,
        distance_band: "far",
      },
    });
    const idx = calculateViabilityIndex(m);
    expect(idx).toBeLessThan(40);
    expect(getViabilityBand(idx)).toBe("RED");
  });
});

describe("getDeploymentClass", () => {
  it("returns Fast Deploy for ideal site", () => {
    expect(getDeploymentClass(makeMetrics())).toBe("Fast Deploy");
  });

  it("returns Complex when headroom unknown", () => {
    expect(getDeploymentClass(makeMetrics({ connection: { ...makeMetrics().connection, headroom_kw: null } }))).toBe("Complex");
  });

  it("returns Needs Reinforcement when headroom < proposed", () => {
    expect(getDeploymentClass(makeMetrics({
      connection: { ...makeMetrics().connection, headroom_kw: 50 },
    }))).toBe("Needs Reinforcement");
  });
});

describe("getFeederConstraintRisk", () => {
  it("returns Medium for null utilisation", () => {
    const m = makeMetrics({ connection: { ...makeMetrics().connection, utilisation_pct: null } });
    expect(getFeederConstraintRisk(m)).toBe("Medium");
  });

  it("returns Low for low utilisation", () => {
    const m = makeMetrics({ connection: { ...makeMetrics().connection, utilisation_pct: 30 } });
    expect(getFeederConstraintRisk(m)).toBe("Low");
  });

  it("returns High for high utilisation", () => {
    const m = makeMetrics({ connection: { ...makeMetrics().connection, utilisation_pct: 90 } });
    expect(getFeederConstraintRisk(m)).toBe("High");
  });
});

describe("getRecommendedVoltage", () => {
  it("LV for ≤275kVA (~261kW)", () => expect(getRecommendedVoltage(261)).toBe("LV"));
  it("HV for >275kVA to 1500kW", () => expect(getRecommendedVoltage(262)).toBe("HV"));
  it("EHV for >1500kW", () => expect(getRecommendedVoltage(2000)).toBe("EHV"));
});

describe("getReinforcementProbability", () => {
  it("returns 50 when headroom unknown", () => {
    const m = makeMetrics({ connection: { ...makeMetrics().connection, headroom_kw: null } });
    expect(getReinforcementProbability(m)).toBe(50);
  });

  it("returns low probability when ample headroom", () => {
    expect(getReinforcementProbability(makeMetrics())).toBeLessThanOrEqual(25);
  });
});

describe("getCostBand", () => {
  it("£ for under 80k", () => expect(getCostBand(50000)).toBe("£"));
  it("££ for 80-250k", () => expect(getCostBand(150000)).toBe("££"));
  it("£££ for over 250k", () => expect(getCostBand(300000)).toBe("£££"));
});

describe("buildRawMetrics", () => {
  it("builds from edge function response", () => {
    const scoreData = {
      distances: { primary_m: 450, feeder_m: 600, capacity_segment_m: 300 },
      constraints: { capacity_flag: "available", ndp_intersect: false, wayleave_intersect: false },
      nearest_substations: [{
        site_name: "Test Sub",
        site_id: "123",
        utilisation_pct: 65,
        firm_capacity_kw: 2000,
        max_demand_kw: 800,
        transformer_headroom_kw: 1200,
      }],
    };
    const m = buildRawMetrics(scoreData, 150);
    expect(m.connection.headroom_kw).toBe(1200);
    expect(m.connection.utilisation_pct).toBe(65);
    expect(m.connection.nearest_substation_distance_m).toBe(450);
    expect(m.deployment.distance_band).toBe("medium");
  });

  it("falls back to firm_capacity - max_demand when transformer_headroom_kw missing", () => {
    const scoreData = {
      distances: { primary_m: 200, feeder_m: 300, capacity_segment_m: 100 },
      constraints: {},
      nearest_substations: [{
        site_name: "Sub2",
        site_id: "456",
        utilisation_pct: 50,
        firm_capacity_kw: 3000,
        max_demand_kw: 1000,
        transformer_headroom_kw: null,
      }],
    };
    const m = buildRawMetrics(scoreData, 100);
    expect(m.connection.headroom_kw).toBe(2000); // 3000 - 1000
  });

  it("sets headroom to null when no data available", () => {
    const scoreData = {
      distances: { primary_m: 200, feeder_m: 300, capacity_segment_m: 100 },
      constraints: {},
      nearest_substations: [],
    };
    const m = buildRawMetrics(scoreData, 100);
    expect(m.connection.headroom_kw).toBeNull();
  });
});
