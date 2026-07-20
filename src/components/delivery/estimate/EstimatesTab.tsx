import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Plus, FileText, ArrowRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EstimateEditor } from "./EstimateEditor";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

const fmt = (n: number, c = "GBP") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n || 0);

export function EstimatesTab({ scope }: { scope: { work_package_id?: string; project_id?: string } }) {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkPending, setBulkPending] = useState(false);

  const list = useQuery({
    queryKey: ["estimates-list", scope],
    queryFn: async () => {
      let q = supabase.from("estimates" as any).select("*").is("deleted_at", null).order("created_at", { ascending: false });
      if (scope.work_package_id) q = q.eq("work_package_id", scope.work_package_id);
      if (scope.project_id) q = q.eq("project_id", scope.project_id);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const archive = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("archive_entity" as any, {
        _entity_type: "estimate", _entity_id: id, _reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Estimate moved to recycle bin");
      qc.invalidateQueries({ queryKey: ["estimates-list", scope] });
      setDeleteTarget(null); setDeleteReason("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };
  const rows = list.data ?? [];
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someChecked = rows.some((r) => selected.has(r.id)) && !allChecked;
  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
  };

  const runBulkDelete = async () => {
    const ids = Array.from(selected);
    const reason = bulkReason.trim();
    if (!ids.length || !reason) return;
    setBulkPending(true);
    const failed: string[] = [];
    for (let i = 0; i < ids.length; i += 5) {
      const chunk = ids.slice(i, i + 5);
      const results = await Promise.all(
        chunk.map((id) =>
          supabase.rpc("archive_entity" as any, { _entity_type: "estimate", _entity_id: id, _reason: reason })
            .then((r: any) => ({ id, error: r.error }))
        )
      );
      for (const r of results) if (r.error) failed.push(r.id);
    }
    setBulkPending(false);
    const ok = ids.length - failed.length;
    if (ok > 0) toast.success(`${ok} estimate${ok === 1 ? "" : "s"} moved to recycle bin`);
    if (failed.length) toast.error(`${failed.length} failed to delete`);
    setSelected(new Set(failed));
    setBulkOpen(false);
    setBulkReason("");
    qc.invalidateQueries({ queryKey: ["estimates-list", scope] });
  };

  const create = useMutation({
    mutationFn: async () => {
      const n = (list.data?.length ?? 0) + 1;
      const { data, error } = await supabase.from("estimates" as any).insert({
        ...scope, name: `Estimate ${String(n).padStart(2, "0")}`,
      } as any).select("id").single();
      if (error) throw error;
      // seed default groups
      await supabase.from("estimate_groups" as any).insert([
        { estimate_id: (data as any).id, name: "Civils", sort_index: 0, color: "#0d7a5f" },
        { estimate_id: (data as any).id, name: "Electrical", sort_index: 1, color: "#c9a84c" },
      ] as any);
      return (data as any).id as string;
    },
    onSuccess: (id) => { toast.success("Estimate created"); qc.invalidateQueries({ queryKey: ["estimates-list", scope] }); setOpenId(id); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-heading text-lg">Estimates</h3>
          <p className="text-xs text-muted-foreground">BOQ-driven pricing with live totals, recipes, markup and VAT.</p>
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground pr-2">
              <Checkbox
                checked={allChecked ? true : someChecked ? "indeterminate" : false}
                onCheckedChange={(c) => toggleAll(!!c)}
              />
              Select all
            </label>
          )}
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="h-4 w-4 mr-1" /> New estimate
          </Button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-md border bg-background/95 backdrop-blur px-3 py-2 shadow-sm">
          <div className="text-sm">
            <span className="font-medium">{selected.size}</span> selected
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button size="sm" variant="destructive" onClick={() => setBulkOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" /> Delete selected
            </Button>
          </div>
        </div>
      )}

      {list.data?.length === 0 ? (
        <Card className="p-10 text-center border-dashed">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <div className="text-sm text-muted-foreground mb-4">No estimates yet.</div>
          <Button onClick={() => create.mutate()}><Plus className="h-4 w-4 mr-1" /> Create first estimate</Button>
        </Card>
      ) : (
        <div className="grid gap-2">
          {list.data?.map((e) => (
            <Card key={e.id} className="p-4 hover:shadow-panel transition-shadow cursor-pointer" onClick={() => setOpenId(e.id)}>
              <div className="flex items-center gap-4">
                <div onClick={(ev) => ev.stopPropagation()}>
                  <Checkbox
                    checked={selected.has(e.id)}
                    onCheckedChange={(c) => toggleOne(e.id, !!c)}
                    aria-label={`Select ${e.name}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-heading font-semibold truncate">{e.name}</span>
                    <Badge variant="outline" className="text-[10px]">Rev {e.revision ?? 1}</Badge>
                    <Badge
                      variant="outline"
                      className={
                        "text-[10px] " +
                        (e.status === "AWARDED"
                          ? "bg-emerald-600/15 text-emerald-700 border-emerald-600/30"
                          : e.status === "SUPERSEDED"
                          ? "bg-muted text-muted-foreground"
                          : "bg-amber-500/15 text-amber-700 border-amber-500/30")
                      }
                    >
                      {e.status}
                    </Badge>
                    {e.is_current && (
                      <Badge variant="outline" className="text-[10px] bg-primary/10 border-primary/30 text-primary">Current</Badge>
                    )}
                    {e.ref && <span className="text-xs text-muted-foreground">{e.ref}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">Updated {new Date(e.updated_at).toLocaleDateString()}</div>
                </div>
                <Stat label="Cost" value={fmt(e.total_cost, e.currency)} />
                <Stat label="Price" value={fmt(e.total_price, e.currency)} accent />
                <Stat label="Grand Total" value={fmt(e.grand_total, e.currency)} big />
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={(ev) => { ev.stopPropagation(); setDeleteTarget({ id: e.id, name: e.name }); }}
                  title="Delete estimate (recycle bin)"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <EditorDialog openId={openId} setOpenId={setOpenId} />

      <AlertDialog open={bulkOpen} onOpenChange={(o) => { if (!o) { setBulkOpen(false); setBulkReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} estimate{selected.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              The selected estimates will be moved to the recycle bin (Admin → Archive). They can be restored or permanently deleted from there. All groups and lines are preserved in the snapshot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-40 overflow-y-auto rounded border bg-muted/30 p-2 text-xs space-y-0.5">
            {rows.filter((r) => selected.has(r.id)).map((r) => (
              <div key={r.id} className="truncate">• {r.name}</div>
            ))}
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Reason (required)</label>
            <Input value={bulkReason} onChange={(e) => setBulkReason(e.target.value)} placeholder="e.g. cleanup of superseded drafts" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!bulkReason.trim() || bulkPending} onClick={(ev) => { ev.preventDefault(); runBulkDelete(); }}>
              {bulkPending ? "Deleting…" : "Move to recycle bin"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete estimate?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" will be moved to the recycle bin (Admin → Archive). It can be restored or permanently deleted from there. All groups and lines are preserved in the snapshot.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Reason (required)</label>
            <Input value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="e.g. superseded by revised BOQ" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteReason.trim() || archive.isPending}
              onClick={() => deleteTarget && archive.mutate({ id: deleteTarget.id, reason: deleteReason.trim() })}
            >
              Move to recycle bin
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({ label, value, accent, big }: { label: string; value: string; accent?: boolean; big?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-heading tabular-nums ${big ? "text-lg" : "text-sm"} ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function EditorDialog({ openId, setOpenId }: { openId: string | null; setOpenId: (id: string | null) => void }) {
  const [maximized, setMaximized] = useState(false);
  return (
    <Dialog open={!!openId} onOpenChange={(o) => { if (!o) { setOpenId(null); setMaximized(false); } }}>
      <DialogContent
        className={
          maximized
            ? "max-w-none w-screen h-screen rounded-none border-0 p-0 overflow-hidden flex flex-col sm:rounded-none"
            : "max-w-[96vw] w-[96vw] h-[92vh] p-0 overflow-hidden flex flex-col"
        }
      >
        {openId && (
          <EstimateEditor
            estimateId={openId}
            onClose={() => { setOpenId(null); setMaximized(false); }}
            onOpenEstimate={(id) => setOpenId(id)}
            maximized={maximized}
            onToggleMaximize={() => setMaximized((m) => !m)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}