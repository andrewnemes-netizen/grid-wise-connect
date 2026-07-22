import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { StageKey } from "@/lib/wp/stageStatus";

export function CounterStageDelayDialog({
  wpId, siteId, stage, currentStartDate, onClose, onSaved,
}: {
  wpId: string;
  siteId: string;
  stage: StageKey;
  currentStartDate: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const defaultNewDate = currentStartDate || new Date().toISOString().slice(0, 10);

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
          workflow_status: "blocked",
          wait_started_at: `${newDate}T00:00:00Z`,
          wait_delay_reason: reason.trim(),
          wait_delay_logged_at: new Date().toISOString(),
        },
        { onConflict: "site_id,stage" },
      );
      if (error) throw error;
      toast.success("Delay recorded — counter reset to new quote-issued date");
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
            Log a reason and reset the quote-issued date. This does not complete the stage.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Reason <span className="text-destructive">*</span></span>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is the PO delayed? (required)"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">New quote-issued date <span className="text-destructive">*</span></span>
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
