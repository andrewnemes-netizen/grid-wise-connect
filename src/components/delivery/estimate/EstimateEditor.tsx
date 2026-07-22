import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, ChevronDown, ChevronRight, Trash2, Pencil, Copy, Lock, Link as LinkIcon, Layers, Package, Sparkles, CalendarClock, Send, Download, Maximize2, Minimize2 } from "lucide-react";
import { toast } from "sonner";
import { EstimateLineDialog } from "./EstimateLineDialog";
import { RateItemPicker } from "./RateItemPicker";
import { GeneratePlanDialog } from "./GeneratePlanDialog";
import { SendQuotationDialog } from "./SendQuotationDialog";
import { downloadQuotationPdf } from "@/lib/quotation-pdf";
import { EstimateRevisionsBar, PrelimsInline } from "./EstimateRevisionsBar";
import { EstimateSitePickerDialog, type PickedSite } from "./EstimateSitePickerDialog";
import { MapPin, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";

const fmt = (n: number | null | undefined, ccy = "GBP") =>
  n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: ccy, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n));
const pct = (n: number | null | undefined) => (n == null ? "—" : `${Number(n).toFixed(2)}%`);

export function EstimateEditor({ estimateId, onClose, onOpenEstimate, maximized, onToggleMaximize }: { estimateId: string; onClose?: () => void; onOpenEstimate?: (id: string) => void; maximized?: boolean; onToggleMaximize?: () => void }) {
  const qc = useQueryClient();
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [creatingInGroup, setCreatingInGroup] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [rateCardOpen, setRateCardOpen] = useState<string | null | false>(false); // group id | null (auto) | false (closed)
  const [planOpen, setPlanOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [bulkMarkup, setBulkMarkup] = useState<string>("");
  const [sitePickerOpen, setSitePickerOpen] = useState(false);

  const est = useQuery({
    queryKey: ["estimate", estimateId],
    queryFn: async () => {
      const { data, error } = await supabase.from("estimates" as any).select("*").eq("id", estimateId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const boundSite = useQuery({
    queryKey: ["estimate-bound-site", est.data?.site_id],
    enabled: !!est.data?.site_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("id, site_name, postcode")
        .eq("id", est.data.site_id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const groups = useQuery({
    queryKey: ["estimate-groups", estimateId],
    queryFn: async () => {
      const { data, error } = await supabase.from("estimate_groups" as any).select("*").eq("estimate_id", estimateId).order("sort_index");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const lines = useQuery({
    queryKey: ["estimate-lines", estimateId],
    queryFn: async () => {
      const { data, error } = await supabase.from("estimate_lines" as any).select("*").eq("estimate_id", estimateId).order("sort_index");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["estimate", estimateId] });
    qc.invalidateQueries({ queryKey: ["estimate-groups", estimateId] });
    qc.invalidateQueries({ queryKey: ["estimate-lines", estimateId] });
    qc.invalidateQueries({ queryKey: ["estimates-list"] });
  };

  const updateEstimate = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const { error } = await supabase.from("estimates" as any).update(patch).eq("id", estimateId);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const addGroup = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("estimate_groups" as any).insert({
        estimate_id: estimateId, name, sort_index: groups.data?.length ?? 0,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Group added"); invalidateAll(); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("estimate_groups" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const deleteLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("estimate_lines" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const updateLine = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from("estimate_lines" as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const duplicateLine = useMutation({
    mutationFn: async (id: string) => {
      const src = (lines.data ?? []).find((l) => l.id === id);
      if (!src) return;
      const { id: _i, created_at, updated_at, ...rest } = src;
      const { error } = await supabase.from("estimate_lines" as any).insert({ ...rest, boq_item_name: `${src.boq_item_name} (copy)` } as any);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });

  const applyBulkMarkup = useMutation({
    mutationFn: async (pct: number) => {
      const ids = (lines.data ?? []).map((l) => l.id);
      if (!ids.length) return 0;
      const chunk = 10;
      for (let i = 0; i < ids.length; i += chunk) {
        const slice = ids.slice(i, i + chunk);
        const { error } = await supabase.from("estimate_lines" as any)
          .update({ markup_type: "Percentage", markup_pct: pct, markup_dollar: 0 } as any)
          .in("id", slice);
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: (n) => { toast.success(`Applied markup to ${n} line${n === 1 ? "" : "s"}`); invalidateAll(); },
    onError: (e: any) => toast.error(e.message ?? "Bulk markup failed"),
  });

  const zeroAllQty = useMutation({
    mutationFn: async () => {
      const ids = (lines.data ?? []).map((l) => l.id);
      if (!ids.length) return 0;
      const chunk = 10;
      for (let i = 0; i < ids.length; i += chunk) {
        const slice = ids.slice(i, i + chunk);
        const { error } = await supabase.from("estimate_lines" as any)
          .update({ qty: 0 } as any)
          .in("id", slice);
        if (error) throw error;
      }
      return ids.length;
    },
    onSuccess: (n) => { toast.success(`Zeroed qty on ${n} line${n === 1 ? "" : "s"}`); invalidateAll(); },
    onError: (e: any) => toast.error(e.message ?? "Zero qty failed"),
  });

  const expandAll = () => setCollapsed({});
  const collapseAll = () => {
    const map: Record<string, boolean> = {};
    for (const g of groups.data ?? []) map[g.id] = true;
    setCollapsed(map);
  };

  const cloneEstimate = useMutation({
    mutationFn: async () => {
      const e = est.data;
      const { data: newEst, error: e1 } = await supabase.from("estimates" as any).insert({
        work_package_id: e.work_package_id, project_id: e.project_id,
        name: `${e.name} (clone)`, ref: e.ref, currency: e.currency, exchange_rate: e.exchange_rate,
      } as any).select("id").single();
      if (e1) throw e1;
      const groupMap: Record<string, string> = {};
      for (const g of groups.data ?? []) {
        const { data: newG } = await supabase.from("estimate_groups" as any).insert({
          estimate_id: (newEst as any).id, name: g.name, cost_category: g.cost_category, cost_code: g.cost_code, color: g.color, sort_index: g.sort_index,
        } as any).select("id").single();
        groupMap[g.id] = (newG as any).id;
      }
      for (const l of lines.data ?? []) {
        const { id: _i, created_at, updated_at, group_id, estimate_id, ...rest } = l;
        await supabase.from("estimate_lines" as any).insert({
          ...rest, estimate_id: (newEst as any).id, group_id: group_id ? groupMap[group_id] : null,
        } as any);
      }
    },
    onSuccess: () => { toast.success("Estimate cloned"); qc.invalidateQueries({ queryKey: ["estimates-list"] }); },
  });

  const linesByGroup = useMemo(() => {
    const m: Record<string, any[]> = { __ungrouped: [] };
    for (const l of lines.data ?? []) {
      const k = l.group_id ?? "__ungrouped";
      (m[k] ??= []).push(l);
    }
    return m;
  }, [lines.data]);

  if (est.isLoading || !est.data) return <div className="p-6 text-sm text-muted-foreground">Loading estimate…</div>;
  const e = est.data;
  const c = e.currency ?? "GBP";

  const totalWithMarkup = Number(e.total_cost) + Number(e.total_markup);
  const totalDiscountPct = totalWithMarkup > 0 ? (Number(e.total_discount) / totalWithMarkup) * 100 : 0;
  const materialPct = Number(e.total_cost) > 0 ? (Number(e.material_cost) / Number(e.total_cost)) * 100 : 100;

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b bg-gradient-to-r from-primary/5 via-background to-background">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary uppercase tracking-wider text-[10px]">Estimate</Badge>
            <Input value={e.name} onChange={(ev) => updateEstimate.mutate({ name: ev.target.value })}
              className="h-8 max-w-xs font-heading font-semibold text-base border-transparent bg-transparent hover:bg-muted/40 focus:bg-background" />
            {e.locked && <Lock className="h-3.5 w-3.5 text-amber-600" />}
          </div>
          <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-3">
            <span>Ref: <Input value={e.ref ?? ""} onChange={(ev) => updateEstimate.mutate({ ref: ev.target.value })} className="h-6 w-32 inline-block px-1" placeholder="REF…" /></span>
            <span>Currency: {e.currency}</span>
            <span>Rate: {Number(e.exchange_rate).toFixed(2)}</span>
            {e.site_id && boundSite.data ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <Link to={`/site/${e.site_id}`} className="text-primary hover:underline">
                  {boundSite.data.site_name}{boundSite.data.postcode ? ` · ${boundSite.data.postcode}` : ""}
                </Link>
                {e.work_package_id && (
                  <button
                    onClick={() => setSitePickerOpen(true)}
                    className="ml-1 text-[10px] underline text-muted-foreground hover:text-foreground"
                  >
                    change
                  </button>
                )}
              </span>
            ) : e.work_package_id ? (
              <button
                onClick={() => setSitePickerOpen(true)}
                className="inline-flex items-center gap-1 text-amber-700 hover:underline"
              >
                <AlertCircle className="h-3 w-3" />
                Assign site
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border bg-card">
            <Switch checked={e.show_recipe_totals} onCheckedChange={(v) => updateEstimate.mutate({ show_recipe_totals: v })} />
            Recipe totals
          </div>
          <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border bg-card">
            <Switch checked={e.boq_compact_view} onCheckedChange={(v) => updateEstimate.mutate({ boq_compact_view: v })} />
            Compact view
          </div>
          <Button size="sm" variant="outline" onClick={() => setRateCardOpen(null)}>
            <LinkIcon className="h-3.5 w-3.5 mr-1" />From Rate Card
          </Button>
          <Button size="sm" variant="outline"><Package className="h-3.5 w-3.5 mr-1" />Add Recipe</Button>
          <Button size="sm" onClick={() => setPlanOpen(true)} disabled={!e.work_package_id}>
            <CalendarClock className="h-3.5 w-3.5 mr-1" />Generate Plan
          </Button>
          <Button size="sm" variant="outline" onClick={() => cloneEstimate.mutate()}><Copy className="h-3.5 w-3.5 mr-1" />Clone</Button>
          <Button size="sm" variant="outline" onClick={() => downloadQuotationPdf({ estimate: e, groups: groups.data ?? [], lines: lines.data ?? [] })}>
            <Download className="h-3.5 w-3.5 mr-1" />Download PDF
          </Button>
          <Button size="sm" onClick={() => setQuoteOpen(true)}>
            <Send className="h-3.5 w-3.5 mr-1" />Send Quotation
          </Button>
          {onToggleMaximize && (
            <Button size="sm" variant="ghost" onClick={onToggleMaximize} title={maximized ? "Restore" : "Maximize"}>
              {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          )}
          {onClose && <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>}
        </div>
      </div>

      {/* Revisions & award */}
      <EstimateRevisionsBar estimate={e as any} onOpenEstimate={(id) => onOpenEstimate?.(id)} />

      {/* Prelims */}
      <div className="flex items-center gap-2 px-6 py-2 border-b bg-background">
        <PrelimsInline
          estimateId={e.id}
          prelims_pct={e.prelims_pct ?? null}
          prelims_amount={e.prelims_amount ?? null}
          currency={c}
          disabled={e.status === "AWARDED" || e.status === "SUPERSEDED"}
        />
        <span className="text-[11px] text-muted-foreground">
          Preliminaries are applied on top of the BOQ subtotal. Tag lines as prelim inside the line editor to roll them up separately.
        </span>
      </div>

      {/* Bulk actions bar */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-2 border-b bg-muted/20">
        <Button size="sm" variant="outline" onClick={expandAll} title="Expand all groups">
          <ChevronDown className="h-3.5 w-3.5 mr-1" />Expand all
        </Button>
        <Button size="sm" variant="outline" onClick={collapseAll} title="Collapse all groups">
          <ChevronRight className="h-3.5 w-3.5 mr-1" />Collapse all
        </Button>
        <div className="mx-2 h-5 w-px bg-border" />
        <span className="text-xs text-muted-foreground">Apply markup to all lines:</span>
        <Input
          type="number"
          step="0.1"
          value={bulkMarkup}
          onChange={(ev) => setBulkMarkup(ev.target.value)}
          placeholder="%"
          className="h-7 w-20 text-right tabular-nums"
        />
        <Button
          size="sm"
          onClick={() => {
            const v = parseFloat(bulkMarkup);
            if (!Number.isFinite(v)) { toast.error("Enter a valid %"); return; }
            const n = (lines.data ?? []).length;
            if (!n) { toast.error("No lines to update"); return; }
            if (!confirm(`Apply ${v}% markup to all ${n} line${n === 1 ? "" : "s"}? This will overwrite existing markups.`)) return;
            applyBulkMarkup.mutate(v);
          }}
          disabled={applyBulkMarkup.isPending}
        >
          Apply to all
        </Button>
        <div className="mx-2 h-5 w-px bg-border" />
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const n = (lines.data ?? []).length;
            if (!n) { toast.error("No lines to update"); return; }
            if (!confirm(`Set quantity to 0 on all ${n} line${n === 1 ? "" : "s"}?`)) return;
            zeroAllQty.mutate();
          }}
          disabled={zeroAllQty.isPending}
          title="Reset every line qty to 0"
        >
          Zero all qty
        </Button>
      </div>

      {/* Totals bar */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-px bg-border border-y">
        <TotalCell label="Gross Margin" value={pct(100 - (Number(e.total_cost) / Math.max(Number(e.total_price), 1)) * 100)} accent />
        <TotalCell label="Net Markup" value={pct(e.net_markup_pct ?? (Number(e.total_cost) > 0 ? Number(e.total_markup) / Number(e.total_cost) * 100 : 0))} accent />
        <TotalCell label="Total Cost" value={fmt(e.total_cost, c)} sub={`Material: ${materialPct.toFixed(0)}%`} />
        <TotalCell label="Total Markup" value={fmt(e.total_markup, c)} />
        <TotalCell label="Total Price" value={fmt(e.total_price, c)} highlight />
        <TotalCell label="Grand Total" value={fmt(e.grand_total, c)} sub={`VAT ${fmt(e.vat_total, c)}`} highlight />
      </div>

      {/* Groups + lines */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-[1100px]">
          {groups.data?.length === 0 && (
            <div className="p-8 text-center border-b">
              <div className="text-sm text-muted-foreground mb-3">No groups yet — start with a cost category.</div>
              <Button size="sm" onClick={() => addGroup.mutate("Civils")}><Plus className="h-3.5 w-3.5 mr-1" />Add first group</Button>
            </div>
          )}
          {[...(groups.data ?? [])]
            .sort((a, b) => {
              const aHas = (linesByGroup[a.id]?.length ?? 0) > 0 ? 0 : 1;
              const bHas = (linesByGroup[b.id]?.length ?? 0) > 0 ? 0 : 1;
              if (aHas !== bHas) return aHas - bHas;
              return (a.sort_index ?? 0) - (b.sort_index ?? 0);
            })
            .map((g) => {
            const gLines = linesByGroup[g.id] ?? [];
            const groupCost = gLines.reduce((s, l) => s + Number(l.total_cost || 0), 0);
            const groupPrice = gLines.reduce((s, l) => s + Number(l.total_price || 0), 0);
            const groupSub = gLines.reduce((s, l) => s + Number(l.sub_total || 0), 0);
            const isCol = collapsed[g.id];
            return (
              <div key={g.id} className="border-b">
                <div className="grid grid-cols-[32px_1fr_140px_140px_140px_140px_140px_120px_40px] items-center bg-gradient-to-r from-primary/90 to-primary text-primary-foreground text-xs font-medium">
                  <button className="h-9 flex items-center justify-center hover:bg-white/10" onClick={() => setCollapsed((s) => ({ ...s, [g.id]: !s[g.id] }))}>
                    {isCol ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <div className="flex items-center gap-2 px-2">
                    <Input value={g.name} onChange={(ev) => supabase.from("estimate_groups" as any).update({ name: ev.target.value }).eq("id", g.id).then(invalidateAll)}
                      className="h-7 border-transparent bg-transparent hover:bg-white/10 focus:bg-white/20 text-primary-foreground placeholder:text-primary-foreground/60 font-semibold" />
                    <Badge variant="outline" className="bg-white/10 border-white/20 text-primary-foreground/90 text-[10px]">{gLines.length}</Badge>
                  </div>
                  <div className="px-2 text-right tabular-nums">{fmt(groupCost, c)}</div>
                  <div className="px-2 text-right tabular-nums opacity-90">—</div>
                  <div className="px-2 text-right tabular-nums">{fmt(groupPrice, c)}</div>
                  <div className="px-2 text-right tabular-nums opacity-80">—</div>
                  <div className="px-2 text-right tabular-nums font-semibold">{fmt(groupSub, c)}</div>
                  <div className="px-2 flex justify-end gap-1">
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-primary-foreground hover:bg-white/20" onClick={() => setCreatingInGroup(g.id)}><Plus className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-primary-foreground hover:bg-white/20" onClick={() => setRateCardOpen(g.id)} title="Add from rate card"><Package className="h-3.5 w-3.5" /></Button>
                  </div>
                  <button className="h-9 flex items-center justify-center hover:bg-white/10" onClick={() => { if (confirm("Delete group and its lines?")) deleteGroup.mutate(g.id); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {!isCol && (
                  <>
                    <div className="grid grid-cols-[32px_1fr_140px_140px_140px_140px_140px_120px_40px] bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground border-b">
                      <div />
                      <div className="px-3 py-2">BOQ Item / Supplier</div>
                      <div className="px-2 py-2 text-right">Qty × Unit Cost</div>
                      <div className="px-2 py-2 text-right">Markup</div>
                      <div className="px-2 py-2 text-right">Unit Price (incl. markup)</div>
                      <div className="px-2 py-2 text-right">Discount</div>
                      <div className="px-2 py-2 text-right">Sub Total</div>
                      <div className="px-2 py-2 text-right">VAT / Total</div>
                      <div />
                    </div>
                    {gLines.length === 0 && (
                      <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                        No lines yet. <button className="text-primary underline underline-offset-2" onClick={() => setCreatingInGroup(g.id)}>Add first line</button>
                      </div>
                    )}
                    {gLines.map((l) => (
                      <div key={l.id} className="grid grid-cols-[32px_1fr_140px_140px_140px_140px_140px_120px_40px] items-stretch text-sm border-b last:border-b-0 hover:bg-primary/5 group">
                        <div className="border-l-4 border-primary/40" />
                        <div className="px-3 py-2 min-w-0">
                          <button className="text-left w-full" onClick={() => setEditingLine(l.id)}>
                            <div className="font-medium truncate">{l.boq_item_name || <span className="text-muted-foreground italic">Untitled item</span>}</div>
                            <div className="text-xs text-muted-foreground truncate flex items-center gap-2">
                              {l.supplier && <span>{l.supplier}</span>}
                              {l.item_logic && <Badge variant="outline" className="text-[9px] h-4 px-1">{l.item_logic.replace(/_/g, " ")}</Badge>}
                              {l.is_allowance && <Badge variant="outline" className="text-[9px] h-4 px-1 bg-amber-500/10 border-amber-500/30 text-amber-700">Allowance</Badge>}
                              {l.fixed_price && <Badge variant="outline" className="text-[9px] h-4 px-1">Fixed</Badge>}
                            </div>
                          </button>
                        </div>
                        <div className="px-2 py-2 text-right tabular-nums">
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              defaultValue={Number(l.qty)}
                              key={`qty-${l.id}-${l.qty}`}
                              onBlur={(ev) => {
                                const v = parseFloat(ev.target.value);
                                if (Number.isFinite(v) && v !== Number(l.qty)) {
                                  updateLine.mutate({ id: l.id, patch: { qty: v } });
                                }
                              }}
                              onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                              className="h-7 w-20 text-right tabular-nums"
                              title="Quantity — press Enter or tab out to save"
                            />
                            <span className="text-[10px] text-muted-foreground w-6 text-left">{l.uom}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">@ {fmt(l.unit_cost, c)}</div>
                        </div>
                        <div className="px-2 py-2 text-right tabular-nums">
                          <div className="flex items-center justify-end gap-1">
                            <Input
                              type="number"
                              step="0.1"
                              defaultValue={Number(l.markup_pct ?? l.net_markup_pct ?? 0)}
                              key={`mk-${l.id}-${l.markup_pct}-${l.net_markup_pct}`}
                              onBlur={(ev) => {
                                const v = parseFloat(ev.target.value);
                                const current = Number(l.markup_pct ?? l.net_markup_pct ?? 0);
                                if (Number.isFinite(v) && v !== current) {
                                  updateLine.mutate({ id: l.id, patch: { markup_type: "Percentage", markup_pct: v, markup_dollar: 0 } });
                                }
                              }}
                              onKeyDown={(ev) => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); }}
                              className="h-7 w-16 text-right tabular-nums"
                              title="Gross margin % — press Enter or tab out to save"
                            />
                            <span className="text-[10px] text-muted-foreground w-2">%</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{fmt(l.total_markup, c)}</div>
                        </div>
                        <div className="px-2 py-2 text-right tabular-nums font-medium">{fmt(l.unit_price, c)}</div>
                        <div className="px-2 py-2 text-right tabular-nums text-muted-foreground">{fmt(l.discount, c)}</div>
                        <div className="px-2 py-2 text-right tabular-nums font-semibold">{fmt(l.sub_total, c)}</div>
                        <div className="px-2 py-2 text-right tabular-nums text-xs">
                          <div>{fmt(l.vat_amount, c)}</div>
                          <div className="text-muted-foreground">{fmt(l.grand_total, c)}</div>
                        </div>
                        <div className="flex items-center justify-center gap-0.5 opacity-0 group-hover:opacity-100">
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => duplicateLine.mutate(l.id)} title="Duplicate"><Copy className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingLine(l.id)} title="Edit"><Pencil className="h-3 w-3" /></Button>
                          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => deleteLine.mutate(l.id)} title="Delete"><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}

          <div className="p-3 flex items-center gap-2 border-b bg-muted/20">
            <AddGroupInline onAdd={(n) => addGroup.mutate(n)} />
            <div className="text-xs text-muted-foreground ml-auto flex items-center gap-1"><Sparkles className="h-3 w-3" /> Totals auto-recalculate on save</div>
          </div>
        </div>
      </div>

      {(editingLine || creatingInGroup) && (
        <EstimateLineDialog
          estimateId={estimateId}
          lineId={editingLine}
          groupId={creatingInGroup}
          currency={c}
          onOpenChange={(o) => { if (!o) { setEditingLine(null); setCreatingInGroup(null); } }}
          onSaved={invalidateAll}
        />
      )}
      {rateCardOpen !== false && (
        <RateItemPicker
          estimateId={estimateId}
          groups={(groups.data ?? []).map((g: any) => ({ id: g.id, name: g.name, cost_category: g.cost_category }))}
          defaultGroupId={rateCardOpen}
          currency={c}
          onOpenChange={(o) => { if (!o) setRateCardOpen(false); }}
          onInserted={invalidateAll}
        />
      )}
      <GeneratePlanDialog
        estimateId={estimateId}
        workPackageId={e.work_package_id ?? null}
        open={planOpen}
        onOpenChange={setPlanOpen}
      />
      <SendQuotationDialog
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        estimate={e}
        groups={groups.data ?? []}
        lines={lines.data ?? []}
      />
      {e.work_package_id && (
        <EstimateSitePickerDialog
          workPackageId={e.work_package_id}
          open={sitePickerOpen}
          onOpenChange={setSitePickerOpen}
          onPick={(site: PickedSite) => {
            updateEstimate.mutate({ site_id: site.id });
            toast.success("Site linked to estimate");
          }}
          title={e.site_id ? "Change linked site" : "Link this estimate to a site"}
          confirmLabel={e.site_id ? "Change site" : "Link site"}
        />
      )}
    </div>
  );
}

function TotalCell({ label, value, sub, accent, highlight }: { label: string; value: string; sub?: string; accent?: boolean; highlight?: boolean }) {
  return (
    <div className={`px-4 py-3 bg-card ${highlight ? "bg-primary/5" : ""}`}>
      <div className={`text-[10px] uppercase tracking-wider mb-1 ${accent ? "text-primary font-semibold" : "text-muted-foreground"}`}>{label}</div>
      <div className={`font-heading text-lg tabular-nums ${highlight ? "text-primary font-semibold" : ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function AddGroupInline({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Layers className="h-3.5 w-3.5 mr-1" />Add group</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New cost group</DialogTitle></DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Civils, Electrical, Fees…" autoFocus />
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!name.trim()} onClick={() => { onAdd(name.trim()); setName(""); setOpen(false); }}>Add group</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}