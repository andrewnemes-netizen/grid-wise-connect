import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MapPin, Plus, Pencil, CheckCircle2, GitBranch, Trash2, Search, Layers } from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number | null | undefined, ccy = "GBP") =>
  n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(Number(n));

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: "bg-muted text-muted-foreground",
    APPROVED: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    SUPERSEDED: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  };
  return <Badge variant="outline" className={map[status] ?? ""}>{status}</Badge>;
}

export default function SiteEstimatesPanel({ wpId }: { wpId: string }) {
  const qc = useQueryClient();
  const [bulkOpen, setBulkOpen] = useState(false);
  const { data: wpSites = [] } = useQuery({
    queryKey: ["wp-sites-for-site-estimates", wpId],
    queryFn: async () => {
      const { data, error } = await supabase.from("wp_sites")
        .select("id, site_id, sequence, sites(id,name,address)")
        .eq("work_package_id", wpId)
        .order("sequence", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (wpSites.length === 0) {
    return <Card className="p-6 text-sm text-muted-foreground">No sites on this work package yet.</Card>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          Manage per-site estimates. Each site can have multiple versions; only APPROVED site estimates
          can be included in a WP estimate.
        </div>
        <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
          <Layers className="h-4 w-4 mr-1" /> Bulk apply recipe
        </Button>
      </div>
      <Accordion type="multiple" className="space-y-2">
        {wpSites.map((ws: any) => (
          <SiteRow key={ws.id} site={ws.sites} />
        ))}
      </Accordion>
      {bulkOpen && (
        <BulkApplyRecipeDialog
          wpSites={wpSites as any[]}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            (wpSites as any[]).forEach((ws) =>
              qc.invalidateQueries({ queryKey: ["site-estimates", ws.sites?.id] })
            );
          }}
        />
      )}
    </div>
  );
}

function SiteRow({ site }: { site: any }) {
  const qc = useQueryClient();
  const [editorId, setEditorId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const { data: estimates = [] } = useQuery({
    queryKey: ["site-estimates", site?.id],
    enabled: !!site?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("site_estimates")
        .select("*").eq("site_id", site.id).order("version_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["site-estimates", site?.id] });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("approve_site_estimate", { p_estimate_id: id, p_notes: null });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Site estimate approved"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Approve failed"),
  });

  const cloneToDraft = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).rpc("clone_site_estimate_to_draft", { p_estimate_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast.success("New draft version created"); invalidate();
      const newId = Array.isArray(d) ? d[0]?.id : d?.id;
      if (newId) setEditorId(newId);
    },
    onError: (e: any) => toast.error(e.message ?? "Clone failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("site_estimates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Draft deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  const latestApproved = (estimates as any[]).find((e) => e.status === "APPROVED");

  return (
    <AccordionItem value={site?.id} className="border rounded-lg bg-card">
      <AccordionTrigger className="px-4 hover:no-underline">
        <div className="flex items-center justify-between w-full pr-4 gap-3">
          <div className="flex items-center gap-2 text-left">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="font-medium">{site?.name ?? "—"}</div>
              <div className="text-xs text-muted-foreground">{site?.address ?? ""}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Latest approved</div>
              <div className="font-semibold">{latestApproved ? fmt(latestApproved.total_price, latestApproved.currency) : "—"}</div>
            </div>
            <Badge variant="outline">{estimates.length} version{estimates.length === 1 ? "" : "s"}</Badge>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">
        <div className="flex justify-end mb-2">
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New site estimate
          </Button>
        </div>
        {estimates.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">No site estimates yet.</Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(estimates as any[]).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.name}</TableCell>
                    <TableCell>v{e.version_number}</TableCell>
                    <TableCell><StatusBadge status={e.status} /></TableCell>
                    <TableCell className="text-right">{fmt(e.total_cost, e.currency)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(e.total_price, e.currency)}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => setEditorId(e.id)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />{e.status === "DRAFT" ? "Edit" : "View"}
                      </Button>
                      {e.status === "DRAFT" && (
                        <>
                          <Button size="sm" onClick={() => approve.mutate(e.id)} disabled={approve.isPending}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive"
                                  onClick={() => { if (confirm("Delete this draft?")) del.mutate(e.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                      {e.status === "APPROVED" && (
                        <Button size="sm" variant="outline" onClick={() => cloneToDraft.mutate(e.id)} disabled={cloneToDraft.isPending}>
                          <GitBranch className="h-3.5 w-3.5 mr-1" /> New version
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </AccordionContent>

      {newOpen && (
        <NewSiteEstimateDialog
          siteId={site.id}
          onClose={() => setNewOpen(false)}
          onCreated={(id) => { setNewOpen(false); invalidate(); setEditorId(id); }}
        />
      )}
      {editorId && (
        <SiteEstimateEditor
          estimateId={editorId}
          onClose={() => { setEditorId(null); invalidate(); }}
        />
      )}
    </AccordionItem>
  );
}

// -------- New site estimate dialog --------
function NewSiteEstimateDialog({
  siteId, onClose, onCreated,
}: { siteId: string; onClose: () => void; onCreated: (id: string) => void; }) {
  const [name, setName] = useState("Baseline");
  const [contractId, setContractId] = useState<string | undefined>();
  const [rateCardVersionId, setRateCardVersionId] = useState<string | undefined>();
  const [recipeId, setRecipeId] = useState<string | undefined>();
  const [seedFromRecipe, setSeedFromRecipe] = useState(true);
  const [saving, setSaving] = useState(false);

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-all-se"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("id,name,code").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: rateVersions = [] } = useQuery({
    enabled: !!contractId,
    queryKey: ["rate-versions-se", contractId],
    queryFn: async () => {
      const { data, error } = await supabase.from("rate_card_versions")
        .select("id, version_number, status, rate_cards!inner(name, contract_id)")
        .eq("rate_cards.contract_id", contractId!)
        .eq("status", "APPROVED")
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: recipes = [] } = useQuery({
    enabled: !!contractId,
    queryKey: ["recipes-se", contractId],
    queryFn: async () => {
      const { data, error } = await supabase.from("estimate_recipes")
        .select("id, name, status, version_number").eq("contract_id", contractId!)
        .eq("status", "APPROVED")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const submit = async () => {
    if (!name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      // find next version number
      const { data: existing } = await supabase.from("site_estimates")
        .select("version_number").eq("site_id", siteId).order("version_number", { ascending: false }).limit(1);
      const nextVer = ((existing?.[0] as any)?.version_number ?? 0) + 1;

      const { data: est, error } = await supabase.from("site_estimates").insert({
        site_id: siteId,
        name: name.trim(),
        contract_id: contractId ?? null,
        rate_card_version_id: rateCardVersionId ?? null,
        recipe_id: recipeId ?? null,
        status: "DRAFT",
        version_number: nextVer,
        created_by: user.user?.id ?? null,
      }).select().single();
      if (error) throw error;

      if (seedFromRecipe && recipeId) {
        // load recipe items and join to rate_items for cost/price defaults
        const { data: items } = await supabase.from("recipe_items")
          .select("*, rate_items(unit, total_unit_cost, client_unit_price, description)")
          .eq("recipe_id", recipeId)
          .order("sort_index");
        const rows = (items ?? []).map((r: any, i: number) => {
          const cost = Number(r.rate_items?.total_unit_cost ?? 0);
          const price = Number(r.rate_items?.client_unit_price ?? cost);
          const qty = Number(r.default_quantity ?? 0);
          return {
            site_estimate_id: (est as any).id,
            recipe_item_id: r.id,
            rate_item_id: r.rate_item_id,
            description: r.description_override ?? r.rate_items?.description ?? "",
            unit: r.unit ?? r.rate_items?.unit ?? null,
            quantity: qty,
            unit_cost: cost,
            unit_price: price,
            markup_amount: Number(r.markup_amount ?? 0),
            markup_pct: r.markup_pct != null ? Number(r.markup_pct) : null,
            line_cost: Number((qty * cost).toFixed(2)),
            line_price: Number((qty * price).toFixed(2)),
            stage: r.stage,
            cost_code: r.cost_code,
            cost_code_category: r.cost_code_category,
            is_allowance: !!r.is_allowance,
            sort_index: i,
          };
        });
        if (rows.length > 0) {
          const { error: e2 } = await supabase.from("site_estimate_lines").insert(rows);
          if (e2) throw e2;
        }
      }

      toast.success("Draft site estimate created");
      onCreated((est as any).id);
    } catch (e: any) {
      toast.error(e.message ?? "Could not create");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New site estimate</DialogTitle>
          <DialogDescription>Optionally seed lines from a recipe. Version increments automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>Contract</Label>
            <Select value={contractId} onValueChange={(v) => { setContractId(v); setRateCardVersionId(undefined); setRecipeId(undefined); }}>
              <SelectTrigger><SelectValue placeholder="Select contract" /></SelectTrigger>
              <SelectContent>
                {contracts.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {contractId && (
            <>
              <div>
                <Label>Rate card version</Label>
                <Select value={rateCardVersionId} onValueChange={setRateCardVersionId}>
                  <SelectTrigger><SelectValue placeholder="Select rate card version" /></SelectTrigger>
                  <SelectContent>
                    {rateVersions.map((v: any) => (
                      <SelectItem key={v.id} value={v.id}>{v.rate_cards?.name} v{v.version_number} ({v.status})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Recipe (optional)</Label>
                <Select value={recipeId} onValueChange={setRecipeId}>
                  <SelectTrigger><SelectValue placeholder="Select recipe" /></SelectTrigger>
                  <SelectContent>
                    {recipes.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name} v{r.version_number}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {recipeId && (
                <div className="flex items-center gap-2">
                  <Switch checked={seedFromRecipe} onCheckedChange={setSeedFromRecipe} />
                  <Label className="text-sm">Seed lines from recipe</Label>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>Create draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- Site estimate editor dialog --------
function SiteEstimateEditor({ estimateId, onClose }: { estimateId: string; onClose: () => void; }) {
  const qc = useQueryClient();

  const { data: estimate, refetch: refetchEstimate } = useQuery({
    queryKey: ["site-estimate-edit", estimateId],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_estimates").select("*").eq("id", estimateId).single();
      if (error) throw error;
      return data as any;
    },
  });
  const { data: lines = [], refetch: refetchLines } = useQuery({
    queryKey: ["site-estimate-lines-edit", estimateId],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_estimate_lines")
        .select("*").eq("site_estimate_id", estimateId).order("sort_index");
      if (error) throw error;
      return data ?? [];
    },
  });

  const isApproved = estimate?.status === "APPROVED" || estimate?.status === "SUPERSEDED";
  const ccy = estimate?.currency ?? "GBP";

  const totals = useMemo(() => {
    const cost = (lines as any[]).reduce((s, r) => s + Number(r.line_cost || 0), 0);
    const price = (lines as any[]).reduce((s, r) => s + Number(r.line_price || 0), 0);
    return { cost, price, markup: price - cost };
  }, [lines]);

  const persistTotals = async () => {
    if (!estimate || isApproved) return;
    await supabase.from("site_estimates").update({
      total_cost: totals.cost, total_price: totals.price, total_markup: totals.markup,
    }).eq("id", estimateId);
    await refetchEstimate();
    qc.invalidateQueries({ queryKey: ["site-estimates", estimate.site_id] });
  };

  const updateLine = async (id: string, patch: any) => {
    // recompute line totals if qty/cost/price changed
    const cur = (lines as any[]).find((l) => l.id === id);
    const merged = { ...cur, ...patch };
    const qty = Number(merged.quantity ?? 0);
    const uc = Number(merged.unit_cost ?? 0);
    const up = Number(merged.unit_price ?? 0);
    patch.line_cost = Number((qty * uc).toFixed(2));
    patch.line_price = Number((qty * up).toFixed(2));
    const { error } = await supabase.from("site_estimate_lines").update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await refetchLines();
    await persistTotals();
  };

  const deleteLine = async (id: string) => {
    const { error } = await supabase.from("site_estimate_lines").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await refetchLines();
    await persistTotals();
  };

  const addLine = async (rate: any) => {
    const cost = Number(rate?.total_unit_cost ?? 0);
    const price = Number(rate?.client_unit_price ?? cost);
    const { error } = await supabase.from("site_estimate_lines").insert({
      site_estimate_id: estimateId,
      rate_item_id: rate?.id ?? null,
      rate_code: rate?.rate_code ?? null,
      description: rate?.description ?? "New line",
      unit: rate?.unit ?? null,
      quantity: 1, unit_cost: cost, unit_price: price,
      line_cost: cost, line_price: price,
      sort_index: (lines as any[]).length,
    });
    if (error) { toast.error(error.message); return; }
    await refetchLines();
    await persistTotals();
  };

  const addBlankLine = () => addLine({});

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {estimate?.name} <span className="text-sm text-muted-foreground">v{estimate?.version_number} · {estimate?.status}</span>
          </DialogTitle>
          <DialogDescription>Edit line items. Totals recompute automatically on any change.</DialogDescription>
        </DialogHeader>

        {isApproved && (
          <Card className="p-3 text-sm bg-amber-500/10 border-amber-500/30">
            This estimate is {estimate?.status} and read-only. Use “New version” to make changes.
          </Card>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3"><div className="text-xs text-muted-foreground">Total cost</div><div className="text-lg font-semibold">{fmt(totals.cost, ccy)}</div></Card>
          <Card className="p-3"><div className="text-xs text-muted-foreground">Total markup</div><div className="text-lg font-semibold">{fmt(totals.markup, ccy)}</div></Card>
          <Card className="p-3 border-primary/40 bg-primary/5"><div className="text-xs text-muted-foreground">Total price</div><div className="text-lg font-semibold text-primary">{fmt(totals.price, ccy)}</div></Card>
        </div>

        {!isApproved && (
          <div className="flex justify-between items-center">
            <RateItemPicker
              rateCardVersionId={estimate?.rate_card_version_id}
              onPick={addLine}
            />
            <Button size="sm" variant="outline" onClick={addBlankLine}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Blank line
            </Button>
          </div>
        )}

        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Code</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-16">Unit</TableHead>
                <TableHead className="w-20 text-right">Qty</TableHead>
                <TableHead className="w-24 text-right">Unit cost</TableHead>
                <TableHead className="w-24 text-right">Unit price</TableHead>
                <TableHead className="w-24 text-right">Line cost</TableHead>
                <TableHead className="w-24 text-right">Line price</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lines as any[]).map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="text-xs">{l.rate_code ?? "—"}</TableCell>
                  <TableCell>
                    <Input value={l.description ?? ""} disabled={isApproved}
                           onChange={(e) => updateLine(l.id, { description: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input value={l.unit ?? ""} disabled={isApproved} className="w-16"
                           onChange={(e) => updateLine(l.id, { unit: e.target.value })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input type="number" step="0.01" value={l.quantity ?? 0} disabled={isApproved} className="text-right w-20"
                           onChange={(e) => updateLine(l.id, { quantity: Number(e.target.value || 0) })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input type="number" step="0.01" value={l.unit_cost ?? 0} disabled={isApproved} className="text-right w-24"
                           onChange={(e) => updateLine(l.id, { unit_cost: Number(e.target.value || 0) })} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input type="number" step="0.01" value={l.unit_price ?? 0} disabled={isApproved} className="text-right w-24"
                           onChange={(e) => updateLine(l.id, { unit_price: Number(e.target.value || 0) })} />
                  </TableCell>
                  <TableCell className="text-right text-sm">{fmt(l.line_cost, ccy)}</TableCell>
                  <TableCell className="text-right font-medium">{fmt(l.line_price, ccy)}</TableCell>
                  <TableCell className="text-right">
                    {!isApproved && (
                      <Button size="icon" variant="ghost" onClick={() => deleteLine(l.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {lines.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">No lines yet. Add from the rate library or a blank line.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </Card>

        <div>
          <Label className="text-xs">Notes</Label>
          <Textarea rows={2} defaultValue={estimate?.notes ?? ""} disabled={isApproved}
                    onBlur={async (e) => {
                      await supabase.from("site_estimates").update({ notes: e.target.value }).eq("id", estimateId);
                      refetchEstimate();
                    }} />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- Rate item search popover --------
function RateItemPicker({
  rateCardVersionId, onPick,
}: { rateCardVersionId?: string | null; onPick: (rate: any) => void; }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const { data: rates = [] } = useQuery({
    enabled: open,
    queryKey: ["rate-items-picker", rateCardVersionId, q],
    queryFn: async () => {
      let query = supabase.from("rate_items")
        .select("id, rate_code, description, unit, total_unit_cost, client_unit_price")
        .limit(30);
      if (rateCardVersionId) query = query.eq("rate_card_version_id", rateCardVersionId);
      if (q.trim()) query = query.or(`description.ilike.%${q}%,rate_code.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline"><Search className="h-3.5 w-3.5 mr-1" /> Add from rate library</Button>
      </PopoverTrigger>
      <PopoverContent className="w-[520px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search by code or description…" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>No matching rate items.</CommandEmpty>
            {(rates as any[]).map((r) => (
              <CommandItem key={r.id} value={r.id} onSelect={() => { onPick(r); setOpen(false); setQ(""); }}>
                <div className="flex flex-col w-full">
                  <div className="flex justify-between">
                    <span className="font-medium text-xs">{r.rate_code}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.total_unit_cost != null ? `£${Number(r.total_unit_cost).toFixed(2)}` : "—"} / {r.unit ?? "—"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{r.description}</div>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
// -------- Bulk apply recipe to WP sites --------
function BulkApplyRecipeDialog({
  wpSites, onClose, onDone,
}: { wpSites: any[]; onClose: () => void; onDone: () => void; }) {
  const [contractId, setContractId] = useState<string | undefined>();
  const [rateCardVersionId, setRateCardVersionId] = useState<string | undefined>();
  const [recipeId, setRecipeId] = useState<string | undefined>();
  const [name, setName] = useState("Baseline");
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries((wpSites ?? []).map((ws) => [ws.sites?.id, true]))
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; errors: string[] }>({ done: 0, total: 0, errors: [] });

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-all-bulk"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("id,name,code").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: rateVersions = [] } = useQuery({
    enabled: !!contractId,
    queryKey: ["rate-versions-bulk", contractId],
    queryFn: async () => {
      const { data, error } = await supabase.from("rate_card_versions")
        .select("id, version_number, status, rate_cards!inner(name, contract_id)")
        .eq("rate_cards.contract_id", contractId!)
        .eq("status", "APPROVED")
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: recipes = [] } = useQuery({
    enabled: !!contractId,
    queryKey: ["recipes-bulk", contractId],
    queryFn: async () => {
      const { data, error } = await supabase.from("estimate_recipes")
        .select("id, name, status, version_number").eq("contract_id", contractId!)
        .eq("status", "APPROVED")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const chosenSiteIds = Object.keys(selected).filter((k) => selected[k]);
  const canRun = !!contractId && !!recipeId && chosenSiteIds.length > 0 && !!name.trim();

  const toggleAll = (v: boolean) => {
    const next: Record<string, boolean> = {};
    wpSites.forEach((ws) => { if (ws.sites?.id) next[ws.sites.id] = v; });
    setSelected(next);
  };

  const run = async () => {
    if (!canRun) return;
    setRunning(true);
    setProgress({ done: 0, total: chosenSiteIds.length, errors: [] });

    // Load recipe items once
    const { data: items, error: iErr } = await supabase.from("recipe_items")
      .select("*, rate_items(unit, total_unit_cost, client_unit_price, description)")
      .eq("recipe_id", recipeId!)
      .order("sort_index");
    if (iErr) { toast.error(iErr.message); setRunning(false); return; }

    const { data: userRes } = await supabase.auth.getUser();
    const userId = userRes.user?.id ?? null;

    for (const siteId of chosenSiteIds) {
      try {
        const { data: existing } = await supabase.from("site_estimates")
          .select("version_number").eq("site_id", siteId)
          .order("version_number", { ascending: false }).limit(1);
        const nextVer = ((existing?.[0] as any)?.version_number ?? 0) + 1;

        const { data: est, error } = await supabase.from("site_estimates").insert({
          site_id: siteId,
          name: name.trim(),
          contract_id: contractId ?? null,
          rate_card_version_id: rateCardVersionId ?? null,
          recipe_id: recipeId ?? null,
          status: "DRAFT",
          version_number: nextVer,
          created_by: userId,
        }).select().single();
        if (error) throw error;

        const rows = (items ?? []).map((r: any, i: number) => {
          const cost = Number(r.rate_items?.total_unit_cost ?? 0);
          const price = Number(r.rate_items?.client_unit_price ?? cost);
          const qty = Number(r.default_quantity ?? 0);
          return {
            site_estimate_id: (est as any).id,
            recipe_item_id: r.id,
            rate_item_id: r.rate_item_id,
            description: r.description_override ?? r.rate_items?.description ?? "",
            unit: r.unit ?? r.rate_items?.unit ?? null,
            quantity: qty,
            unit_cost: cost,
            unit_price: price,
            markup_amount: Number(r.markup_amount ?? 0),
            markup_pct: r.markup_pct != null ? Number(r.markup_pct) : null,
            line_cost: Number((qty * cost).toFixed(2)),
            line_price: Number((qty * price).toFixed(2)),
            stage: r.stage,
            cost_code: r.cost_code,
            cost_code_category: r.cost_code_category,
            is_allowance: !!r.is_allowance,
            sort_index: i,
          };
        });
        if (rows.length > 0) {
          const { error: e2 } = await supabase.from("site_estimate_lines").insert(rows);
          if (e2) throw e2;
        }
        // roll up totals on the estimate
        const totalCost = rows.reduce((s, r) => s + Number(r.line_cost || 0), 0);
        const totalPrice = rows.reduce((s, r) => s + Number(r.line_price || 0), 0);
        await supabase.from("site_estimates").update({
          total_cost: totalCost, total_price: totalPrice, total_markup: totalPrice - totalCost,
        }).eq("id", (est as any).id);

        setProgress((p) => ({ ...p, done: p.done + 1 }));
      } catch (e: any) {
        const siteName = wpSites.find((ws) => ws.sites?.id === siteId)?.sites?.name ?? siteId;
        setProgress((p) => ({ ...p, done: p.done + 1, errors: [...p.errors, `${siteName}: ${e.message ?? "failed"}`] }));
      }
    }

    setRunning(false);
    toast.success(`Applied recipe to ${chosenSiteIds.length} site(s)`);
    // brief delay so user can see final state
    setTimeout(() => onDone(), 400);
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !running) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk apply recipe to sites</DialogTitle>
          <DialogDescription>
            Creates a new DRAFT site estimate on each selected site, seeded from the chosen recipe.
            Existing estimates are not touched — a new version is added per site.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Estimate name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Contract</Label>
            <Select value={contractId} onValueChange={(v) => { setContractId(v); setRateCardVersionId(undefined); setRecipeId(undefined); }}>
              <SelectTrigger><SelectValue placeholder="Select contract" /></SelectTrigger>
              <SelectContent>
                {contracts.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Rate card version</Label>
            <Select value={rateCardVersionId} onValueChange={setRateCardVersionId} disabled={!contractId}>
              <SelectTrigger><SelectValue placeholder="Select rate card" /></SelectTrigger>
              <SelectContent>
                {rateVersions.map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>{v.rate_cards?.name} v{v.version_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Recipe</Label>
            <Select value={recipeId} onValueChange={setRecipeId} disabled={!contractId}>
              <SelectTrigger><SelectValue placeholder="Select recipe" /></SelectTrigger>
              <SelectContent>
                {recipes.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name} v{r.version_number}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border rounded-md">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="text-sm font-medium">Target sites ({chosenSiteIds.length}/{wpSites.length})</div>
            <div className="space-x-2">
              <Button size="sm" variant="ghost" onClick={() => toggleAll(true)}>Select all</Button>
              <Button size="sm" variant="ghost" onClick={() => toggleAll(false)}>Clear</Button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y">
            {wpSites.map((ws: any) => (
              <label key={ws.id} className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                <Checkbox
                  checked={!!selected[ws.sites?.id]}
                  onCheckedChange={(v) => setSelected((s) => ({ ...s, [ws.sites?.id]: !!v }))}
                />
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="flex-1">
                  <div className="font-medium">{ws.sites?.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{ws.sites?.address ?? ""}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {progress.total > 0 && (
          <Card className="p-3 text-sm">
            <div>Progress: {progress.done} / {progress.total}</div>
            {progress.errors.length > 0 && (
              <div className="text-destructive text-xs mt-2 space-y-1">
                {progress.errors.map((e, i) => <div key={i}>• {e}</div>)}
              </div>
            )}
          </Card>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={running}>Cancel</Button>
          <Button onClick={run} disabled={!canRun || running}>
            {running ? "Applying…" : `Apply to ${chosenSiteIds.length} site(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
