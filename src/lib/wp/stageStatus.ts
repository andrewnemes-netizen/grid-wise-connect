export type StageKey =
  | "intake" | "poc_application" | "poc_offer_awaiting" | "poc_quote"
  | "client_site_selection" | "issue_survey_design_quote" | "survey_po_gate"
  | "survey_allocation" | "survey_completed"
  | "build_design_po_gate" | "build_quote_design" | "build_quote_sent" | "build_handover_gate"
  | "icp_po" | "connections_handover_gate"
  // legacy — hidden from the new pipeline but retained so old rows don't blow up TS
  | "poc_quote_review" | "poc_quote_sent"
  | "survey" | "design" | "dno" | "permit" | "civils" | "electrical" | "meter" | "handover";

export type StageStatus = "not_started" | "in_progress" | "review" | "blocked" | "done";

export type StageTrack = "common" | "build" | "connections";

export const STAGES: { key: StageKey; label: string; track: StageTrack; multiRecipient?: boolean }[] = [
  { key: "intake",                    label: "Intake",                track: "common" },
  { key: "poc_application",           label: "PoC Application",       track: "common" },
  { key: "poc_offer_awaiting",        label: "PoC Offer Due",         track: "common" },
  { key: "poc_quote",                 label: "PoC Quote",             track: "common" },
  { key: "client_site_selection",     label: "Client Site Selection", track: "common" },
  { key: "issue_survey_design_quote", label: "Issue Survey / Design Quote", track: "common" },
  { key: "survey_po_gate",            label: "Survey PO Gate",        track: "common" },
  { key: "survey_allocation",         label: "Survey Allocation",     track: "common" },
  { key: "survey_completed",          label: "Survey Completed",      track: "common" },
  { key: "build_design_po_gate",      label: "Build Design PO Gate",  track: "build" },
  { key: "build_quote_design",        label: "Build Quote & Design",  track: "build" },
  { key: "build_quote_sent",          label: "Build Quote Sent",      track: "build" },
  { key: "build_handover_gate",       label: "Build Handover Gate",   track: "build", multiRecipient: true },
  { key: "icp_po",                    label: "ICP PO",                track: "connections" },
  { key: "connections_handover_gate", label: "Connections Handover",  track: "connections", multiRecipient: true },
];

export const MULTI_RECIPIENT_STAGES = new Set<StageKey>(
  STAGES.filter((s) => s.multiRecipient).map((s) => s.key),
);

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
  in_progress: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  review:      "bg-amber-500/15 text-amber-700 border-amber-500/30",
  blocked:     "bg-destructive/15 text-destructive border-destructive/30",
  done:        "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
};

export const isCompleteStatus = (s: StageStatus | string | null | undefined) => s === "done";

/** Return the next stage(s) after the given stage, honouring track branching. */
export function getNextStages(stage: StageKey): StageKey[] {
  // Branch point: survey_completed opens both Build and Connections tracks.
  if (stage === "survey_completed") return ["build_design_po_gate", "icp_po"];
  // Terminals
  if (stage === "build_handover_gate" || stage === "connections_handover_gate") return [];
  const current = STAGES.find((s) => s.key === stage);
  if (!current) return [];
  // Within same track, next stage
  const sameTrack = STAGES.filter((s) => s.track === current.track);
  const idx = sameTrack.findIndex((s) => s.key === stage);
  if (idx >= 0 && idx < sameTrack.length - 1) return [sameTrack[idx + 1].key];
  return [];
}

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