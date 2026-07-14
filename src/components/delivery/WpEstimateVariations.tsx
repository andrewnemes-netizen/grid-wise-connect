import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { GitPullRequest, Plus, Send, CheckCircle2, XCircle, Trash2, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number | null | undefined, ccy = "GBP") =>
  n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(Number(n));

const signed = (n: number, ccy = "GBP") => (n > 0 ? "+" : n < 0 ? "-" : "") + fmt(Math.abs(n), ccy);

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    SUBMITTED: "bg-sky-500/15 text-sky-600 border-sky-500/30",
    APPROVED: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    REJECTED: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  };
  return <Badge variant="outline" className={map[status] ?? ""}>{status}</Badge>;
}

export default function WpEstimateVariations({ estimate }: { estimate: any }) {
  const qc = useQueryClient();
  const ccy = estimate.currency ?? "GBP";
  const [newOpen, setNewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: variations = [], isLoading } = useQuery({
    queryKey: ["wp-estimate-variations", estimate.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("wp_estimate_variations" as any)
        .select("*").eq("wp_estimate_id", estimate.id)
        .order("variation_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["wp-estimate-variations", estimate.id] });

  const approvedDelta = useMemo(
    () => (variations as any[]).filter((v) => v.status === "APPROVED").reduce((s, v) => s + Number(v.delta_price || 0), 0),
    [variations]
  );
  const pendingDelta = useMemo(
    () => (variations as any[]).filter((v) => v.status === "SUBMITTED").reduce((s, v) => s + Number(v.delta_price || 0), 0),
    [variations]
  );

  const submit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("submit_wp_estimate_variation", { _variation_id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Variation submitted for approval"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Submit failed"),
  });
  const decide = useMutation({
    mutationFn: async ({ id, approve, notes }: { id: string; approve: boolean; notes?: string }) => {
      const { error } = await (supabase as any).rpc("decide_wp_estimate_variation", { _variation_id: id, _approve: approve, _notes: notes ?? null });
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(v.approve ? "Variation approved" : "Variation rejected"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Decision failed"),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("wp_estimate_variations" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Variation deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  const canRaise = estimate.status === "APPROVED";
  const revised = Number(estimate.total_price || 0) + approvedDelta;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <GitPullRequest className="h-4 w-4" /> Variations ({variations.length})
        </div>
        <Button size="sm" variant={canRaise ? "default" : "outline"} onClick={() => setNewOpen(true)} disabled={!canRaise}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New variation
        </Button>
      </div>

      {!canRaise && (
        <Card className="p-3 text-xs text-muted-foreground mb-2">
          Variations can only be raised against an APPROVED work-package estimate.
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Original price</div><div className="text-base font-semibold">{fmt(estimate.total_price, ccy)}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Approved variations</div><div className={`text-base font-semibold ${approvedDelta > 0 ? "text-amber-600" : approvedDelta < 0 ? "text-emerald-600" : ""}`}>{signed(approvedDelta, ccy)}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Pending (submitted)</div><div className="text-base font-semibold">{signed(pendingDelta, ccy)}</div></Card>
        <Card className="p-3 border-primary/40 bg-primary/5"><div className="text-xs text-muted-foreground flex items-center gap-1"><ArrowUpDown className="h-3 w-3" /> Revised total</div><div className="text-base font-semibold text-primary">{fmt(revised, ccy)}</div></Card>
      </div>

      {isLoading ? (
        <Card className="p-4 text-sm text-muted-foreground">Loading variations…</Card>
      ) : variations.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">No variations raised yet.</Card>
      ) : (
        <Accordion type="multiple" className="space-y-2">
          {(variations as any[]).map((v) => (
            <AccordionItem key={v.id} value={v.id} className="border rounded-lg bg-card">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4 gap-3">
                  <div className="text-left">
                    <div className="font-medium">VO-{String(v.variation_number).padStart(3, "0")} · {v.title}</div>
                    {v.reason && <div className="text-xs text-muted-foreground">{v.reason}</div>}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Δ price</div>
                      <div className={`font-semibold ${Number(v.delta_price) > 0 ? "text-amber-600" : Number(v.delta_price) < 0 ? "text-emerald-600" : ""}`}>
                        {signed(Number(v.delta_price || 0), ccy)}
                      </div>
                    </div>
                    <StatusBadge status={v.status} />
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                {v.description && <div className="text-sm whitespace-pre-wrap">{v.description}</div>}
                <VariationLines variationId={v.id} readOnly={v.status !== "DRAFT"} ccy={ccy} onChanged={invalidate} />

                {v.status === "DRAFT" && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingId(v.id)}>Edit details</Button>
                    <Button size="sm" onClick={() => submit.mutate(v.id)} disabled={submit.isPending}>
                      <Send className="h-3.5 w-3.5 mr-1" /> Submit for approval
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive"
                            onClick={() => { if (confirm("Delete this DRAFT variation?")) del.mutate(v.id); }}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                )}
                {v.status === "SUBMITTED" && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => {
                      const notes = prompt("Approval notes (optional):") ?? undefined;
                      decide.mutate({ id: v.id, approve: true, notes });
                    }} disabled={decide.isPending}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      const notes = prompt("Rejection reason:") ?? undefined;
                      decide.mutate({ id: v.id, approve: false, notes });
                    }} disabled={decide.isPending}>
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                    </Button>
                  </div>
                )}
                {(v.status === "APPROVED" || v.status === "REJECTED") && v.decision_notes && (
                  <Card className="p-3 text-xs">
                    <div className="text-muted-foreground mb-1">Decision notes</div>
                    <div className="whitespace-pre-wrap">{v.decision_notes}</div>
                  </Card>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {newOpen && (
        <NewVariationDialog wpEstimateId={estimate.id} onClose={() => setNewOpen(false)}
          onCreated={(id) => { setNewOpen(false); invalidate(); setEditingId(id); }} />
      )}
      {editingId && (
        <EditVariationDialog variationId={editingId} onClose={() => { setEditingId(null); invalidate(); }} />
      )}
    </section>
  );
}

// -------- variation lines --------
function VariationLines({ variationId, readOnly, ccy, onChanged }: { variationId: string; readOnly: boolean; ccy: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: lines = [], refetch } = useQuery({
    queryKey: ["wp-variation-lines", variationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("wp_estimate_variation_lines" as any)
        .select("*").eq("variation_id", variationId).order("sort_index");
      if (error) throw error;
      return data ?? [];
    },
  });

  const recalc = async () => {
    await (supabase as any).rpc("recalc_wp_estimate_variation", { _variation_id: variationId });
    qc.invalidateQueries({ queryKey: ["wp-estimate-variations"] });
    onChanged();
  };

  const updateLine = async (id: string, patch: any) => {
    const cur = (lines as any[]).find((l) => l.id === id);
    const merged = { ...cur, ...patch };
    const qty = Number(merged.quantity ?? 0);
    const uc = Number(merged.unit_cost ?? 0);
    const up = Number(merged.unit_price ?? 0);
    patch.line_cost = Number((qty * uc).toFixed(2));
    patch.line_price = Number((qty * up).toFixed(2));
    const { error } = await supabase.from("wp_estimate_variation_lines" as any).update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await refetch();
    await recalc();
  };
  const deleteLine = async (id: string) => {
    const { error } = await supabase.from("wp_estimate_variation_lines" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await refetch();
    await recalc();
  };
  const addBlank = async () => {
    const { error } = await supabase.from("wp_estimate_variation_lines" as any).insert({
      variation_id: variationId, description: "New line",
      quantity: 1, unit_cost: 0, unit_price: 0,
      line_cost: 0, line_price: 0, kind: "ADD",
      sort_index: (lines as any[]).length,
    });
    if (error) { toast.error(error.message); return; }
    await refetch(); await recalc();
  };
  const addFromRate = async (rate: any, kind: "ADD" | "REMOVE") => {
    const cost = Number(rate?.total_unit_cost ?? 0);
    const price = Number(rate?.client_unit_price ?? cost);
    const { error } = await supabase.from("wp_estimate_variation_lines" as any).insert({
      variation_id: variationId,
      rate_item_id: rate.id,
      rate_code: rate.rate_code,
      description: rate.description,
      unit: rate.unit,
      quantity: 1, unit_cost: cost, unit_price: price,
      line_cost: cost, line_price: price,
      kind,
      sort_index: (lines as any[]).length,
    });
    if (error) { toast.error(error.message); return; }
    setPickerOpen(false);
    await refetch(); await recalc();
  };

  return (
    <div className="space-y-2">
      {!readOnly && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}>Add from rate library</Button>
          <Button size="sm" variant="ghost" onClick={addBlank}><Plus className="h-3.5 w-3.5 mr-1" /> Blank line</Button>
        </div>
      )}
      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Kind</TableHead>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-16">Unit</TableHead>
              <TableHead className="w-20 text-right">Qty</TableHead>
              <TableHead className="w-24 text-right">Unit £</TableHead>
              <TableHead className="w-24 text-right">Line £</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(lines as any[]).map((l) => {
              const signMul = l.kind === "REMOVE" ? -1 : 1;
              return (
                <TableRow key={l.id}>
                  <TableCell>
                    {readOnly ? (
                      <Badge variant="outline">{l.kind}</Badge>
                    ) : (
                      <Select value={l.kind} onValueChange={(v) => updateLine(l.id, { kind: v })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADD">Add</SelectItem>
                          <SelectItem value="REMOVE">Remove</SelectItem>
                          <SelectItem value="CHANGE">Change</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">{l.rate_code ?? "—"}</TableCell>
                  <TableCell>
                    <Input value={l.description ?? ""} disabled={readOnly}
                           onChange={(e) => updateLine(l.id, { description: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input value={l.unit ?? ""} disabled={readOnly} className="w-16"
                           onChange={(e) => updateLine(l.id, { unit: e.target.value })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input type="number" step="0.01" value={l.quantity ?? 0} disabled={readOnly} className="text-right w-20"
                           onChange={(e) => updateLine(l.id, { quantity: Number(e.target.value || 0) })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input type="number" step="0.01" value={l.unit_price ?? 0} disabled={readOnly} className="text-right w-24"
                           onChange={(e) => updateLine(l.id, { unit_price: Number(e.target.value || 0) })} />
                  </TableCell>
                  <TableCell className={`text-right font-medium ${signMul < 0 ? "text-emerald-600" : ""}`}>
                    {signed(signMul * Number(l.line_price || 0), ccy)}
                  </TableCell>
                  <TableCell>
                    {!readOnly && (
                      <Button size="icon" variant="ghost" onClick={() => deleteLine(l.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {lines.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">No lines on this variation yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {pickerOpen && (
        <RatePickerDialog onClose={() => setPickerOpen(false)}
          onPick={(rate, kind) => addFromRate(rate, kind)} />
      )}
    </div>
  );
}

// -------- new variation dialog --------
function NewVariationDialog({ wpEstimateId, onClose, onCreated }: { wpEstimateId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("create_wp_estimate_variation", {
        _wp_estimate_id: wpEstimateId,
        _title: title.trim(),
        _description: description || null,
        _reason: reason || null,
      });
      if (error) throw error;
      toast.success("Draft variation created");
      onCreated(data as string);
    } catch (e: any) {
      toast.error(e.message ?? "Could not create");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New variation</DialogTitle>
          <DialogDescription>Raise a change against the approved estimate. Add lines next, then submit for approval.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Additional trenching at Site B" /></div>
          <div><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Client scope change, unforeseen ground condition" /></div>
          <div><Label>Description</Label><Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>Create draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- edit variation details --------
function EditVariationDialog({ variationId, onClose }: { variationId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: v } = useQuery({
    queryKey: ["wp-variation-edit", variationId],
    queryFn: async () => {
      const { data, error } = await supabase.from("wp_estimate_variations" as any).select("*").eq("id", variationId).single();
      if (error) throw error;
      return data as any;
    },
  });
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  useMemo(() => {
    if (v) { setTitle(v.title ?? ""); setReason(v.reason ?? ""); setDescription(v.description ?? ""); }
  }, [v]);

  const save = async () => {
    const { error } = await supabase.from("wp_estimate_variations" as any).update({
      title, reason: reason || null, description: description || null,
    }).eq("id", variationId);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    qc.invalidateQueries({ queryKey: ["wp-estimate-variations"] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit variation</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <div><Label>Description</Label><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- rate picker (simplified) --------
function RatePickerDialog({ onClose, onPick }: { onClose: () => void; onPick: (rate: any, kind: "ADD" | "REMOVE") => void }) {
  const [q, setQ] = useState("");
  const { data: rates = [] } = useQuery({
    queryKey: ["variation-rate-picker", q],
    queryFn: async () => {
      let query = supabase.from("rate_items")
        .select("id, rate_code, description, unit, total_unit_cost, client_unit_price")
        .limit(30);
      if (q.trim()) query = query.or(`description.ilike.%${q}%,rate_code.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pick rate item</DialogTitle>
          <DialogDescription>Choose whether the line adds work or removes previously-included scope.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Search by code or description…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Card className="overflow-hidden max-h-[50vh] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-16">Unit</TableHead>
                <TableHead className="w-24 text-right">Unit £</TableHead>
                <TableHead className="w-36 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rates as any[]).map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-mono">{r.rate_code}</TableCell>
                  <TableCell className="text-sm">{r.description}</TableCell>
                  <TableCell className="text-xs">{r.unit ?? "—"}</TableCell>
                  <TableCell className="text-right text-xs">{r.total_unit_cost != null ? `£${Number(r.total_unit_cost).toFixed(2)}` : "—"}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" onClick={() => onPick(r, "ADD")}>+ Add</Button>
                    <Button size="sm" variant="outline" onClick={() => onPick(r, "REMOVE")}>− Remove</Button>
                  </TableCell>
                </TableRow>
              ))}
              {rates.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No matches.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
