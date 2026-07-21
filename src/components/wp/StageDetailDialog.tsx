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
import { STAGE_LABEL_MAP, STAGE_STATUS_LABEL, MULTI_RECIPIENT_STAGES, type StageKey, type StageStatus } from "@/lib/wp/stageStatus";
import { RecipientPicker } from "@/components/wp/RecipientPicker";

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
  wpId, siteId, siteName, stage, row, onClose, onSaved,
}: {
  wpId: string;
  siteId: string;
  siteName?: string;
  stage: StageKey;
  row?: StageRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<StageStatus>((row?.workflow_status ?? "not_started") as StageStatus);
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

  useEffect(() => {
    setStatus((row?.workflow_status ?? "not_started") as StageStatus);
    setUserIds(row?.recipient_user_ids?.length ? row!.recipient_user_ids! : (row?.owner_id ? [row.owner_id] : []));
    setContactIds(row?.recipient_contact_ids ?? []);
    setPlannedStart(row?.planned_start_date ?? "");
    setPlannedFinish(row?.planned_finish_date ?? "");
    setActualStart(row?.actual_start_date ?? "");
    setActualFinish(row?.actual_finish_date ?? "");
    setBlockedReason(row?.blocked_reason ?? "");
    setReviewNotes(row?.review_notes ?? "");
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
  const hasRecipient = userIds.length + contactIds.length > 0;
  const isTerminalAction = status === "done";
  const blocked = isTerminalAction && !hasRecipient;

  const save = async () => {
    if (blocked) {
      toast.error("Pick who this stage goes to next before marking Done.");
      return;
    }
    setSaving(true);
    try {
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
            <div className="col-span-2 rounded-md border bg-muted/20 p-3">
              <RecipientPicker
                wpId={wpId}
                multi={multi}
                userIds={userIds}
                contactIds={contactIds}
                onChange={({ userIds: u, contactIds: c }) => { setUserIds(u); setContactIds(c); }}
                label={multi ? "Notify who? (multiple recipients)" : "Who does this stage go to next?"}
                requiredHint={blocked ? "Marking Done requires at least one recipient — they will be notified immediately on save." : null}
              />
            </div>
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
              Select a recipient before saving Done — they will be notified immediately.
            </span>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving || blocked}>
            {isTerminalAction ? "Mark Done & Notify" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}