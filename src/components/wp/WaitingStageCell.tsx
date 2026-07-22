import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays, Check, AlertTriangle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { StageKey } from "@/lib/wp/stageStatus";
import { getWaitEscalation, WAIT_ESCALATION_CLASSES, computeWaitTargetDate } from "@/lib/wp/waitingStages";
import { WaitingStageDelayDialog } from "@/components/wp/WaitingStageDelayDialog";

export function WaitingStageCell({
  wpId, siteId, stage, targetDate, workflowStatus, delayReason, onRequestMarkDone, onSaved,
}: {
  wpId: string;
  siteId: string;
  stage: StageKey;
  targetDate: string | null;
  workflowStatus: string | null;
  delayReason: string | null;
  /** Open the standard StageDetailDialog Done flow — reuses recipient handoff */
  onRequestMarkDone: () => void;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftDate, setDraftDate] = useState(targetDate ?? "");
  const [delayOpen, setDelayOpen] = useState(false);

  // If the stage was opened without a target date (legacy row), compute one on the fly
  // for display so the cell still shows something useful. Persist on first edit.
  const effectiveDate = targetDate ?? computeWaitTargetDate(stage) ?? null;
  const escalation = getWaitEscalation(stage, effectiveDate, workflowStatus);
  const cls = WAIT_ESCALATION_CLASSES[escalation];

  const label = effectiveDate
    ? format(new Date(effectiveDate + "T00:00:00"), "d MMM")
    : "Set date";

  const saveDate = async () => {
    if (!draftDate) return;
    try {
      const { error } = await (supabase as any).from("site_stage_status").upsert(
        { work_package_id: wpId, site_id: siteId, stage, wait_target_date: draftDate },
        { onConflict: "site_id,stage" },
      );
      if (error) throw error;
      toast.success("Target date updated");
      setEditing(false);
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save date");
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "h-7 px-2 rounded border text-[10px] font-medium inline-flex items-center gap-1 w-full justify-center",
              cls,
            )}
            title={
              delayReason
                ? `Delayed: ${delayReason}`
                : escalation === "overdue"
                ? "Overdue — no offer received"
                : escalation === "warn"
                ? "Due soon"
                : escalation === "done"
                ? "Received"
                : "Awaiting offer"
            }
          >
            {escalation === "done" ? (
              <Check className="h-3 w-3" />
            ) : escalation === "overdue" ? (
              <AlertTriangle className="h-3 w-3" />
            ) : (
              <CalendarDays className="h-3 w-3" />
            )}
            <span className="tabular-nums">{label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2 space-y-1">
          {editing ? (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Target date</div>
              <Input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" onClick={saveDate} disabled={!draftDate}>Save</Button>
              </div>
            </div>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setDraftDate(effectiveDate ?? "");
                  setEditing(true);
                }}
              >
                <CalendarDays className="h-3.5 w-3.5 mr-2" /> Edit the date
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-emerald-700 hover:text-emerald-700 hover:bg-emerald-500/10"
                onClick={() => {
                  setOpen(false);
                  onRequestMarkDone();
                }}
              >
                <Check className="h-3.5 w-3.5 mr-2" /> Received
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => {
                  setOpen(false);
                  setDelayOpen(true);
                }}
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-2" /> Delayed
              </Button>
              {delayReason && (
                <div className="mt-1 border-t pt-2 text-[11px] text-muted-foreground">
                  <div className="font-medium text-destructive">Last delay</div>
                  <div className="line-clamp-3">{delayReason}</div>
                </div>
              )}
            </>
          )}
        </PopoverContent>
      </Popover>

      {delayOpen && (
        <WaitingStageDelayDialog
          wpId={wpId}
          siteId={siteId}
          stage={stage}
          currentTargetDate={effectiveDate}
          onClose={() => setDelayOpen(false)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}