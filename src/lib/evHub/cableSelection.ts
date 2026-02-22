/**
 * Module C: Candidate LV Cable Selection Framework
 * Structure only — scoring weights pulled from rule set
 */
import type { CableSelectionResult, CandidatePoC, EvHubRules, LinkageTier, ConfidenceLevel } from "./types";

export interface CableCandidate {
  cable_segment_id: string;
  distance_m: number;
  capacity_headroom_pct: number | null;
  age_years: number | null;
  accessibility_score: number | null;
}

interface ScoringWeights {
  distance: number;
  capacity: number;
  age: number;
  accessibility: number;
}

function getWeights(rules: EvHubRules): ScoringWeights {
  const w = rules.cable_scoring_weights?.value as ScoringWeights | null;
  return w ?? { distance: 0.4, capacity: 0.3, age: 0.15, accessibility: 0.15 };
}

function determineTier(distance_m: number): LinkageTier {
  if (distance_m <= 50) return "TIER1";
  if (distance_m <= 150) return "TIER2";
  return "TIER3";
}

function determineConfidence(candidate: CableCandidate): ConfidenceLevel {
  if (candidate.capacity_headroom_pct == null || candidate.age_years == null) return "LOW";
  if (candidate.capacity_headroom_pct > 30 && candidate.distance_m < 100) return "HIGH";
  return "MEDIUM";
}

function scoreCandidate(c: CableCandidate, weights: ScoringWeights): number {
  const distScore = Math.max(0, 1 - c.distance_m / 500);
  const capScore = c.capacity_headroom_pct != null ? c.capacity_headroom_pct / 100 : 0;
  const ageScore = c.age_years != null ? Math.max(0, 1 - c.age_years / 50) : 0;
  const accScore = c.accessibility_score ?? 0.5;

  return (
    distScore * weights.distance +
    capScore * weights.capacity +
    ageScore * weights.age +
    accScore * weights.accessibility
  );
}

export function selectCandidateCable(
  candidates: CableCandidate[],
  rules: EvHubRules
): CableSelectionResult {
  if (candidates.length === 0) {
    return {
      candidate_poc: null,
      alternatives: [],
      warnings: ["NO_LV_CABLES_IN_RANGE"],
    };
  }

  const weights = getWeights(rules);

  const scored: CandidatePoC[] = candidates.map((c) => ({
    cable_segment_id: c.cable_segment_id,
    linkage_tier: determineTier(c.distance_m),
    score: Math.round(scoreCandidate(c, weights) * 100) / 100,
    confidence: determineConfidence(c),
    reason_codes: [
      ...(c.capacity_headroom_pct == null ? ["CAPACITY_DATA_MISSING"] : []),
      ...(c.age_years == null ? ["AGE_DATA_MISSING"] : []),
    ],
  }));

  scored.sort((a, b) => b.score - a.score);

  const warnings: string[] = [];
  if (scored[0].confidence === "LOW") warnings.push("BEST_CANDIDATE_LOW_CONFIDENCE");

  return {
    candidate_poc: scored[0],
    alternatives: scored.slice(1),
    warnings,
  };
}
