import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { STAGE_LABEL_MAP, getNextStages, type StageKey } from "@/lib/wp/stageStatus";
import { RecipientPicker } from "@/components/wp/RecipientPicker";
import { supabase } from "@/integrations/supabase/client";

export type BulkSite = { site_id: string; site_name: string };

export function BulkStageDoneDialog({
  wpId,
  stage,
  sites,
  onClose,
  onSaved,
}: {
  wpId: string;
  stage: StageKey;
  sites: BulkSite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [userIds, setUserIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; failed: string[] }>({ done: 0, failed: [] });

  // Resolve per-site next stages (all use the same current stage, so branching
  // is identical — but this is here so it stays correct if inputs ever differ).
  const nextStageGroups = useMemo(() => {
    const next = getNextStages(stage);
    const groups = new Map<StageKey, number>();
    next.forEach((k) => groups.set(k, sites.length));
    return groups;
  }, [stage, sites.length]);

  const hasRecipient = userIds.length > 0;
  const hasNext = getNextStages(stage).length > 0;
  const blocked = hasNext && !hasRecipient;

  const save = async () => {
    if (blocked) {
      toast.error("Pick who the next stage goes to before marking Done.");
      return;
    }
    setSaving(true);
    setProgress({ done: 0, failed: [] });
    try {
      const { data, error } = await (supabase as any).rpc(
        "bulk_complete_stage_and_assign_next",
        {
          p_wp_id: wpId,
          p_site_ids: sites.map((s) => s.site_id),
          p_stage: stage,
          p_next_recipient_user_ids: userIds,
        },
      );
      if (error) throw error;
      const processed = (data as any)?.processed ?? sites.length;
      setProgress({ done: processed, failed: [] });
      toast.success(
        `Marked ${processed} site${processed === 1 ? "" : "s"} Done · 1 notification sent per recipient`,
      );
      onSaved();
      onClose();
    } catch (e: any) {
      setProgress({ done: 0, failed: [e?.message ?? "Bulk update failed"] });
      toast.error(e?.message ?? "Bulk update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0">
          <DialogTitle>Bulk Mark Done · {STAGE_LABEL_MAP[stage]}</DialogTitle>
          <DialogDescription>
            {sites.length} site{sites.length === 1 ? "" : "s"} will be marked Done. Pick one recipient — they will be
            assigned as the owner of the next stage for every site in the batch.
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

          {hasNext ? (
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Next stage{nextStageGroups.size > 1 ? "s" : ""}:{" "}
                {Array.from(nextStageGroups.entries())
                  .map(([k, n]) => `${STAGE_LABEL_MAP[k]} (${n})`)
                  .join(" · ")}
              </div>
              <div className="rounded-md border bg-muted/20 p-3">
                <RecipientPicker
                  wpId={wpId}
                  multi={false}
                  userIds={userIds}
                  contactIds={[]}
                  onChange={({ userIds: u }) => setUserIds(u)}
                  label="Assign next stage to:"
                  requiredHint={blocked ? "Pick a recipient before saving." : null}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
              Final stage — no downstream task will be created.
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
          {blocked && (
            <span className="text-[11px] text-destructive mr-auto">
              Select a recipient before bulk-saving Done — they will be notified for each site.
            </span>
          )}
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || blocked}>
            {saving ? `Saving ${progress.done}/${sites.length}…` : `Mark ${sites.length} Done & Notify`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}