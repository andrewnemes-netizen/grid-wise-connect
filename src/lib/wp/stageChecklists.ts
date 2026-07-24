import type { StageKey } from "./stageStatus";

export type StageChecklistItem = { key: string; label: string };

/**
 * Stages that require one or more mandatory checklist items to be ticked
 * before they can be marked Done. Not every stage needs this — only add
 * entries for the ones that do. Each item needs a stable `key` (used to
 * store its checked state) and a `label` shown next to the checkbox.
 *
 * Example:
 *   build_quote_design: [
 *     { key: "design_reviewed", label: "Design reviewed internally" },
 *   ],
 */
export const STAGE_CHECKLISTS: Partial<Record<StageKey, StageChecklistItem[]>> = {
  build_quote_design: [
    { key: "deconflict_fp_location", label: "Deconflict Build Design FP location against PoC Application" },
    { key: "deconflict_land_ownership", label: "Deconflict Land Ownership (Build & ICP)" },
  ],
};

export function getStageChecklist(stage: StageKey): StageChecklistItem[] {
  return STAGE_CHECKLISTS[stage] ?? [];
}
