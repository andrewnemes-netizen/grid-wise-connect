import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { addWorkingDays, toIsoDate } from "@/lib/wp/workingDays";
import type { StageKey } from "@/lib/wp/stageStatus";

export function WaitingStageDelayDialog({
  wpId, siteId, stage, currentTargetDate, onClose, onSaved,
}: {
  wpId: string;
  siteId: string;
  stage: StageKey;
  currentTargetDate: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaultNewDate = currentTargetDate
    ? toIsoDate(addWorkingDays(new Date(currentTargetDate + "T00:00:00"), 5))
    : toIsoDate(addWorkingDays(new Date(), 5));

  const [reason, setReason] = useState("");
  const [newDate, setNewDate] = useState(defaultNewDate);
  const [saving, setSaving] = useState(false);

  const canSave = reason.trim().length > 0 && !!newDate && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("site_stage_status").upsert(
        {
          work_package_id: wpId,
          site_id: siteId,
          stage,
          wait_target_date: newDate,
          wait_delay_reason: reason.trim(),
          wait_delay_logged_at: new Date().toISOString(),
        },
        { onConflict: "site_id,stage" },
      );
      if (error) throw error;
      toast.success("Delay recorded — new expected date set");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save delay");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mark delayed</DialogTitle>
          <DialogDescription>
            Log a reason and set a new expected date. This does not complete the stage.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Reason <span className="text-destructive">*</span></span>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this delayed? (required)"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">New expected date <span className="text-destructive">*</span></span>
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </label>
          {!reason.trim() && (
            <p className="text-[11px] text-destructive">A reason is required before Delayed can be saved.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>Save delay</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}