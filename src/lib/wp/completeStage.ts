import { supabase } from "@/integrations/supabase/client";
import { MULTI_RECIPIENT_STAGES, getNextStages, type StageKey, type StageStatus } from "@/lib/wp/stageStatus";

/**
 * Mark a stage as Done for a single site, clear its recipients, and open the
 * next stage(s) with the provided recipient user(s). Mirrors the logic in
 * StageDetailDialog so single-site and bulk paths behave identically.
 *
 * `nextRecipientUserIds` is applied to EVERY next stage the current stage
 * branches into (branching resolved per-site via getNextStages).
 */
export async function completeStageAndAssignNext(params: {
  wpId: string;
  siteId: string;
  stage: StageKey;
  nextRecipientUserIds: string[];
}): Promise<{ nextStages: StageKey[]; opened: number }> {
  const { wpId, siteId, stage, nextRecipientUserIds } = params;
  const today = new Date().toISOString().slice(0, 10);

  // 1) Close current stage — clear recipients so no open task remains.
  const { error: e1 } = await (supabase as any).from("site_stage_status").upsert(
    {
      work_package_id: wpId,
      site_id: siteId,
      stage,
      workflow_status: "done" as StageStatus,
      owner_id: null,
      recipient_user_ids: [],
      recipient_contact_ids: [],
      actual_finish_date: today,
      blocked_reason: null,
    },
    { onConflict: "site_id,stage" },
  );
  if (e1) throw e1;

  // 2) Open next stage(s) with picked recipient(s).
  const nextStages = getNextStages(stage);
  let opened = 0;
  for (const nextKey of nextStages) {
    if (nextRecipientUserIds.length === 0) continue;

    const { data: existing } = await (supabase as any)
      .from("site_stage_status")
      .select("workflow_status,actual_start_date")
      .eq("site_id", siteId)
      .eq("stage", nextKey)
      .maybeSingle();

    const isMultiNext = MULTI_RECIPIENT_STAGES.has(nextKey);
    const nextStatus: StageStatus =
      !existing || existing.workflow_status === "not_started"
        ? "in_progress"
        : (existing.workflow_status as StageStatus);

    const { error: e2 } = await (supabase as any).from("site_stage_status").upsert(
      {
        work_package_id: wpId,
        site_id: siteId,
        stage: nextKey,
        workflow_status: nextStatus,
        owner_id: isMultiNext ? null : (nextRecipientUserIds[0] ?? null),
        recipient_user_ids: nextRecipientUserIds,
        recipient_contact_ids: [],
        actual_start_date: existing?.actual_start_date ?? today,
      },
      { onConflict: "site_id,stage" },
    );
    if (e2) throw e2;
    opened++;
  }

  return { nextStages, opened };
}