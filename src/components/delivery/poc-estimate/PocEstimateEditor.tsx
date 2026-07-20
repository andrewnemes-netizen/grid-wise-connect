import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, X, Zap, Pencil } from "lucide-react";
import { toast } from "sonner";
import { EstimateLineDialog } from "@/components/delivery/estimate/EstimateLineDialog";

const fmt = (n: number, c = "GBP") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n || 0);

type Line = {
  id: string;
  poc_estimate_id: string;
  sort_index: number;
  description: string;
  unit: string;
  quantity: number;
  unit_cost: number;
  unit_price: number;
  line_cost: number;
  line_price: number;
};

export function PocEstimateEditor({ estimateId, onClose }: { estimateId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [editLineId, setEditLineId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const est = useQuery({
    queryKey: ["poc-estimate", estimateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("poc_estimates" as any)
        .select("*, sites:site_id(name, address), dno_offers:dno_offer_id(offer_ref, dno_key)")
        .eq("id", estimateId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const lines = useQuery({
    queryKey: ["poc-estimate-lines", estimateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("poc_estimate_lines" as any)
        .select("*")
        .eq("poc_estimate_id", estimateId)
        .order("sort_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Line[];
    },
  });

  const [local, setLocal] = useState<{ name: string; status: string; notes: string }>({
    name: "", status: "draft", notes: "",
  });

  useEffect(() => {
    if (est.data) {
      setLocal({ name: est.data.name ?? "", status: est.data.status ?? "draft", notes: est.data.notes ?? "" });
    }
  }, [est.data]);

  const saveHeader = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("poc_estimates" as any)
        .update({ name: local.name, status: local.status, notes: local.notes })
        .eq("id", estimateId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["poc-estimate", estimateId] });
      qc.invalidateQueries({ queryKey: ["poc-estimates-list"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addLine = useMutation({
    mutationFn: async () => {
      const next = (lines.data?.length ?? 0);
      const { error } = await supabase.from("poc_estimate_lines" as any).insert({
        poc_estimate_id: estimateId,
        sort_index: next,
        description: "New line item",
        unit: "ea",
        quantity: 1,
        unit_cost: 0,
        unit_price: 0,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["poc-estimate-lines", estimateId] });
      qc.invalidateQueries({ queryKey: ["poc-estimate", estimateId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateLine = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Line> }) => {
      const { error } = await supabase.from("poc_estimate_lines" as any).update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["poc-estimate-lines", estimateId] });
      qc.invalidateQueries({ queryKey: ["poc-estimate", estimateId] });
    },
  });

  const removeLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("poc_estimate_lines" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["poc-estimate-lines", estimateId] });
      qc.invalidateQueries({ queryKey: ["poc-estimate", estimateId] });
    },
  });

  if (est.isLoading || !est.data) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  const e = est.data;

  return (
    <div className="flex flex-col h-full min-h-0">
      <header className="border-b p-4 flex items-center gap-3">
        <Badge variant="outline" className="bg-primary/5 border-primary/30 text-primary">
          <Zap className="h-3 w-3 mr-1" /> PoC Estimate
        </Badge>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Input
              value={local.name}
              onChange={(ev) => setLocal((s) => ({ ...s, name: ev.target.value }))}
              onBlur={() => saveHeader.mutate()}
              className="font-heading text-lg h-9 border-transparent hover:border-input focus:border-input px-2"
            />
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
            {e.sites?.name && <span>Site: {e.sites.name}</span>}
            {e.dno_offers?.offer_ref && (
              <span>· DNO offer {e.dno_offers.offer_ref}{e.dno_offers.dno_key ? ` (${e.dno_offers.dno_key})` : ""}</span>
            )}
            <span>· Separate from EV Build estimates</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={local.status}
            onValueChange={(v) => { setLocal((s) => ({ ...s, status: v })); setTimeout(() => saveHeader.mutate(), 0); }}
          >
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="font-heading text-sm">Line items</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => addLine.mutate()}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Quick add
              </Button>
              <Button size="sm" onClick={() => setCreatingNew(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add rich line
              </Button>
            </div>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-20">Unit</TableHead>
                  <TableHead className="w-24 text-right">Qty</TableHead>
                  <TableHead className="w-28 text-right">Unit cost</TableHead>
                  <TableHead className="w-28 text-right">Unit price</TableHead>
                  <TableHead className="w-28 text-right">Line cost</TableHead>
                  <TableHead className="w-28 text-right">Line price</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(lines.data ?? []).map((row) => (
                  <TableRow
                    key={row.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setEditLineId(row.id)}
                  >
                    <TableCell className="font-medium">{row.description || <span className="text-muted-foreground italic">Untitled</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.unit || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(row.quantity ?? 0)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(Number(row.unit_cost), e.currency)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(Number(row.unit_price), e.currency)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(Number(row.line_cost), e.currency)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{fmt(Number(row.line_price), e.currency)}</TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditLineId(row.id)} title="Edit rich line">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLine.mutate(row.id)} title="Remove">
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(lines.data?.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-8">
                      No lines yet. Add the PoC application fees, DNO scheme cost and any commercial mark-up.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              rows={4}
              value={local.notes}
              onChange={(ev) => setLocal((s) => ({ ...s, notes: ev.target.value }))}
              onBlur={() => saveHeader.mutate()}
              placeholder="Assumptions, exclusions, DNO reference notes…"
            />
          </div>
          <div className="space-y-1 self-end">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total cost</span><span className="tabular-nums">{fmt(Number(e.total_cost), e.currency)}</span></div>
            <div className="flex justify-between text-lg font-heading"><span>Total price</span><span className="tabular-nums text-primary">{fmt(Number(e.total_price), e.currency)}</span></div>
          </div>
        </div>
      </div>

      {(editLineId || creatingNew) && (
        <EstimateLineDialog
          table="poc_estimate_lines"
          estimateId={estimateId}
          lineId={editLineId}
          groupId={null}
          currency={e.currency ?? "GBP"}
          nextSortIndex={lines.data?.length ?? 0}
          onOpenChange={(o) => { if (!o) { setEditLineId(null); setCreatingNew(false); } }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["poc-estimate-lines", estimateId] });
            qc.invalidateQueries({ queryKey: ["poc-estimate", estimateId] });
          }}
        />
      )}
    </div>
  );
}