import type { StageKey } from "@/lib/wp/stageStatus";
import { addWorkingDays, toIsoDate, workingDaysUntil } from "@/lib/wp/workingDays";

export type WaitingStageConfig = {
  slaWorkingDays: number;
  warnWorkingDays: number;
};

/**
 * Stages that use the "Waiting Stage" cell (date countdown + colour escalation
 * + Received/Delayed dropdown) instead of a normal status pill.
 *
 * Add new entries here to opt more stages in later — no schema change needed.
 */
export const WAITING_STAGES: Partial<Record<StageKey, WaitingStageConfig>> = {
  poc_offer_awaiting: { slaWorkingDays: 20, warnWorkingDays: 3 },
};

export function isWaitingStage(stage: StageKey): boolean {
  return !!WAITING_STAGES[stage];
}

export function getWaitingConfig(stage: StageKey): WaitingStageConfig | null {
  return WAITING_STAGES[stage] ?? null;
}

/** Target date for a waiting stage that has just started, as ISO yyyy-mm-dd. */
export function computeWaitTargetDate(stage: StageKey, from: Date = new Date()): string | null {
  const cfg = getWaitingConfig(stage);
  if (!cfg) return null;
  return toIsoDate(addWorkingDays(from, cfg.slaWorkingDays));
}

export type WaitEscalation = "done" | "ok" | "warn" | "overdue";

/**
 * Escalation level given a target date and current workflow status.
 * - done: stage has been marked done (Received)
 * - ok: > warn days remaining → blue
 * - warn: <= warn days remaining but not yet overdue → amber
 * - overdue: target passed → red
 */
export function getWaitEscalation(
  stage: StageKey,
  targetDate: string | null,
  workflowStatus: string | null,
): WaitEscalation {
  if (workflowStatus === "done") return "done";
  const cfg = getWaitingConfig(stage);
  if (!cfg || !targetDate) return "ok";
  const remaining = workingDaysUntil(targetDate);
  if (remaining < 0) return "overdue";
  if (remaining <= cfg.warnWorkingDays) return "warn";
  return "ok";
}

/** Tailwind classes matching the four escalation levels — reuse existing status colours. */
export const WAIT_ESCALATION_CLASSES: Record<WaitEscalation, string> = {
  done: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  ok: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  warn: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  overdue: "bg-destructive/15 text-destructive border-destructive/30",
};