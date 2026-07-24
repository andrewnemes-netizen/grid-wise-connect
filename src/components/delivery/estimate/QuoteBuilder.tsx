import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { X, ChevronDown, ChevronRight, Library, CheckCircle2, ArrowLeft, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number | null | undefined, ccy = "GBP") =>
  n == null || Number.isNaN(n)
    ? "—"
    : new Intl.NumberFormat("en-GB", { style: "currency", currency: ccy, minimumFractionDigits: 2 }).format(Number(n));

/**
 * Replaces the old "search & insert one line at a time into a group"
 * workflow. A quote now works like this:
 *
 *   1. Pick ONE rate card for the whole quote (defaults sensibly by kind).
 *   2. See every item from that rate card, grouped by category — same
 *      layout as the Rate Card Library page — with a quantity field on
 *      each row.
 *   3. Totals (cost, price, markup %, profit) update live as quantities
 *      change. Saving only persists lines with quantity > 0.
 *
 * Used identically for both EV Build and PoC/ICP estimates — the only
 * difference is which rate card defaults to primary vs fallback.
 */
/** Natural sort for rate codes like "1.01", "1.10", "2.01", "10.03" — plain
 *  alphabetical sort would put "1.10" before "1.2" and "10.01" before "2.01". */
function compareCodes(a?: string | null, b?: string | null) {
  const pa = String(a ?? "").split(/(\d+)/).filter(Boolean);
  const pb = String(b ?? "").split(/(\d+)/).filter(Boolean);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const sa = pa[i] ?? "", sb = pb[i] ?? "";
    const numeric = /^\d+$/.test(sa) && /^\d+$/.test(sb);
    if (numeric) {
      const diff = Number(sa) - Number(sb);
      if (diff !== 0) return diff;
    } else if (sa !== sb) {
      return sa.localeCompare(sb);
    }
  }
  return 0;
}

export function QuoteBuilder({ estimateId, onClose }: { estimateId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [qtyEdits, setQtyEdits] = useState<Record<string, string>>({});
  const [priceEdits, setPriceEdits] = useState<Record<string, { cost?: string; price?: string }>>({});
  const [saving, setSaving] = useState(false);
  const [pickerVersionId, setPickerVersionId] = useState<string>("");

  const { data: estimate, isLoading: estimateLoading, error: estimateError } = useQuery({
    queryKey: ["quote-builder-estimate", estimateId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimates" as any)
        .select(`
          id, name, kind, currency, status, rate_card_version_id, total_cost, total_price,
          site:sites(id, site_name, postcode),
          work_package:work_packages(id, code, name)
        `)
        .eq("id", estimateId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const versionId = (estimate as any)?.rate_card_version_id as string | undefined;

  // Rate card options, tagged primary/fallback exactly as in the picker
  // used elsewhere, so the default suggested here matches what people are
  // already used to.
  const { data: versionOptions = [] } = useQuery({
    queryKey: ["quote-builder-rate-versions", (estimate as any)?.kind],
    enabled: !!estimate && !versionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_card_versions" as any)
        .select("id, version_number, status, rate_cards!inner(name)")
        .in("status", ["APPROVED", "DRAFT"])
        .order("status", { ascending: true })
        .order("version_number", { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as any[];
      const kind = (estimate as any)?.kind;
      const nameOf = (v: any) => (v.rate_cards?.name ?? "").toLowerCase();
      const isMsa = (v: any) => nameOf(v).includes("msa");
      const isPrimary = (v: any) => {
        if (isMsa(v)) return false;
        if (kind === "build") return nameOf(v).includes("synthetic");
        if (kind === "poc") return nameOf(v).includes("icp");
        return false;
      };
      const rank = (v: any) => (isPrimary(v) ? 0 : isMsa(v) ? 2 : 1);
      return [...list].sort((a, b) => rank(a) - rank(b)).map((v) => ({
        ...v, _tag: isMsa(v) ? "fallback" : isPrimary(v) ? "primary" : null,
      }));
    },
  });

  const { data: rateCardMeta } = useQuery({
    queryKey: ["quote-builder-rate-card-meta", versionId],
    enabled: !!versionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_card_versions" as any)
        .select("id, version_number, status, rate_card:rate_cards(name)")
        .eq("id", versionId!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: items = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["quote-builder-items", versionId],
    enabled: !!versionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_items" as any)
        .select("id, rate_code, description, unit, category, total_unit_cost, client_unit_price, award_code, needs_pricing")
        .eq("rate_card_version_id", versionId!)
        .order("category").order("description");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: existingLines = [] } = useQuery({
    queryKey: ["quote-builder-lines", estimateId],
    enabled: !!estimateId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("estimate_lines" as any)
        .select("id, rate_item_id, qty")
        .eq("estimate_id", estimateId);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const lineByItem = useMemo(() => {
    const m = new Map<string, { id: string; qty: number }>();
    for (const l of existingLines as any[]) if (l.rate_item_id) m.set(l.rate_item_id, l);
    return m;
  }, [existingLines]);

  const qtyOf = (itemId: string) => {
    if (itemId in qtyEdits) return qtyEdits[itemId];
    return String(lineByItem.get(itemId)?.qty ?? 0);
  };

  const costOf = (it: any): number => {
    const edit = priceEdits[it.id]?.cost;
    return edit != null && edit !== "" ? Number(edit) : Number(it.total_unit_cost ?? 0);
  };
  const priceOf = (it: any): number => {
    const edit = priceEdits[it.id]?.price;
    return edit != null && edit !== "" ? Number(edit) : Number(it.client_unit_price ?? 0);
  };

  const grouped = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const it of items as any[]) {
      const k = it.category?.trim() || "Uncategorised";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    for (const arr of m.values()) arr.sort((a, b) => compareCodes(a.rate_code, b.rate_code));
    return Array.from(m.entries()).sort((a, b) => compareCodes(a[1][0]?.rate_code, b[1][0]?.rate_code));
  }, [items]);

  const totals = useMemo(() => {
    let cost = 0, price = 0;
    const byAward: Record<string, number> = { C: 0, I: 0, E: 0, "": 0 };
    for (const it of items as any[]) {
      const qty = Number(qtyOf(it.id)) || 0;
      if (qty <= 0) continue;
      const lineCost = qty * costOf(it);
      const linePrice = qty * priceOf(it);
      cost += lineCost;
      price += linePrice;
      const code = it.award_code && ["C", "I", "E"].includes(it.award_code) ? it.award_code : "";
      byAward[code] = (byAward[code] ?? 0) + linePrice;
    }
    const profit = price - cost;
    const markupPct = cost > 0 ? (profit / cost) * 100 : 0;
    return { cost, price, profit, markupPct, byAward };
  }, [items, qtyEdits, existingLines, priceEdits]);

  const dirtyCount = Object.keys(qtyEdits).length + Object.keys(priceEdits).length;
  const c = (estimate as any)?.currency ?? "GBP";

  const toggleGroup = (name: string) => setCollapsed((c) => ({ ...c, [name]: !c[name] }));

  const chooseRateCard = async (vId: string) => {
    const { error } = await supabase.from("estimates" as any).update({ rate_card_version_id: vId }).eq("id", estimateId);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ["quote-builder-estimate", estimateId] });
  };

  const save = async () => {
    if (dirtyCount === 0) return;
    setSaving(true);
    try {
      const toInsert: any[] = [];
      const toUpdate: { id: string; qty: number }[] = [];
      const toDelete: string[] = [];

      for (const [itemId, raw] of Object.entries(qtyEdits)) {
        const qty = Number(raw) || 0;
        const existing = lineByItem.get(itemId);
        const item = (items as any[]).find((i) => i.id === itemId);
        if (!item) continue;
        if (qty <= 0) {
          if (existing) toDelete.push(existing.id);
          continue;
        }
        if (existing) {
          if (existing.qty !== qty) toUpdate.push({ id: existing.id, qty });
        } else {
          const cost = costOf(item);
          const price = priceOf(item) || cost;
          toInsert.push({
            estimate_id: estimateId,
            rate_item_id: item.id,
            rate_card_version_id: versionId,
            rate_code: item.rate_code,
            boq_item_name: item.description,
            boq_description: item.description,
            item_logic: "SUPPLY_AND_INSTALL",
            qty,
            uom: item.unit ?? "ea",
            unit_cost: cost,
            markup_type: "Amount",
            markup_dollar: Math.max(0, price - cost),
            markup_pct: 0,
            contingency_pct: 0,
            discount: 0,
            vat_rate: 20,
            cost_category: item.category ?? null,
            product_service: item.rate_code ?? null,
          });
        }
      }

      // Persist any pricing completions (cost/price filled in for
      // previously-unpriced items) back onto the rate card itself. The
      // relaxed immutability trigger allows this even on an APPROVED
      // version, as long as it's only completing a missing value.
      for (const [itemId, patch] of Object.entries(priceEdits)) {
        const item = (items as any[]).find((i) => i.id === itemId);
        if (!item) continue;
        const upd: any = {};
        if (patch.cost != null && patch.cost !== "") upd.total_unit_cost = Number(patch.cost);
        if (patch.price != null && patch.price !== "") upd.client_unit_price = Number(patch.price);
        if (Object.keys(upd).length === 0) continue;
        const newCost = upd.total_unit_cost ?? item.total_unit_cost ?? 0;
        const newPrice = upd.client_unit_price ?? item.client_unit_price ?? 0;
        upd.needs_pricing = !(newCost > 0 && newPrice > 0);
        const { error } = await supabase.from("rate_items" as any).update(upd).eq("id", itemId);
        if (error) throw error;
      }

      if (toInsert.length) {
        const { error } = await supabase.from("estimate_lines" as any).insert(toInsert);
        if (error) throw error;
      }
      for (const u of toUpdate) {
        const { error } = await supabase.from("estimate_lines" as any).update({ qty: u.qty }).eq("id", u.id);
        if (error) throw error;
      }
      if (toDelete.length) {
        const { error } = await supabase.from("estimate_lines" as any).delete().in("id", toDelete);
        if (error) throw error;
      }

      toast.success("Quote saved");
      setQtyEdits({});
      setPriceEdits({});
      qc.invalidateQueries({ queryKey: ["quote-builder-lines", estimateId] });
      qc.invalidateQueries({ queryKey: ["quote-builder-estimate", estimateId] });
      qc.invalidateQueries({ queryKey: ["quote-builder-items", versionId] });
      qc.invalidateQueries({ queryKey: ["estimates-list"] });
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (estimateLoading) return <div className="p-8 text-sm text-muted-foreground">Loading quote…</div>;
  if (estimateError) return (
    <div className="p-8 text-sm text-destructive space-y-2">
      <div className="font-medium">Couldn't load this quote.</div>
      <div className="text-xs font-mono bg-destructive/10 rounded p-2 whitespace-pre-wrap">
        {(estimateError as any)?.message ?? String(estimateError)}
      </div>
    </div>
  );
  if (!estimate) return <div className="p-8 text-sm text-muted-foreground">Estimate not found.</div>;

  const e: any = estimate;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            {e.site?.site_name ?? "No site assigned"}
            <Badge variant="outline">{e.kind === "poc" ? "ICP / PoC Quote" : "EV Build Quote"}</Badge>
          </div>
          <div className="text-xs text-muted-foreground">
            {e.work_package?.name ?? e.work_package?.code ?? "—"}
            {rateCardMeta && <> · {rateCardMeta.rate_card?.name} v{rateCardMeta.version_number} ({rateCardMeta.status})</>}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Stat label="Cost" value={fmt(totals.cost, c)} />
          <Stat label="Price" value={fmt(totals.price, c)} />
          <Stat label="Markup" value={`${totals.markupPct.toFixed(1)}%`} />
          <Stat label="Profit" value={fmt(totals.profit, c)} accent />
          {versionId && (
            <Button onClick={save} disabled={saving || dirtyCount === 0}>
              <CheckCircle2 className="h-4 w-4 mr-1.5" /> Save {dirtyCount || ""} change{dirtyCount === 1 ? "" : "s"}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
      </div>

      {versionId && (totals.byAward.C > 0 || totals.byAward.I > 0 || totals.byAward.E > 0) && (
        <div className="flex items-center gap-4 border-b px-4 py-1.5 text-xs bg-muted/20">
          <span className="text-muted-foreground">Award breakdown:</span>
          <span><Badge variant="outline" className="mr-1">C</Badge>Civils {fmt(totals.byAward.C, c)}</span>
          <span><Badge variant="outline" className="mr-1">I</Badge>ICP {fmt(totals.byAward.I, c)}</span>
          <span><Badge variant="outline" className="mr-1">E</Badge>Electrical {fmt(totals.byAward.E, c)}</span>
          {totals.byAward[""] > 0 && <span className="text-muted-foreground">Unassigned scope {fmt(totals.byAward[""], c)}</span>}
          {e.work_package?.id && (
            <Link to={`/wp/${e.work_package.id}/delivery/partners`} className="ml-auto text-primary hover:underline">
              Manage scope awards →
            </Link>
          )}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {!versionId ? (
          <div className="max-w-xl mx-auto p-8 space-y-4">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <Library className="h-5 w-5" /> Choose a rate card for this quote
            </div>
            <p className="text-sm text-muted-foreground">
              This quote will be built entirely from one rate card. You can see the full item list and enter
              quantities once you've picked one.
            </p>
            <div className="space-y-2">
              {versionOptions.map((v: any) => (
                <button
                  key={v.id}
                  onClick={() => chooseRateCard(v.id)}
                  className="w-full flex items-center justify-between rounded-md border px-4 py-3 text-left hover:bg-muted/40"
                >
                  <span className="text-sm font-medium">
                    {v.rate_cards?.name} — v{v.version_number} ({v.status})
                  </span>
                  {v._tag === "primary" && <Badge>Primary</Badge>}
                  {v._tag === "fallback" && <Badge variant="secondary">Fallback (MSA)</Badge>}
                </button>
              ))}
              {versionOptions.length === 0 && (
                <Alert><AlertDescription>No rate cards available yet — add one in Admin → Estimating & Quotes.</AlertDescription></Alert>
              )}
            </div>
            <div className="pt-2">
              <Link to="/admin?tab=estimating" className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Manage rate cards
              </Link>
            </div>
          </div>
        ) : (
          <Card className="m-4 p-0 overflow-hidden">
            <CardHeader className="py-2 px-4 border-b bg-muted/20 text-xs text-muted-foreground">
              {itemsLoading ? "Loading items…" : `${items.length} items across ${grouped.length} group${grouped.length === 1 ? "" : "s"} — only items with a quantity are included in the quote`}
            </CardHeader>
            <CardContent className="p-0">
              {grouped.map(([groupName, groupItems]) => {
                const isCollapsed = !!collapsed[groupName];
                const groupTotal = (groupItems as any[]).reduce((sum, it) => sum + (Number(qtyOf(it.id)) || 0) * priceOf(it), 0);
                return (
                  <div key={groupName} className="border-b last:border-b-0">
                    <button
                      className="w-full flex items-center gap-2 px-4 py-2 bg-muted/30 hover:bg-muted/50 text-left"
                      onClick={() => toggleGroup(groupName)}
                    >
                      {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      <span className="text-sm font-medium">{groupName}</span>
                      <span className="text-xs text-muted-foreground">({(groupItems as any[]).length} items)</span>
                      {groupTotal > 0 && <span className="ml-auto text-xs font-medium">{fmt(groupTotal, c)}</span>}
                    </button>
                    {!isCollapsed && (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-20">Unit</TableHead>
                            <TableHead className="w-14 text-center">Award</TableHead>
                            <TableHead className="w-28 text-right">Unit Cost</TableHead>
                            <TableHead className="w-28 text-right">Unit Price</TableHead>
                            <TableHead className="w-24 text-center">Qty</TableHead>
                            <TableHead className="w-28 text-right">Line Cost</TableHead>
                            <TableHead className="w-28 text-right">Line Price</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(groupItems as any[]).map((it: any) => {
                            const qtyStr = qtyOf(it.id);
                            const qty = Number(qtyStr) || 0;
                            const cost = costOf(it);
                            const price = priceOf(it);
                            const lineCost = qty * cost;
                            const linePrice = qty * price;
                            const pEdit = priceEdits[it.id] ?? {};
                            return (
                              <TableRow key={it.id} className={qty > 0 ? "bg-primary/5" : ""}>
                                <TableCell className="text-xs">
                                  {it.description}
                                  {it.needs_pricing && <AlertTriangle className="h-3 w-3 inline ml-1.5 text-amber-500" />}
                                </TableCell>
                                <TableCell className="text-xs">{it.unit}</TableCell>
                                <TableCell className="text-center">
                                  {it.award_code ? <Badge variant="outline" className="text-[10px]">{it.award_code}</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                                </TableCell>
                                <TableCell className="text-xs text-right">
                                  {it.needs_pricing ? (
                                    <Input type="number" step="0.01" placeholder="Set cost"
                                      className="h-8 text-right text-xs"
                                      value={pEdit.cost ?? (it.total_unit_cost ? String(it.total_unit_cost) : "")}
                                      onChange={(e) => setPriceEdits((prev) => ({ ...prev, [it.id]: { ...prev[it.id], cost: e.target.value } }))}
                                    />
                                  ) : fmt(it.total_unit_cost, c)}
                                </TableCell>
                                <TableCell className="text-xs text-right">
                                  {it.needs_pricing ? (
                                    <Input type="number" step="0.01" placeholder="Set price"
                                      className="h-8 text-right text-xs"
                                      value={pEdit.price ?? (it.client_unit_price ? String(it.client_unit_price) : "")}
                                      onChange={(e) => setPriceEdits((prev) => ({ ...prev, [it.id]: { ...prev[it.id], price: e.target.value } }))}
                                    />
                                  ) : fmt(it.client_unit_price, c)}
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number" min="0" step="1"
                                    className="h-8 text-center text-xs"
                                    value={qtyStr === "0" ? "" : qtyStr}
                                    placeholder="0"
                                    onChange={(e) => setQtyEdits((prev) => ({ ...prev, [it.id]: e.target.value === "" ? "0" : e.target.value }))}
                                  />
                                </TableCell>
                                <TableCell className="text-xs text-right">{qty > 0 ? fmt(lineCost, c) : "—"}</TableCell>
                                <TableCell className="text-xs text-right font-medium">{qty > 0 ? fmt(linePrice, c) : "—"}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-right">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
