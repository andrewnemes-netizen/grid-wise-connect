export type StageKey =
  | "survey" | "design" | "dno" | "permit"
  | "civils" | "electrical" | "meter" | "handover";

export type StageStatus = "not_started" | "in_progress" | "review" | "blocked" | "done";

export const STAGES: { key: StageKey; label: string }[] = [
  { key: "survey",     label: "Survey" },
  { key: "design",     label: "Design" },
  { key: "dno",        label: "DNO" },
  { key: "permit",     label: "Permit" },
  { key: "civils",     label: "Civils" },
  { key: "electrical", label: "Electrical" },
  { key: "meter",      label: "Meter" },
  { key: "handover",   label: "Handover" },
];

export const STAGE_LABEL_MAP: Record<StageKey, string> =
  STAGES.reduce((acc, s) => ({ ...acc, [s.key]: s.label }), {} as Record<StageKey, string>);

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  review:      "Review",
  blocked:     "Blocked",
  done:        "Done",
};

export const STAGE_STATUS_COLORS: Record<StageStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/15 text-primary border-primary/30",
  review:      "bg-amber-500/15 text-amber-700 border-amber-500/30",
  blocked:     "bg-destructive/15 text-destructive border-destructive/30",
  done:        "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
};

export const isCompleteStatus = (s: StageStatus | string | null | undefined) => s === "done";

/** Summary for a set of stage rows for a single site */
export function summariseSiteStages(rows: { stage: StageKey; workflow_status: StageStatus }[]) {
  const byStage = new Map<StageKey, StageStatus>();
  rows.forEach((r) => byStage.set(r.stage, r.workflow_status));
  let done = 0, blocked = 0, live = 0;
  let currentStage: StageKey | null = null;
  for (const s of STAGES) {
    const v = (byStage.get(s.key) ?? "not_started") as StageStatus;
    if (v === "done") done += 1;
    else if (v === "blocked") { blocked += 1; if (!currentStage) currentStage = s.key; }
    else if (v === "in_progress" || v === "review") { live += 1; if (!currentStage) currentStage = s.key; }
  }
  if (!currentStage) {
    // First not-started stage after all done, else last stage
    const firstOpen = STAGES.find((s) => (byStage.get(s.key) ?? "not_started") !== "done");
    currentStage = firstOpen?.key ?? STAGES[STAGES.length - 1].key;
  }
  const currentStatus = (byStage.get(currentStage) ?? "not_started") as StageStatus;
  return {
    total: STAGES.length,
    done, blocked, live,
    currentStage,
    currentStageLabel: STAGE_LABEL_MAP[currentStage],
    currentStatus,
    currentStatusLabel: STAGE_STATUS_LABEL[currentStatus],
  };
}