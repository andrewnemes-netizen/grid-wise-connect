import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { STAGE_LABEL_MAP, STAGE_STATUS_LABEL, MULTI_RECIPIENT_STAGES, getNextStages, type StageKey, type StageStatus } from "@/lib/wp/stageStatus";
import { computeWaitTargetDate, isWaitingStage } from "@/lib/wp/waitingStages";
import { isCounterStage } from "@/lib/wp/counterStages";
import { RecipientPicker } from "@/components/wp/RecipientPicker";
import { getStageChecklist } from "@/lib/wp/stageChecklists";
import { Checkbox } from "@/components/ui/checkbox";

export type StageRow = {
  id: string;
  work_package_id: string;
  site_id: string;
  stage: StageKey;
  workflow_status: StageStatus;
  owner_id: string | null;
  recipient_user_ids: string[] | null;
  recipient_contact_ids: string[] | null;
  planned_start_date: string | null;
  planned_finish_date: string | null;
  actual_start_date: string | null;
  actual_finish_date: string | null;
  blocked_reason: string | null;
  review_notes: string | null;
  updated_at: string;
  updated_by: string | null;
};

export function StageDetailDialog({
  wpId, siteId, siteName, stage, row, onClose, onSaved, initialStatus,
}: {
  wpId: string;
  siteId: string;
  siteName?: string;
  stage: StageKey;
  row?: StageRow;
  onClose: () => void;
  onSaved: () => void;
  /** Override the initial workflow status shown in the dialog (e.g. from the
   *  Waiting Stage "Received" action, which opens the dialog pre-set to Done). */
  initialStatus?: StageStatus;
}) {
  const [status, setStatus] = useState<StageStatus>(
    (initialStatus ?? row?.workflow_status ?? "not_started") as StageStatus,
  );
  const [userIds, setUserIds] = useState<string[]>(
    row?.recipient_user_ids?.length ? row.recipient_user_ids : (row?.owner_id ? [row.owner_id] : [])
  );
  const [contactIds, setContactIds] = useState<string[]>(row?.recipient_contact_ids ?? []);
  const [plannedStart, setPlannedStart] = useState(row?.planned_start_date ?? "");
  const [plannedFinish, setPlannedFinish] = useState(row?.planned_finish_date ?? "");
  const [actualStart, setActualStart] = useState(row?.actual_start_date ?? "");
  const [actualFinish, setActualFinish] = useState(row?.actual_finish_date ?? "");
  const [blockedReason, setBlockedReason] = useState(row?.blocked_reason ?? "");
  const [reviewNotes, setReviewNotes] = useState(row?.review_notes ?? "");
  const [saving, setSaving] = useState(false);

  // Recipients targeting the NEXT stage(s) when marking Done.
  // Keyed by next stage key so branch points (survey_completed) can hold two.
  const [nextRecipients, setNextRecipients] = useState<Record<string, { userIds: string[]; contactIds: string[] }>>({});

  // Stage checklist (mandatory sub-tasks before Done).
  const checklist = getStageChecklist(stage);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const { data: checklistRows = [], refetch: refetchChecklist } = useQuery({
    queryKey: ["stage-checklist", siteId, stage],
    enabled: checklist.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("stage_checklist_items")
        .select("check_key,checked_at")
        .eq("site_id", siteId)
        .eq("stage", stage);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!checklist.length) return;
    const map: Record<string, boolean> = {};
    for (const r of checklistRows as any[]) {
      if (r.checked_at) map[r.check_key] = true;
    }
    setChecked(map);
  }, [checklistRows, stage]);

  const allChecklistDone = checklist.every((c) => checked[c.key]);

  useEffect(() => {
    setStatus((initialStatus ?? row?.workflow_status ?? "not_started") as StageStatus);
    setUserIds(row?.recipient_user_ids?.length ? row!.recipient_user_ids! : (row?.owner_id ? [row.owner_id] : []));
    setContactIds(row?.recipient_contact_ids ?? []);
    setPlannedStart(row?.planned_start_date ?? "");
    setPlannedFinish(row?.planned_finish_date ?? "");
    setActualStart(row?.actual_start_date ?? "");
    setActualFinish(row?.actual_finish_date ?? "");
    setBlockedReason(row?.blocked_reason ?? "");
    setReviewNotes(row?.review_notes ?? "");
    setNextRecipients({});
  }, [row?.id]);

  const { data: audit = [] } = useQuery({
    queryKey: ["stage-audit", siteId, stage],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("site_stage_status_audit")
        .select("previous_status,new_status,changed_by,changed_at,reason")
        .eq("site_id", siteId).eq("stage", stage)
        .order("changed_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const multi = MULTI_RECIPIENT_STAGES.has(stage);
  const isTerminalAction = status === "done";
  const nextStages = isTerminalAction ? getNextStages(stage) : [];
  const hasNextRecipient = nextStages.some((s) => {
    const r = nextRecipients[s];
    return (r?.userIds.length ?? 0) + (r?.contactIds.length ?? 0) > 0;
  });
  const hasRecipient = userIds.length + contactIds.length > 0;
  // For non-Done saves, use the in-place picker as before.
  // For Done, require a recipient on at least one next stage (unless terminal-with-no-next).
  const blocked = isTerminalAction
    ? (nextStages.length > 0 && !hasNextRecipient)
    : false;
  const checklistBlocked = isTerminalAction && checklist.length > 0 && !allChecklistDone;

  const toggleCheck = async (key: string, next: boolean) => {
    setChecked((prev) => ({ ...prev, [key]: next }));
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id ?? null;
      const payload: any = {
        site_id: siteId,
        work_package_id: wpId,
        stage,
        check_key: key,
        checked_at: next ? new Date().toISOString() : null,
        checked_by: next ? uid : null,
      };
      const { error } = await (supabase as any)
        .from("stage_checklist_items")
        .upsert(payload, { onConflict: "site_id,stage,check_key" });
      if (error) throw error;
      refetchChecklist();
    } catch (e: any) {
      setChecked((prev) => ({ ...prev, [key]: !next }));
      toast.error(e.message ?? "Failed to update checklist");
    }
  };

  const save = async () => {
    if (blocked) {
      toast.error("Pick who the next stage goes to before marking Done.");
      return;
    }
    if (checklistBlocked) {
      toast.error("Complete all checklist items before marking Done.");
      return;
    }
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);

      if (isTerminalAction) {
        // 1) Close current stage — clear recipients so no open task remains.
        const currentPatch = {
          work_package_id: wpId,
          site_id: siteId,
          stage,
          workflow_status: "done" as StageStatus,
          owner_id: null,
          recipient_user_ids: [],
          recipient_contact_ids: [],
          planned_start_date: plannedStart || null,
          planned_finish_date: plannedFinish || null,
          actual_start_date: actualStart || null,
          actual_finish_date: actualFinish || today,
          blocked_reason: null,
          review_notes: reviewNotes || null,
        };
        const { error: e1 } = await (supabase as any).from("site_stage_status")
          .upsert(currentPatch, { onConflict: "site_id,stage" });
        if (e1) throw e1;

        // 2) Open next stage(s) with picked recipients.
        let notified = 0;
        for (const nextKey of nextStages) {
          const r = nextRecipients[nextKey];
          const uIds = r?.userIds ?? [];
          const cIds = r?.contactIds ?? [];
          if (uIds.length + cIds.length === 0) continue;

          const { data: existing } = await (supabase as any)
            .from("site_stage_status")
            .select("workflow_status,actual_start_date")
            .eq("site_id", siteId).eq("stage", nextKey).maybeSingle();

          const isMultiNext = MULTI_RECIPIENT_STAGES.has(nextKey as StageKey);
          const nextStatus: StageStatus =
            !existing || existing.workflow_status === "not_started" ? "in_progress" : existing.workflow_status;

          const nextPatch: Record<string, any> = {
            work_package_id: wpId,
            site_id: siteId,
            stage: nextKey,
            workflow_status: nextStatus,
            owner_id: isMultiNext ? null : (uIds[0] ?? null),
            recipient_user_ids: uIds,
            recipient_contact_ids: cIds,
            actual_start_date: existing?.actual_start_date ?? today,
          };
          if (isWaitingStage(nextKey)) {
            nextPatch.wait_started_at = new Date().toISOString();
            nextPatch.wait_target_date = computeWaitTargetDate(nextKey);
            nextPatch.wait_delay_reason = null;
            nextPatch.wait_delay_logged_at = null;
          } else if (isCounterStage(nextKey)) {
            nextPatch.wait_started_at = new Date().toISOString();
            nextPatch.wait_target_date = null;
            nextPatch.wait_delay_reason = null;
            nextPatch.wait_delay_logged_at = null;
          }
          const { error: e2 } = await (supabase as any).from("site_stage_status")
            .upsert(nextPatch, { onConflict: "site_id,stage" });
          if (e2) throw e2;
          notified++;
        }
        toast.success(notified > 0 ? `Stage done · ${notified} next task${notified > 1 ? "s" : ""} opened` : "Stage marked done");
      } else {
        const patch = {
          work_package_id: wpId,
          site_id: siteId,
          stage,
          workflow_status: status,
          owner_id: multi ? null : (userIds[0] ?? null),
          recipient_user_ids: userIds,
          recipient_contact_ids: contactIds,
          planned_start_date: plannedStart || null,
          planned_finish_date: plannedFinish || null,
          actual_start_date: actualStart || null,
          actual_finish_date: actualFinish || null,
          blocked_reason: blockedReason || null,
          review_notes: reviewNotes || null,
        };
        const { error } = await (supabase as any).from("site_stage_status")
          .upsert(patch, { onConflict: "site_id,stage" });
        if (error) throw error;
        toast.success(hasRecipient ? "Stage updated · recipients notified" : "Stage updated");
      }
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle>{STAGE_LABEL_MAP[stage]} · {siteName ?? "Site"}</DialogTitle>
          <DialogDescription>Workflow status and delivery dates. All changes are recorded in the audit trail below.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Workflow status</span>
              <Select value={status} onValueChange={(v) => setStatus(v as StageStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(STAGE_STATUS_LABEL) as StageStatus[]).map((k) => (
                    <SelectItem key={k} value={k}>{STAGE_STATUS_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {isTerminalAction ? (
              nextStages.length === 0 ? (
                <div className="col-span-2 rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                  Final stage — no downstream task will be created.
                </div>
              ) : (
                <div className="col-span-2 space-y-3">
                  {nextStages.map((nk) => {
                    const isMultiNext = MULTI_RECIPIENT_STAGES.has(nk);
                    const r = nextRecipients[nk] ?? { userIds: [], contactIds: [] };
                    return (
                      <div key={nk} className="rounded-md border bg-muted/20 p-3">
                        <RecipientPicker
                          wpId={wpId}
                          multi={isMultiNext}
                          userIds={r.userIds}
                          contactIds={r.contactIds}
                          onChange={({ userIds: u, contactIds: c }) =>
                            setNextRecipients((prev) => ({ ...prev, [nk]: { userIds: u, contactIds: c } }))
                          }
                          label={`Assign next stage · ${STAGE_LABEL_MAP[nk]} — to:`}
                          requiredHint={blocked ? "Pick at least one recipient on a next stage before saving Done." : null}
                        />
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              <div className="col-span-2 rounded-md border bg-muted/20 p-3">
                <RecipientPicker
                  wpId={wpId}
                  multi={multi}
                  userIds={userIds}
                  contactIds={contactIds}
                  onChange={({ userIds: u, contactIds: c }) => { setUserIds(u); setContactIds(c); }}
                  label={multi ? "Notify who? (multiple recipients)" : "Recipients for this stage"}
                  requiredHint={null}
                />
              </div>
            )}
            {checklist.length > 0 && (
              <div className="col-span-2 rounded-md border bg-muted/20 p-3 space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Required before Done
                </div>
                {checklist.map((item) => (
                  <label key={item.key} className="flex items-start gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={!!checked[item.key]}
                      onCheckedChange={(v) => toggleCheck(item.key, !!v)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
                {checklistBlocked && (
                  <p className="text-[11px] text-destructive">
                    Tick every item above before marking this stage Done.
                  </p>
                )}
              </div>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Planned start</span>
              <Input type="date" value={plannedStart ?? ""} onChange={(e) => setPlannedStart(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Planned finish</span>
              <Input type="date" value={plannedFinish ?? ""} onChange={(e) => setPlannedFinish(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Actual start</span>
              <Input type="date" value={actualStart ?? ""} onChange={(e) => setActualStart(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Actual finish</span>
              <Input type="date" value={actualFinish ?? ""} onChange={(e) => setActualFinish(e.target.value)} />
            </label>
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Blocked reason</span>
              <Textarea rows={2} value={blockedReason ?? ""} onChange={(e) => setBlockedReason(e.target.value)} placeholder="Only set when status is Blocked" />
            </label>
            <label className="col-span-2 flex flex-col gap-1">
              <span className="text-xs text-muted-foreground">Review notes</span>
              <Textarea rows={2} value={reviewNotes ?? ""} onChange={(e) => setReviewNotes(e.target.value)} />
            </label>
          </div>

          <div className="mt-4">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Audit trail</div>
            {audit.length === 0 ? (
              <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
            ) : (
              <ul className="text-xs space-y-1 max-h-40 overflow-auto">
                {audit.map((a: any, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-muted-foreground tabular-nums shrink-0">
                      {formatDistanceToNow(new Date(a.changed_at), { addSuffix: true })}
                    </span>
                    <span>
                      <Badge variant="outline" className="text-[10px]">{a.previous_status ?? "—"}</Badge>
                      <span className="mx-1">→</span>
                      <Badge variant="outline" className="text-[10px]">{a.new_status}</Badge>
                      {a.reason && <span className="ml-2 text-muted-foreground">· {a.reason}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row items-stretch sm:items-center gap-2 px-6 py-4 border-t shrink-0 bg-background">
          {blocked && (
            <span className="text-[11px] text-destructive mr-auto">
              Select a recipient on the next stage before saving Done — they will be notified immediately.
            </span>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || blocked || checklistBlocked}>
            {isTerminalAction ? "Mark Done & Notify" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}