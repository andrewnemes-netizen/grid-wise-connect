/**
 * Live Site Designer — load aggregator.
 *
 * Maps each placed equipment type to a sensible default kVA / kW figure so we
 * can show a running connected-load total in the live totals bar while the
 * user designs. If the element's `properties_json` carries an explicit `kva`
 * override, that wins.
 */

import type { DesignElement, EquipmentType } from "@/hooks/useDesignMode";

/** Default apparent power per equipment type (kVA). */
export const DEFAULT_LOAD_KVA: Record<EquipmentType, number> = {
  ev_charger: 55, // single 50 kW DC charger ≈ 55 kVA
  transformer: 500, // typical LV substation
  rmu: 0, // switchgear, no demand of its own
  feeder_pillar: 0,
  cutout: 0,
  joint: 0,
  pole: 0,
};

/**
 * Default phase-current draw for a single EVCP at 400 V three-phase, used by
 * the cable editor when the user hasn't set an explicit `needed_amps` value.
 *   I = S / (√3 · V) = 55 000 VA / (1.732 · 400 V) ≈ 79.4 A
 */
export const EVCP_DEFAULT_AMPS = 80;

/** Resolve the effective kVA for a single design element. */
export function elementKva(el: DesignElement): number {
  const override = (el.properties_json as { kva?: number } | null | undefined)?.kva;
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
    return override;
  }
  return DEFAULT_LOAD_KVA[el.element_type] ?? 0;
}

/** Sum of kVA across all elements, with a configurable diversity factor. */
export function totalConnectedKva(elements: DesignElement[], diversity = 1): number {
  const raw = elements.reduce((s, el) => s + elementKva(el), 0);
  return Math.round(raw * diversity);
}

/** Convert kVA to approximate kW assuming a 0.95 power factor. */
export function kvaToKw(kva: number, pf = 0.95): number {
  return Math.round(kva * pf);
}