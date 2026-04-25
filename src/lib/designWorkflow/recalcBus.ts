/**
 * recalcBus — single debounced trigger that fans design-mode changes out
 * to the existing engines (DNO rules, electrical, commercial). Lives entirely
 * in the browser; no new server logic.
 *
 * The bus listens to the events that `useDesignMode` already emits
 * (`design:element-dragend`, etc.) plus a couple of explicit triggers from
 * higher-level UI. Subscribers receive a single coalesced "tick" 350 ms after
 * the last change.
 */

export type RecalcReason =
  | "element_added"
  | "element_moved"
  | "element_removed"
  | "cable_added"
  | "cable_removed"
  | "cable_edited"
  | "scenario_changed"
  | "manual";

export interface RecalcTick {
  reason: RecalcReason;
  at: number;
}

const DEBOUNCE_MS = 350;

type Listener = (tick: RecalcTick) => void;

const listeners = new Set<Listener>();
let timer: ReturnType<typeof setTimeout> | null = null;
let pendingReason: RecalcReason = "manual";

function flush() {
  timer = null;
  const tick: RecalcTick = { reason: pendingReason, at: Date.now() };
  listeners.forEach((fn) => {
    try { fn(tick); } catch (e) { console.warn("recalcBus listener failed", e); }
  });
}

export function triggerRecalc(reason: RecalcReason) {
  pendingReason = reason;
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
}

export function subscribeRecalc(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * Wire up the existing `design:*` window events emitted by `useDesignMode`
 * so any change to placed elements automatically schedules a recalc tick.
 * Idempotent — safe to call once at app start.
 */
let wired = false;
export function wireDesignEvents() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("design:element-dragend", () => triggerRecalc("element_moved"));
  window.addEventListener("design:cable-added", () => triggerRecalc("cable_added"));
  window.addEventListener("design:cable-removed", () => triggerRecalc("cable_removed"));
  window.addEventListener("design:cable-edited", () => triggerRecalc("cable_edited"));
  window.addEventListener("design:element-added", () => triggerRecalc("element_added"));
  window.addEventListener("design:element-removed", () => triggerRecalc("element_removed"));
}