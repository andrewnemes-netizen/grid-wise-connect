import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { STAGE_LABEL_MAP, STAGE_STATUS_LABEL, type StageKey, type StageStatus } from "@/lib/wp/stageStatus";
import { bulkSetStageStatus } from "@/lib/wp/completeStage";
import type { BulkSite } from "@/components/wp/BulkStageDoneDialog";

export function BulkStageStatusDialog({
  wpId,
  stage,
  status,
  sites,
  onClose,
  onSaved,
}: {
  wpId: string;
  stage: StageKey;
  status: Exclude<StageStatus, "done">;
  sites: BulkSite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [reason, setReason] = useState("");
  const [progress, setProgress] = useState<{ done: number; failed: string[] }>({ done: 0, failed: [] });

  const requiresReason = status === "blocked";
  const blocked = requiresReason && reason.trim().length === 0;

  const save = async () => {
    if (blocked) {
      toast.error("Enter a reason before marking Blocked.");
      return;
    }
    setSaving(true);
    const res = await bulkSetStageStatus({
      wpId,
      siteIds: sites.map((s) => s.site_id),
      stage,
      status,
      blockedReason: requiresReason ? reason.trim() : null,
    });
    setProgress({
      done: res.updated,
      failed: res.failed.map((f) => {
        const name = sites.find((s) => s.site_id === f.siteId)?.site_name ?? f.siteId.slice(0, 6);
        return `${name}: ${f.message}`;
      }),
    });
    setSaving(false);
    if (res.failed.length === 0) {
      toast.success(`Updated ${res.updated} site${res.updated === 1 ? "" : "s"} → ${STAGE_STATUS_LABEL[status]}`);
      onSaved();
      onClose();
    } else {
      toast.error(`${res.updated} succeeded · ${res.failed.length} failed`);
      onSaved();
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle>
            Bulk set → {STAGE_STATUS_LABEL[status]} · {STAGE_LABEL_MAP[stage]}
          </DialogTitle>
          <DialogDescription>
            {sites.length} site{sites.length === 1 ? "" : "s"} will be updated. Owners and recipients are preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div>
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Sites in this batch
            </div>
            <ul className="text-xs space-y-1 max-h-40 overflow-auto rounded-md border bg-muted/20 p-2">
              {sites.map((s) => (
                <li key={s.site_id} className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">Site</Badge>
                  <span className="truncate">{s.site_name}</span>
                </li>
              ))}
            </ul>
          </div>

          {requiresReason && (
            <div>
              <label className="text-xs font-medium">Blocked reason <span className="text-destructive">*</span></label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are these sites blocked?"
                className="mt-1"
                rows={3}
              />
            </div>
          )}

          {(progress.done > 0 || progress.failed.length > 0) && (
            <div className="text-xs">
              <div>Processed {progress.done}/{sites.length}</div>
              {progress.failed.length > 0 && (
                <ul className="mt-1 text-destructive space-y-0.5">
                  {progress.failed.map((f, i) => <li key={i}>• {f}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row items-stretch sm:items-center gap-2 px-6 py-4 border-t shrink-0 bg-background">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || blocked}>
            {saving ? `Saving…` : `Apply to ${sites.length} site${sites.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}