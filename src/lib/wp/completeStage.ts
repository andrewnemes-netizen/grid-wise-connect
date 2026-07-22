import { supabase } from "@/integrations/supabase/client";
import { MULTI_RECIPIENT_STAGES, getNextStages, type StageKey, type StageStatus } from "@/lib/wp/stageStatus";
import { computeWaitTargetDate, isWaitingStage } from "@/lib/wp/waitingStages";

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

    const payload: Record<string, any> = {
      work_package_id: wpId,
      site_id: siteId,
      stage: nextKey,
      workflow_status: nextStatus,
      owner_id: isMultiNext ? null : (nextRecipientUserIds[0] ?? null),
      recipient_user_ids: nextRecipientUserIds,
      recipient_contact_ids: [],
      actual_start_date: existing?.actual_start_date ?? today,
    };
    if (isWaitingStage(nextKey)) {
      payload.wait_started_at = new Date().toISOString();
      payload.wait_target_date = computeWaitTargetDate(nextKey);
      payload.wait_delay_reason = null;
      payload.wait_delay_logged_at = null;
    }
    const { error: e2 } = await (supabase as any)
      .from("site_stage_status")
      .upsert(payload, { onConflict: "site_id,stage" });
    if (e2) throw e2;
    opened++;
  }

  return { nextStages, opened };
}

/**
 * Bulk-set a non-"done" workflow status for many sites on the same stage.
 * Preserves existing owner/recipients. Sets actual_start_date when moving
 * a not-yet-opened stage into `in_progress`.
 */
export async function bulkSetStageStatus(params: {
  wpId: string;
  siteIds: string[];
  stage: StageKey;
  status: Exclude<StageStatus, "done">;
  blockedReason?: string | null;
}): Promise<{ updated: number; failed: { siteId: string; message: string }[] }> {
  const { wpId, siteIds, stage, status, blockedReason } = params;
  const today = new Date().toISOString().slice(0, 10);
  const failed: { siteId: string; message: string }[] = [];
  let updated = 0;

  for (const siteId of siteIds) {
    try {
      const { data: existing } = await (supabase as any)
        .from("site_stage_status")
        .select("actual_start_date")
        .eq("site_id", siteId)
        .eq("stage", stage)
        .maybeSingle();

      const payload: Record<string, any> = {
        work_package_id: wpId,
        site_id: siteId,
        stage,
        workflow_status: status,
        blocked_reason: status === "blocked" ? (blockedReason ?? null) : null,
      };
      if (status === "in_progress" && !existing?.actual_start_date) {
        payload.actual_start_date = today;
      }

      const { error } = await (supabase as any)
        .from("site_stage_status")
        .upsert(payload, { onConflict: "site_id,stage" });
      if (error) throw error;
      updated++;
    } catch (e: any) {
      failed.push({ siteId, message: e?.message ?? "failed" });
    }
  }

  return { updated, failed };
}