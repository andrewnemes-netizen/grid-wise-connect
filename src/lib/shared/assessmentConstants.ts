/**
 * Shared Assessment Constants
 * 
 * Single source of truth for voltage resolution, DNO options,
 * feasibility state config, and surface split derivation.
 * Used by connectionCosts, evHub/electricalSizing, gridwise/electricalEngine,
 * and the unified AssessmentPanel.
 */

import type { FeasibilityState, DnoKey } from "../evHub/types";
import { CheckCircle, AlertTriangle, XCircle, ShieldAlert, Wrench } from "lucide-react";

// ── Voltage Resolution ──────────────────────────────────────

export type VoltageLevel = "LV" | "HV" | "EHV";
export type VoltageOverride = "Auto" | "LV" | "HV" | "EHV";

/**
 * Resolve voltage level from proposed kW.
 * 275 kVA threshold at PF 0.95 ≈ 261 kW.
 */
export function resolveVoltageLevel(proposed_kw: number, voltage_override?: VoltageOverride): VoltageLevel {
  if (voltage_override && voltage_override !== "Auto") return voltage_override;
  const kva = proposed_kw / 0.95;
  return kva <= 275 ? "LV" : proposed_kw <= 1500 ? "HV" : "EHV";
}

// ── DNO Options ─────────────────────────────────────────────

export const DNO_OPTIONS: { value: DnoKey | "auto"; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "UKPN", label: "UKPN" },
  { value: "NPG", label: "NPG" },
  { value: "ENWL", label: "ENWL" },
  { value: "NGED", label: "NGED" },
  { value: "SPEN", label: "SPEN" },
  { value: "SSEN", label: "SSEN" },
];

// ── Feasibility State Config ────────────────────────────────

export const FEASIBILITY_STATE_CONFIG: Record<FeasibilityState, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  LV_OK: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "LV Connection Feasible" },
  DNO_STUDY_REQUIRED: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "DNO Study Required" },
  ENGINEERING_REVIEW_REQUIRED: { icon: ShieldAlert, color: "text-orange-600", bg: "bg-orange-50 border-orange-200", label: "Engineering Review Required" },
  LV_REINFORCEMENT_REQUIRED: { icon: Wrench, color: "text-amber-700", bg: "bg-amber-50 border-amber-200", label: "LV Reinforcement Required" },
  HV_CONNECTION_REQUIRED: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "HV Connection Required" },
};

export const SCORE_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  GREEN: { icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "Viable" },
  AMBER: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Possible" },
  RED: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Challenging" },
};

export const BAND_CONFIG: Record<string, { color: string; bg: string }> = {
  GREEN: { color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  AMBER: { color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  RED: { color: "text-red-600", bg: "bg-red-50 border-red-200" },
};

// ── Surface Split ───────────────────────────────────────────

export interface SurfaceSplit {
  footway_pct: number;
  carriageway_pct: number;
  verge_pct: number;
}

export const DEFAULT_SURFACE_SPLIT: SurfaceSplit = {
  footway_pct: 0.6,
  carriageway_pct: 0.3,
  verge_pct: 0.1,
};

export function deriveSurfaceSplit(constraints?: {
  min_footway_m?: number | null;
  min_carriageway_m?: number | null;
}): SurfaceSplit {
  if (!constraints?.min_footway_m || !constraints?.min_carriageway_m) {
    return DEFAULT_SURFACE_SPLIT;
  }
  const fw = constraints.min_footway_m;
  const cw = constraints.min_carriageway_m;
  const total = fw + cw;
  if (total <= 0) return DEFAULT_SURFACE_SPLIT;
  const verge = 0.1;
  const remaining = 0.9;
  return {
    footway_pct: Math.round((fw / total) * remaining * 100) / 100,
    carriageway_pct: Math.round((cw / total) * remaining * 100) / 100,
    verge_pct: verge,
  };
}

// ── Haversine Distance ──────────────────────────────────────

/** Haversine distance in metres between two [lng, lat] points */
export function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ── Shared UI Components ────────────────────────────────────

export const OPTION_LETTERS = "ABCDEFGHIJ";
