import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CalendarDays, GitBranch, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type Props = {
  estimateId: string;
  workPackageId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
};

export function GeneratePlanDialog({ estimateId, workPackageId, open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [siteIds, setSiteIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [preview, setPreview] = useState<any | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [running, setRunning] = useState(false);

  const wpSites = useQuery({
    enabled: !!workPackageId && open,
    queryKey: ["wp-sites-picker", workPackageId],
    queryFn: async () => {
      const { data, error } = await supabase.from("wp_sites")
        .select("id, site_id, local_ref, sequence, sites(site_name, postcode)")
        .eq("work_package_id", workPackageId!)
        .order("sequence", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (wpSites.data && siteIds.length === 0) {
      setSiteIds(wpSites.data.map((s: any) => s.site_id));
    }
  }, [wpSites.data]);

  useEffect(() => {
    if (!open || !workPackageId || siteIds.length === 0) { setPreview(null); return; }
    setLoadingPreview(true);
    supabase.functions.invoke("generate-wp-plan", {
      body: { work_package_id: workPackageId, estimate_id: estimateId, site_ids: siteIds, preview: true },
    }).then(({ data, error }) => {
      if (error) toast.error(error.message);
      else setPreview(data);
    }).finally(() => setLoadingPreview(false));
  }, [open, workPackageId, estimateId, siteIds]);

  const runGenerate = async () => {
    if (!workPackageId) return;
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("generate-wp-plan", {
      body: { work_package_id: workPackageId, estimate_id: estimateId, site_ids: siteIds, mode, start_date: startDate },
    });
    setRunning(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Plan generated · ${data?.created ?? 0} new, ${data?.updated ?? 0} updated`);
    qc.invalidateQueries({ queryKey: ["wp-tasks", workPackageId] });
    qc.invalidateQueries({ queryKey: [`gantt-tasks`, workPackageId] });
    qc.invalidateQueries({ queryKey: [`gantt-deps`, workPackageId] });
    onOpenChange(false);
  };

  const totalTasks = preview?.preview?.reduce((s: number, x: any) => s + x.stages.reduce((a: number, b: any) => a + b.task_count, 0), 0) ?? 0;
  const totalDays = preview?.preview?.reduce((s: number, x: any) => s + x.stages.reduce((a: number, b: any) => a + b.total_days, 0), 0) ?? 0;

  if (!workPackageId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>Generate plan from estimate</DialogTitle></DialogHeader>
          <div className="text-sm text-muted-foreground">This estimate isn't attached to a work package. Attach it first, then generate a plan.</div>
          <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Generate project plan from estimate
          </DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Start date</Label>
              <div className="relative">
                <CalendarDays className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="pl-8" />
              </div>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Mode</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as any)} className="mt-1 space-y-1">
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="merge" id="m-merge" className="mt-1" />
                  <Label htmlFor="m-merge" className="font-normal cursor-pointer">
                    <div className="text-sm">Merge (recommended)</div>
                    <div className="text-xs text-muted-foreground">Update existing generated tasks and add new ones. Preserves manual edits.</div>
                  </Label>
                </div>
                <div className="flex items-start gap-2">
                  <RadioGroupItem value="replace" id="m-replace" className="mt-1" />
                  <Label htmlFor="m-replace" className="font-normal cursor-pointer">
                    <div className="text-sm">Replace generated</div>
                    <div className="text-xs text-muted-foreground">Delete all tasks previously generated from this estimate and rebuild.</div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div>
              <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                Sites <span className="text-[10px] normal-case tracking-normal">{siteIds.length}/{wpSites.data?.length ?? 0}</span>
              </Label>
              <div className="mt-1 border rounded-md max-h-56 overflow-auto divide-y">
                {(wpSites.data ?? []).map((s: any) => (
                  <label key={s.id} className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-muted/40 cursor-pointer">
                    <Checkbox
                      checked={siteIds.includes(s.site_id)}
                      onCheckedChange={(v) => setSiteIds((prev) => v ? [...prev, s.site_id] : prev.filter((x) => x !== s.site_id))}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{s.local_ref ? `${s.local_ref} · ` : ""}{s.sites?.site_name ?? "Site"}</div>
                      {s.sites?.postcode && <div className="text-xs text-muted-foreground">{s.sites.postcode}</div>}
                    </div>
                  </label>
                ))}
                {(wpSites.data ?? []).length === 0 && <div className="p-3 text-xs text-muted-foreground">No sites on this work package.</div>}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Preview</Label>
              {loadingPreview && <Loader2 className="h-3 w-3 animate-spin" />}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="border rounded p-2"><div className="text-xs text-muted-foreground">Sites</div><div className="text-lg font-semibold">{preview?.preview?.length ?? 0}</div></div>
              <div className="border rounded p-2"><div className="text-xs text-muted-foreground">Tasks</div><div className="text-lg font-semibold">{totalTasks}</div></div>
              <div className="border rounded p-2"><div className="text-xs text-muted-foreground">Person-days</div><div className="text-lg font-semibold">{totalDays}</div></div>
            </div>

            <div className="border rounded-md max-h-64 overflow-auto text-xs">
              {(preview?.preview ?? []).map((p: any) => (
                <div key={p.site_id} className="p-2 border-b last:border-b-0">
                  <div className="font-medium truncate">{p.site_name}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.stages.filter((s: any) => s.task_count > 0).map((s: any) => (
                      <Badge key={s.stage_code} variant="outline" className="text-[10px] font-normal">
                        {s.stage_name} · {s.task_count} × {s.total_days}d
                      </Badge>
                    ))}
                    {p.stages.every((s: any) => s.task_count === 0) && <span className="text-muted-foreground">no tasks</span>}
                  </div>
                </div>
              ))}
              {(preview?.preview ?? []).length === 0 && !loadingPreview && (
                <div className="p-3 text-muted-foreground">Pick sites to preview.</div>
              )}
            </div>

            {preview?.warnings?.length ? (
              <div className="border rounded-md p-2 bg-amber-500/5 border-amber-500/30 text-xs">
                <div className="flex items-center gap-1 text-amber-700 font-medium mb-1"><AlertTriangle className="h-3 w-3" /> {preview.warnings.length} items using 1-day fallback</div>
                <div className="text-muted-foreground max-h-20 overflow-auto">
                  {preview.warnings.slice(0, 6).map((w: any, i: number) => (
                    <div key={i} className="truncate">• {w.title} — {w.reason}</div>
                  ))}
                  {preview.warnings.length > 6 && <div>…and {preview.warnings.length - 6} more</div>}
                </div>
                <div className="text-muted-foreground mt-1">Set <b>productivity_qty_per_day</b> on rate items in the Rate Library for accurate durations.</div>
              </div>
            ) : null}

            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <GitBranch className="h-3 w-3" /> Stage-to-stage dependencies (FS) are added automatically.
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={running || siteIds.length === 0 || totalTasks === 0} onClick={runGenerate}>
            {running ? (<><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Generating…</>) : (<><Sparkles className="h-3.5 w-3.5 mr-1" />Generate {totalTasks} tasks</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}