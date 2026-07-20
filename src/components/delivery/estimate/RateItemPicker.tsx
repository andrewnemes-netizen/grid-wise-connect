import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Package } from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number | null | undefined, ccy = "GBP") =>
  n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: ccy, minimumFractionDigits: 2 }).format(Number(n));

type Group = { id: string; name: string; cost_category?: string | null };

export function RateItemPicker({
  estimateId,
  groups,
  defaultGroupId,
  currency,
  onOpenChange,
  onInserted,
}: {
  estimateId: string;
  groups: Group[];
  defaultGroupId?: string | null;
  currency: string;
  onOpenChange: (o: boolean) => void;
  onInserted: () => void;
}) {
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string>("__all");
  const [rateCardVersionId, setRateCardVersionId] = useState<string>("");
  const [selected, setSelected] = useState<Record<string, number>>({}); // id -> qty
  const [targetGroup, setTargetGroup] = useState<string>(defaultGroupId ?? (groups[0]?.id ?? ""));
  const [autoGroup, setAutoGroup] = useState(true);
  const [saving, setSaving] = useState(false);

  const versions = useQuery({
    queryKey: ["rate-card-versions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_card_versions" as any)
        .select("id, version_number, status, rate_card_id, rate_cards!inner(name, code, category, contract:contracts(name))")
        .in("status", ["APPROVED", "DRAFT"])
        .order("status", { ascending: true })
        .order("version_number", { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as any[];
      if (!rateCardVersionId && list.length) setRateCardVersionId(list[0].id);
      return list;
    },
  });

  const items = useQuery({
    queryKey: ["rate-items", rateCardVersionId],
    enabled: !!rateCardVersionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_items" as any)
        .select("*")
        .eq("rate_card_version_id", rateCardVersionId)
        .order("category")
        .order("description")
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    (items.data ?? []).forEach((i) => i.category && set.add(i.category));
    return Array.from(set).sort();
  }, [items.data]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (items.data ?? []).filter((i) => {
      if (category !== "__all" && i.category !== category) return false;
      if (!term) return true;
      return (
        (i.description ?? "").toLowerCase().includes(term) ||
        (i.rate_code ?? "").toLowerCase().includes(term) ||
        (i.cost_code ?? "").toLowerCase().includes(term)
      );
    });
  }, [items.data, q, category]);

  const selectedList = useMemo(
    () => (items.data ?? []).filter((i) => selected[i.id] != null),
    [items.data, selected]
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = { ...s };
      if (n[id] != null) delete n[id];
      else n[id] = 1;
      return n;
    });

  async function ensureGroupFor(category: string | null, existing: Group[]): Promise<string> {
    const wanted = category?.trim() || "General";
    const hit = existing.find((g) => (g.name ?? "").toLowerCase() === wanted.toLowerCase());
    if (hit) return hit.id;
    const { data, error } = await supabase
      .from("estimate_groups" as any)
      .insert({ estimate_id: estimateId, name: wanted, cost_category: wanted, sort_index: existing.length })
      .select("id")
      .single();
    if (error) throw error;
    existing.push({ id: (data as any).id, name: wanted });
    return (data as any).id;
  }

  async function insert() {
    if (selectedList.length === 0) {
      toast.error("Select at least one rate item");
      return;
    }
    if (!autoGroup && !targetGroup) {
      toast.error("Choose a target group");
      return;
    }
    setSaving(true);
    try {
      const groupCache = [...groups];
      const rows: any[] = [];
      for (const it of selectedList) {
        const qty = Number(selected[it.id] || 1);
        const cost = Number(it.total_unit_cost ?? 0);
        const price = Number(it.client_unit_price ?? cost);
        const markupDollar = Math.max(0, price - cost);
        const groupId = autoGroup ? await ensureGroupFor(it.category, groupCache) : targetGroup;
        rows.push({
          estimate_id: estimateId,
          group_id: groupId,
          rate_item_id: it.id,
          rate_card_version_id: rateCardVersionId,
          rate_code: it.rate_code,
          boq_item_name: it.description,
          boq_description: it.description,
          item_logic: "SUPPLY_AND_INSTALL",
          qty,
          uom: it.unit ?? "ea",
          unit_cost: cost,
          markup_type: "Amount",
          markup_dollar: markupDollar,
          markup_pct: 0,
          contingency_pct: 0,
          discount: 0,
          vat_rate: 20,
          cost_category: it.cost_code_category ?? it.category ?? null,
          cost_code: it.cost_code ?? null,
          product_service: it.rate_code ?? null,
          supplier: it.provided_by ?? null,
          pricing_notes: it.notes ?? null,
        });
      }
      const { error } = await supabase.from("estimate_lines" as any).insert(rows as any);
      if (error) throw error;
      toast.success(`${rows.length} line${rows.length === 1 ? "" : "s"} added from rate card`);
      onInserted();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "Insert failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-primary/5 to-background">
          <DialogTitle className="flex items-center gap-2 font-heading">
            <Package className="h-4 w-4 text-primary" />
            Insert from Rate Card
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-3 border-b grid grid-cols-1 md:grid-cols-4 gap-3 bg-muted/20">
          <div className="md:col-span-2">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Rate card</label>
            <Select value={rateCardVersionId} onValueChange={setRateCardVersionId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Choose rate card" /></SelectTrigger>
              <SelectContent>
                {(versions.data ?? []).map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.rate_cards?.name ?? "Rate card"} — {v.rate_cards?.category ?? (v.rate_cards?.contract?.name ?? "Library")} · v{v.version_number} ({v.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} className="h-9 pl-7" placeholder="Rate code, description…" />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/60 backdrop-blur text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="w-8 px-3 py-2"></th>
                <th className="text-left px-3 py-2">Item</th>
                <th className="text-left px-3 py-2">Category</th>
                <th className="text-left px-3 py-2">Unit</th>
                <th className="text-right px-3 py-2">Unit Cost</th>
                <th className="text-right px-3 py-2">Client Price</th>
                <th className="text-right px-3 py-2 w-24">Qty</th>
              </tr>
            </thead>
            <tbody>
              {items.isLoading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading rate items…</td></tr>
              )}
              {!items.isLoading && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No matching rate items.</td></tr>
              )}
              {filtered.map((i) => {
                const isSel = selected[i.id] != null;
                return (
                  <tr key={i.id} className={`border-b hover:bg-primary/5 ${isSel ? "bg-primary/5" : ""}`}>
                    <td className="px-3 py-2"><Checkbox checked={isSel} onCheckedChange={() => toggle(i.id)} /></td>
                    <td className="px-3 py-2">
                      <div className="font-medium truncate max-w-[380px]">{i.description}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{i.rate_code}</div>
                    </td>
                    <td className="px-3 py-2">
                      {i.category && <Badge variant="outline" className="text-[10px]">{i.category}</Badge>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{i.unit}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(i.total_unit_cost, currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{fmt(i.client_unit_price, currency)}</td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        disabled={!isSel}
                        value={selected[i.id] ?? ""}
                        onChange={(e) => setSelected((s) => ({ ...s, [i.id]: parseFloat(e.target.value) || 0 }))}
                        className="h-7 text-right"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <DialogFooter className="border-t px-6 py-4 bg-muted/20 flex-wrap gap-3">
          <div className="flex items-center gap-3 mr-auto text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={autoGroup} onCheckedChange={(v) => setAutoGroup(!!v)} />
              Auto-group by category
            </label>
            {!autoGroup && (
              <Select value={targetGroup} onValueChange={setTargetGroup}>
                <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Target group" /></SelectTrigger>
                <SelectContent>
                  {groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="text-xs text-muted-foreground">{selectedList.length} selected</div>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={insert} disabled={saving || selectedList.length === 0}>
            {saving ? "Adding…" : `Insert ${selectedList.length || ""} line${selectedList.length === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}