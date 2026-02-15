/**
 * Client-side Viability Scoring Engine
 * Calculates viability_index, deployment_class, reinforcement_probability
 * from raw metrics returned by score-site edge function.
 */

export interface RawMetrics {
  connection: {
    nearest_substation_distance_m: number;
    headroom_kw: number;
    utilisation_pct: number;
    feeder_distance_m: number;
    capacity_flag: string;
  };
  civils: {
    constraint_count: number;
    min_footway_m: number | null;
    min_carriageway_m: number | null;
    ndp_intersect: boolean;
    wayleave_intersect: boolean;
  };
  deployment: {
    proposed_kw: number;
    capacity_vs_demand_ratio: number;
    distance_band: "close" | "medium" | "far";
  };
}

export interface ScoringWeights {
  connection: number;
  civils: number;
  deployment: number;
}

export const V2_WEIGHTS: ScoringWeights = {
  connection: 0.55,
  civils: 0.35,
  deployment: 0.10,
};

/** Normalize a value to 0-100, higher = better */
function clamp(v: number): number {
  return Math.max(0, Math.min(100, v));
}

export function connectionScore(m: RawMetrics["connection"]): number {
  // Distance score: <200m = 100, >3000m = 0
  const distScore = clamp(100 - (m.nearest_substation_distance_m / 30));
  // Headroom score: >2000kW = 100, 0 = 0
  const headroomScore = clamp((m.headroom_kw / 2000) * 100);
  // Utilisation score: <30% = 100, >95% = 0
  const utilScore = clamp((1 - m.utilisation_pct / 100) * 100);
  // Capacity flag penalty
  const capPenalty = m.capacity_flag === "constrained" ? 20 : m.capacity_flag === "limited" ? 10 : 0;

  return clamp((distScore * 0.3 + headroomScore * 0.35 + utilScore * 0.35) - capPenalty);
}

export function civilsScore(m: RawMetrics["civils"]): number {
  let score = 100;
  // Constraints reduce score
  score -= m.constraint_count * 15;
  // NDP intersection is a big hit
  if (m.ndp_intersect) score -= 25;
  // Wayleave
  if (m.wayleave_intersect) score -= 15;
  // Narrow footway penalty
  if (m.min_footway_m !== null && m.min_footway_m < 1.5) score -= 20;
  // Narrow carriageway penalty
  if (m.min_carriageway_m !== null && m.min_carriageway_m < 5.5) score -= 10;
  return clamp(score);
}

export function deploymentScore(m: RawMetrics["deployment"]): number {
  // capacity_vs_demand_ratio: >2 = great, <0.5 = bad
  const ratioScore = clamp(m.capacity_vs_demand_ratio * 50);
  const bandScore = m.distance_band === "close" ? 100 : m.distance_band === "medium" ? 60 : 20;
  return clamp(ratioScore * 0.6 + bandScore * 0.4);
}

export function calculateViabilityIndex(
  metrics: RawMetrics,
  weights: ScoringWeights = V2_WEIGHTS
): number {
  const conn = connectionScore(metrics.connection);
  const civ = civilsScore(metrics.civils);
  const dep = deploymentScore(metrics.deployment);
  return Math.round(conn * weights.connection + civ * weights.civils + dep * weights.deployment);
}

export type ViabilityBand = "GREEN" | "AMBER" | "RED";

export function getViabilityBand(index: number): ViabilityBand {
  if (index >= 65) return "GREEN";
  if (index >= 40) return "AMBER";
  return "RED";
}

export type DeploymentClass = "Fast Deploy" | "Needs Reinforcement" | "Complex";

export function getDeploymentClass(metrics: RawMetrics): DeploymentClass {
  const { connection, civils } = metrics;
  if (
    connection.headroom_kw >= metrics.deployment.proposed_kw &&
    connection.utilisation_pct < 70 &&
    civils.constraint_count === 0 &&
    !civils.ndp_intersect
  ) {
    return "Fast Deploy";
  }
  if (
    connection.headroom_kw < metrics.deployment.proposed_kw ||
    connection.utilisation_pct >= 90
  ) {
    return "Needs Reinforcement";
  }
  return "Complex";
}

export type GridReadiness = "Strong" | "Moderate" | "Constrained";

export function getGridReadiness(metrics: RawMetrics): GridReadiness {
  const util = metrics.connection.utilisation_pct;
  const headroom = metrics.connection.headroom_kw;
  const proposed = metrics.deployment.proposed_kw;
  if (util < 60 && headroom >= proposed * 1.5) return "Strong";
  if (util < 85 && headroom >= proposed * 0.5) return "Moderate";
  return "Constrained";
}

export type DeploymentFriction = "Low" | "Medium" | "High";

export function getDeploymentFriction(metrics: RawMetrics): DeploymentFriction {
  const civScore = civilsScore(metrics.civils);
  if (civScore >= 70) return "Low";
  if (civScore >= 40) return "Medium";
  return "High";
}

export function getRecommendedScale(proposed_kw: number): string {
  if (proposed_kw <= 50) return "Destination (≤50kW)";
  if (proposed_kw <= 150) return "Rapid (50–150kW)";
  return "Hub (>150kW)";
}

export function getRecommendedVoltage(proposed_kw: number): string {
  if (proposed_kw <= 100) return "LV";
  if (proposed_kw <= 1000) return "HV";
  return "EHV";
}

export function getReinforcementProbability(metrics: RawMetrics): number {
  const { connection, deployment } = metrics;
  const ratio = connection.headroom_kw / Math.max(deployment.proposed_kw, 1);
  if (ratio >= 2) return 10;
  if (ratio >= 1.5) return 25;
  if (ratio >= 1) return 45;
  if (ratio >= 0.5) return 70;
  return 90;
}

export function getCostBand(totalEstimate: number): "£" | "££" | "£££" {
  if (totalEstimate < 80000) return "£";
  if (totalEstimate < 250000) return "££";
  return "£££";
}

export function getFeederConstraintRisk(metrics: RawMetrics): "Low" | "Medium" | "High" {
  const util = metrics.connection.utilisation_pct;
  if (util < 50) return "Low";
  if (util < 80) return "Medium";
  return "High";
}

/** Build RawMetrics from score-site response for client scoring */
export function buildRawMetrics(scoreData: any, proposedKw: number): RawMetrics {
  const distances = scoreData.distances || {};
  const constraints = scoreData.constraints || {};
  const nearestSub = scoreData.nearest_substations?.[0];

  const headroom = nearestSub?.transformer_headroom_kw ?? 0;
  const utilisation = nearestSub?.utilisation_pct ?? 50;
  const primaryDist = distances.primary_m ?? 9999;
  const feederDist = distances.feeder_m ?? 9999;

  const distanceBand: "close" | "medium" | "far" =
    primaryDist < 250 ? "close" : primaryDist <= 750 ? "medium" : "far";

  return {
    connection: {
      nearest_substation_distance_m: primaryDist,
      headroom_kw: headroom,
      utilisation_pct: utilisation,
      feeder_distance_m: feederDist,
      capacity_flag: constraints.capacity_flag || "unknown",
    },
    civils: {
      constraint_count: (constraints.ndp_intersect ? 1 : 0) + (constraints.wayleave_intersect ? 1 : 0),
      min_footway_m: constraints.min_footway_m ?? null,
      min_carriageway_m: constraints.min_carriageway_m ?? null,
      ndp_intersect: constraints.ndp_intersect || false,
      wayleave_intersect: constraints.wayleave_intersect || false,
    },
    deployment: {
      proposed_kw: proposedKw,
      capacity_vs_demand_ratio: proposedKw > 0 ? headroom / proposedKw : 99,
      distance_band: distanceBand,
    },
  };
}
