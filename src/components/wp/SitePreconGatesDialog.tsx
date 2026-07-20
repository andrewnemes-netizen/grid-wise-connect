import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, MinusCircle, RotateCcw } from "lucide-react";
import { useState, useEffect } from "react";

type GateKey = "poc" | "commercial" | "design_ev" | "design_icp" | "rams" | "final_review";
type GateState = "open" | "passed" | "waived";

const GATES: { key: GateKey; label: string; hint: string }[] = [
  { key: "poc",          label: "POC",           hint: "Point of Connection application" },
  { key: "commercial",   label: "Commercial",    hint: "Client accepted estimate/quotation" },
  { key: "design_ev",    label: "EV Design",     hint: "EV design submission approved" },
  { key: "design_icp",   label: "ICP Design",    hint: "ICP design submission approved" },
  { key: "rams",         label: "RAMS",          hint: "RAMS pack approved" },
  { key: "final_review", label: "Final Review",  hint: "Ready-for-delivery gate — releases project tasks" },
];

function stateBadge(s?: GateState | null) {
  if (s === "passed") return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30" variant="outline">Passed</Badge>;
  if (s === "waived") return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30" variant="outline">Waived</Badge>;
  return <Badge variant="outline">Open</Badge>;
}

export function SitePreconGatesDialog({
  open, onOpenChange, workPackageId, siteId, siteName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workPackageId: string;
  siteId: string;
  siteName?: string;
}) {
  const qc = useQueryClient();
  const [notesByGate, setNotesByGate] = useState<Record<string, string>>({});

  const { data: gates = [], isLoading } = useQuery({
    queryKey: ["site-precon-gates", workPackageId, siteId],
    enabled: open && !!workPackageId && !!siteId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("site_precon_gates")
        .select("*")
        .eq("work_package_id", workPackageId)
        .eq("site_id", siteId);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!open) setNotesByGate({});
  }, [open]);

  const byKey = new Map<string, any>((gates as any[]).map((g) => [g.gate_key, g]));

  const setGate = useMutation({
    mutationFn: async ({ gate_key, state }: { gate_key: GateKey; state: GateState }) => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id ?? null;
      const row = {
        work_package_id: workPackageId,
        site_id: siteId,
        gate_key,
        state,
        notes: notesByGate[gate_key] || null,
        passed_at: state === "passed" ? new Date().toISOString() : null,
        passed_by: state === "passed" ? uid : null,
      };
      const { error } = await (supabase as any)
        .from("site_precon_gates")
        .upsert(row, { onConflict: "work_package_id,site_id,gate_key" });
      if (error) throw error;
      await (supabase as any).from("audit_log").insert({
        action: `precon.gate.${state}`,
        site_id: siteId,
        meta_json: { work_package_id: workPackageId, gate_key, notes: row.notes },
      });
    },
    onSuccess: () => {
      toast.success("Gate updated");
      qc.invalidateQueries({ queryKey: ["site-precon-gates", workPackageId, siteId] });
      qc.invalidateQueries({ queryKey: ["wp-site-precon-status", workPackageId] });
      qc.invalidateQueries({ queryKey: ["wp-precon-gates-all", workPackageId] });
      qc.invalidateQueries({ queryKey: ["wp-site-stage-summary", workPackageId] });
      qc.invalidateQueries({ queryKey: ["wp-site-register", workPackageId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to update gate"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pre-construction gates — {siteName ?? "site"}</DialogTitle>
          <DialogDescription>
            Gates are normally passed automatically when the underlying record (offer, estimate, design, RAMS)
            is approved. Use this panel to record manual passes, waivers or to reopen a gate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading gates…</div>
          ) : GATES.map((g) => {
            const row = byKey.get(g.key);
            const state: GateState = (row?.state as GateState) ?? "open";
            return (
              <div key={g.key} className="border rounded-md p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{g.label}</div>
                    <div className="text-xs text-muted-foreground">{g.hint}</div>
                  </div>
                  {stateBadge(state)}
                </div>
                {row?.passed_at && (
                  <div className="text-[11px] text-muted-foreground">
                    Passed {new Date(row.passed_at).toLocaleString()}
                  </div>
                )}
                <div className="grid gap-2">
                  <Label className="text-xs">Note / evidence (optional)</Label>
                  <Textarea
                    rows={2}
                    defaultValue={row?.notes ?? ""}
                    onChange={(e) => setNotesByGate((s) => ({ ...s, [g.key]: e.target.value }))}
                    placeholder="e.g. approval reference, signed-off by, waiver reason"
                  />
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    size="sm"
                    variant={state === "passed" ? "default" : "outline"}
                    disabled={setGate.isPending}
                    onClick={() => setGate.mutate({ gate_key: g.key, state: "passed" })}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Pass
                  </Button>
                  <Button
                    size="sm"
                    variant={state === "waived" ? "default" : "outline"}
                    disabled={setGate.isPending}
                    onClick={() => setGate.mutate({ gate_key: g.key, state: "waived" })}
                  >
                    <MinusCircle className="h-3.5 w-3.5 mr-1" /> Waive
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={setGate.isPending || state === "open"}
                    onClick={() => setGate.mutate({ gate_key: g.key, state: "open" })}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reopen
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}