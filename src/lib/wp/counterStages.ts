import type { StageKey } from "@/lib/wp/stageStatus";
import { toIsoDate, workingDaysUntil } from "@/lib/wp/workingDays";

/**
 * Stages that display as a date + elapsed working-day counter instead of a
 * status pill or a countdown target.
 *
 * survey_po_gate: "Quote Issued" date + working days elapsed waiting for the
 * client to raise the Survey/Design PO. Open-ended — no SLA target.
 */
export const COUNTER_STAGES: Set<StageKey> = new Set(["survey_po_gate"]);

export function isCounterStage(stage: StageKey): boolean {
  return COUNTER_STAGES.has(stage);
}

/** Format a counter stage for display: "14 Jul + 6" (date + working days elapsed). */
export function formatCounterDisplay(startedAt: string | Date | null): string {
  if (!startedAt) return "Set date";
  const startDate = typeof startedAt === "string" ? new Date(startedAt) : startedAt;
  const startIso = toIsoDate(startDate);
  const elapsed = Math.max(0, -workingDaysUntil(startIso));

  const fmt = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  });
  return `${fmt.format(startDate)} + ${elapsed}`;
}
