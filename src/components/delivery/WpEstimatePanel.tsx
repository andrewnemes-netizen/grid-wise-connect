import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Receipt, TrendingUp, MapPin, SlidersHorizontal, Plus, Pencil, CheckCircle2, GitBranch, Trash2 } from "lucide-react";
import { toast } from "sonner";
import WpEstimateVariations from "./WpEstimateVariations";

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

export default function WpEstimatePanel({ wpId }: { wpId: string }) {
  const qc = useQueryClient();
  const [editorId, setEditorId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ["wp-estimates", wpId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_package_estimates")
        .select("*")
        .eq("work_package_id", wpId)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["wp-estimates", wpId] });
  };

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).rpc("approve_wp_estimate", { p_estimate_id: id, p_notes: null });
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("WP estimate approved"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Approve failed"),
  });

  const cloneToDraft = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await (supabase as any).rpc("clone_wp_estimate_to_draft", { p_estimate_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: (d: any) => {
      toast.success("New draft version created");
      invalidate();
      const newId = Array.isArray(d) ? d[0]?.id : d?.id;
      if (newId) setEditorId(newId);
    },
    onError: (e: any) => toast.error(e.message ?? "Clone failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("work_package_estimates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Draft deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  if (isLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">Loading estimates…</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          WP estimates roll up per-site estimates and add WP-level adjustments (contingency,
          prelims, overheads, discounts).
        </div>
        <Button size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New estimate
        </Button>
      </div>

      {estimates.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <Receipt className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="font-medium">No work-package estimates yet</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Click <b>New estimate</b> to create a DRAFT, then include site estimates and adjustments.
          </p>
        </Card>
      ) : (
      <Accordion type="single" collapsible defaultValue={estimates[0].id} className="space-y-3">
        {estimates.map((e: any) => (
          <AccordionItem key={e.id} value={e.id} className="border rounded-lg bg-card">
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center justify-between w-full pr-4 gap-3">
                <div className="flex items-center gap-3 text-left">
                  <div>
                    <div className="font-medium">{e.name}</div>
                    <div className="text-xs text-muted-foreground">
                      v{e.version_number} · {new Date(e.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Total price</div>
                    <div className="font-semibold">{fmt(e.total_price, e.currency)}</div>
                  </div>
                  <StatusBadge status={e.status} />
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="flex flex-wrap gap-2 mb-3">
                {e.status === "DRAFT" && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => setEditorId(e.id)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>
                    <Button size="sm" onClick={() => approve.mutate(e.id)} disabled={approve.isPending}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive"
                            onClick={() => { if (confirm("Delete this draft estimate?")) del.mutate(e.id); }}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  </>
                )}
                {e.status === "APPROVED" && (
                  <Button size="sm" variant="outline" onClick={() => cloneToDraft.mutate(e.id)} disabled={cloneToDraft.isPending}>
                    <GitBranch className="h-3.5 w-3.5 mr-1" /> New version
                  </Button>
                )}
              </div>
              <EstimateDetail estimate={e} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      )}

      <NewEstimateDialog wpId={wpId} open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => { invalidate(); setEditorId(id); }} />
      {editorId && (
        <EstimateEditorDialog
          wpId={wpId}
          estimateId={editorId}
          onClose={() => { setEditorId(null); invalidate(); }}
        />
      )}
    </div>
  );
}

function EstimateDetail({ estimate }: { estimate: any }) {
  const ccy = estimate.currency ?? "GBP";

  const { data: siteRows = [] } = useQuery({
    queryKey: ["wp-estimate-sites", estimate.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wp_estimate_sites")
        .select("*, sites(name,address), site_estimates(name,version_number,status)")
        .eq("wp_estimate_id", estimate.id)
        .order("sort_index");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: adjustments = [] } = useQuery({
    queryKey: ["wp-estimate-adjustments", estimate.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wp_estimate_adjustments")
        .select("*")
        .eq("wp_estimate_id", estimate.id)
        .order("sort_index");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6 pt-2">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Metric label="Sites cost" value={fmt(estimate.sites_total_cost, ccy)} />
        <Metric label="Adjustments" value={fmt(estimate.adjustments_total_price, ccy)} />
        <Metric label="Markup" value={fmt(estimate.total_markup, ccy)} />
        <Metric label="Total price" value={fmt(estimate.total_price, ccy)} highlight />
      </div>

      <section>
        <div className="flex items-center gap-2 mb-2 text-sm font-medium">
          <MapPin className="h-4 w-4" /> Included sites ({siteRows.length})
        </div>
        {siteRows.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">No sites linked to this estimate yet.</Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead>Site estimate</TableHead>
                  <TableHead>Included</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {siteRows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.sites?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.sites?.address ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.site_estimates?.name ?? "—"}
                      {r.site_estimates?.version_number != null && (
                        <span className="text-xs text-muted-foreground"> v{r.site_estimates.version_number}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.included ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Yes</Badge>
                      ) : (
                        <Badge variant="outline">No</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{fmt(r.contribution_cost, ccy)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(r.contribution_price, ccy)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      <section>
        <div className="flex items-center gap-2 mb-2 text-sm font-medium">
          <SlidersHorizontal className="h-4 w-4" /> Adjustments ({adjustments.length})
        </div>
        {adjustments.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">No WP-level adjustments applied.</Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Applies to</TableHead>
                  <TableHead className="text-right">Basis</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.label}</div>
                      {a.description && <div className="text-xs text-muted-foreground">{a.description}</div>}
                    </TableCell>
                    <TableCell><Badge variant="outline">{a.kind}</Badge></TableCell>
                    <TableCell className="text-sm">{a.applies_to}</TableCell>
                    <TableCell className="text-right text-sm">
                      {a.is_percentage && a.percentage != null ? `${Number(a.percentage)}%` : "Fixed"}
                    </TableCell>
                    <TableCell className="text-right">{fmt(a.amount_cost, ccy)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(a.amount_price, ccy)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      {estimate.notes && (
        <section className="text-sm">
          <div className="font-medium mb-1">Notes</div>
          <Card className="p-3 text-muted-foreground whitespace-pre-wrap">{estimate.notes}</Card>
        </section>
      )}

      <WpEstimateVariations estimate={estimate} />
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={`p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        {highlight && <TrendingUp className="h-3 w-3" />} {label}
      </div>
      <div className={`text-lg font-semibold mt-1 ${highlight ? "text-primary" : ""}`}>{value}</div>
    </Card>
  );
}

// ============================================================
// New Estimate dialog
// ============================================================
function NewEstimateDialog({
  wpId, open, onOpenChange, onCreated,
}: {
  wpId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [contractId, setContractId] = useState<string | undefined>();
  const [rateCardVersionId, setRateCardVersionId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contracts").select("id,name,code").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rateVersions = [] } = useQuery({
    enabled: !!contractId,
    queryKey: ["rate-versions-for-contract", contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rate_card_versions")
        .select("id, version_number, status, rate_cards!inner(id,name,contract_id)")
        .eq("rate_cards.contract_id", contractId!)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const submit = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("work_package_estimates").insert({
        work_package_id: wpId,
        name: name.trim(),
        contract_id: contractId ?? null,
        rate_card_version_id: rateCardVersionId ?? null,
        status: "DRAFT",
        version_number: 1,
        created_by: user.user?.id ?? null,
      }).select().single();
      if (error) throw error;
      toast.success("Draft estimate created");
      onOpenChange(false);
      setName(""); setContractId(undefined); setRateCardVersionId(undefined);
      onCreated((data as any).id);
    } catch (e: any) {
      toast.error(e.message ?? "Could not create estimate");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New WP estimate</DialogTitle>
          <DialogDescription>Create a DRAFT estimate for this work package.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Baseline v1" />
          </div>
          <div>
            <Label>Contract (optional)</Label>
            <Select value={contractId} onValueChange={(v) => { setContractId(v); setRateCardVersionId(undefined); }}>
              <SelectTrigger><SelectValue placeholder="Select contract" /></SelectTrigger>
              <SelectContent>
                {contracts.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {contractId && (
            <div>
              <Label>Rate card version (optional)</Label>
              <Select value={rateCardVersionId} onValueChange={setRateCardVersionId}>
                <SelectTrigger><SelectValue placeholder="Select rate card version" /></SelectTrigger>
                <SelectContent>
                  {rateVersions.map((v: any) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.rate_cards?.name} · v{v.version_number} ({v.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>Create draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Estimate editor dialog
// ============================================================
const ADJ_KINDS = ["contingency","preliminaries","overhead","discount","risk","management_fee","other"] as const;

function EstimateEditorDialog({
  wpId, estimateId, onClose,
}: { wpId: string; estimateId: string; onClose: () => void; }) {
  const qc = useQueryClient();

  const { data: estimate, refetch: refetchEstimate } = useQuery({
    queryKey: ["wp-estimate-edit", estimateId],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_package_estimates").select("*").eq("id", estimateId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: wpSites = [] } = useQuery({
    queryKey: ["wp-sites-for-estimate", wpId],
    queryFn: async () => {
      const { data, error } = await supabase.from("wp_sites")
        .select("id,site_id,sites(id,name,address)").eq("work_package_id", wpId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const siteIds = useMemo(() => wpSites.map((s: any) => s.site_id).filter(Boolean), [wpSites]);

  const { data: siteEstimates = [] } = useQuery({
    enabled: siteIds.length > 0,
    queryKey: ["site-estimates-for-wp", wpId, siteIds.join(",")],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_estimates")
        .select("id,site_id,name,version_number,status,total_cost,total_price,currency,created_at")
        .in("site_id", siteIds)
        .order("version_number", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // pick latest APPROVED per site, else latest DRAFT
  const latestBySite = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const se of siteEstimates as any[]) {
      const arr = map.get(se.site_id) ?? [];
      arr.push(se); map.set(se.site_id, arr);
    }
    const chosen = new Map<string, any>();
    for (const [sid, arr] of map) {
      const approved = arr.find((x) => x.status === "APPROVED");
      chosen.set(sid, approved ?? arr[0]);
    }
    return chosen;
  }, [siteEstimates]);

  const { data: currentSiteLinks = [], refetch: refetchLinks } = useQuery({
    queryKey: ["wp-estimate-sites-edit", estimateId],
    queryFn: async () => {
      const { data, error } = await supabase.from("wp_estimate_sites")
        .select("*").eq("wp_estimate_id", estimateId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: adjustments = [], refetch: refetchAdj } = useQuery({
    queryKey: ["wp-estimate-adjustments-edit", estimateId],
    queryFn: async () => {
      const { data, error } = await supabase.from("wp_estimate_adjustments")
        .select("*").eq("wp_estimate_id", estimateId).order("sort_index");
      if (error) throw error;
      return data ?? [];
    },
  });

  const linkBySite = useMemo(() => {
    const m = new Map<string, any>();
    for (const l of currentSiteLinks as any[]) m.set(l.site_id, l);
    return m;
  }, [currentSiteLinks]);

  const isApproved = estimate?.status === "APPROVED";

  const toggleSite = async (siteId: string, checked: boolean) => {
    const link = linkBySite.get(siteId);
    const se = latestBySite.get(siteId);
    if (checked && !se) { toast.error("This site has no site estimate yet"); return; }
    if (link) {
      const { error } = await supabase.from("wp_estimate_sites").update({
        included: checked,
        site_estimate_id: se?.id ?? link.site_estimate_id,
        contribution_cost: se?.total_cost ?? link.contribution_cost,
        contribution_price: se?.total_price ?? link.contribution_price,
      }).eq("id", link.id);
      if (error) { toast.error(error.message); return; }
    } else if (checked && se) {
      const { error } = await supabase.from("wp_estimate_sites").insert({
        wp_estimate_id: estimateId,
        site_estimate_id: se.id,
        site_id: siteId,
        included: true,
        contribution_cost: se.total_cost ?? 0,
        contribution_price: se.total_price ?? 0,
      });
      if (error) { toast.error(error.message); return; }
    }
    await refetchLinks();
    await recalc();
  };

  const addAdjustment = async () => {
    const { error } = await supabase.from("wp_estimate_adjustments").insert({
      wp_estimate_id: estimateId,
      kind: "contingency",
      label: "Contingency",
      is_percentage: true,
      percentage: 5,
      applies_to: "sites_price",
      amount_cost: 0,
      amount_price: 0,
      sort_index: (adjustments as any[]).length,
    });
    if (error) { toast.error(error.message); return; }
    await refetchAdj();
  };

  const updateAdjustment = async (id: string, patch: any) => {
    // If percentage adjustment, compute amounts from current sites totals
    let final = { ...patch };
    if (patch.is_percentage !== undefined || patch.percentage !== undefined) {
      const merged = { ...(adjustments as any[]).find((a: any) => a.id === id), ...patch };
      if (merged.is_percentage && merged.percentage != null && estimate) {
        const pct = Number(merged.percentage) / 100;
        final.amount_price = Number((Number(estimate.sites_total_price) * pct).toFixed(2));
        final.amount_cost = Number((Number(estimate.sites_total_cost) * pct).toFixed(2));
      }
    }
    const { error } = await supabase.from("wp_estimate_adjustments").update(final).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await refetchAdj();
    await recalc();
  };

  const deleteAdjustment = async (id: string) => {
    const { error } = await supabase.from("wp_estimate_adjustments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await refetchAdj();
    await recalc();
  };

  const recalc = async () => {
    const { error } = await (supabase as any).rpc("recalculate_wp_estimate_totals", { p_estimate_id: estimateId });
    if (error) { toast.error(error.message); return; }
    await refetchEstimate();
    qc.invalidateQueries({ queryKey: ["wp-estimates", wpId] });
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit WP estimate — {estimate?.name} <span className="text-sm text-muted-foreground">v{estimate?.version_number} · {estimate?.status}</span></DialogTitle>
          <DialogDescription>
            Pick site estimates to include, add WP-level adjustments, and totals recalculate automatically.
          </DialogDescription>
        </DialogHeader>

        {isApproved && (
          <Card className="p-3 text-sm bg-amber-500/10 border-amber-500/30">
            This estimate is APPROVED and read-only. Use “New version” to make changes.
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Metric label="Sites cost" value={fmt(estimate?.sites_total_cost, estimate?.currency)} />
          <Metric label="Adjustments" value={fmt(estimate?.adjustments_total_price, estimate?.currency)} />
          <Metric label="Markup" value={fmt(estimate?.total_markup, estimate?.currency)} />
          <Metric label="Total price" value={fmt(estimate?.total_price, estimate?.currency)} highlight />
        </div>

        <section className="space-y-2">
          <div className="text-sm font-medium flex items-center gap-2"><MapPin className="h-4 w-4" /> Sites</div>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Site estimate</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wpSites.map((ws: any) => {
                  const link = linkBySite.get(ws.site_id);
                  const se = latestBySite.get(ws.site_id);
                  const included = !!link?.included;
                  return (
                    <TableRow key={ws.id}>
                      <TableCell>
                        <Checkbox
                          checked={included}
                          disabled={isApproved || !se}
                          onCheckedChange={(c) => toggleSite(ws.site_id, !!c)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{ws.sites?.name}</div>
                        <div className="text-xs text-muted-foreground">{ws.sites?.address}</div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {se ? (
                          <>
                            {se.name} <span className="text-xs text-muted-foreground">v{se.version_number}</span>{" "}
                            <Badge variant="outline" className="ml-1 text-[10px]">{se.status}</Badge>
                          </>
                        ) : (
                          <span className="text-muted-foreground italic">No site estimate</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{fmt(link?.contribution_cost, estimate?.currency)}</TableCell>
                      <TableCell className="text-right">{fmt(link?.contribution_price, estimate?.currency)}</TableCell>
                    </TableRow>
                  );
                })}
                {wpSites.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No sites on this work package.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /> Adjustments</div>
            {!isApproved && (
              <Button size="sm" variant="outline" onClick={addAdjustment}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
            )}
          </div>
          <div className="space-y-2">
            {(adjustments as any[]).map((a) => (
              <Card key={a.id} className="p-3 grid grid-cols-12 gap-2 items-center">
                <div className="col-span-3">
                  <Label className="text-xs">Label</Label>
                  <Input value={a.label ?? ""} disabled={isApproved}
                         onChange={(e) => updateAdjustment(a.id, { label: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Kind</Label>
                  <Select value={a.kind} disabled={isApproved}
                          onValueChange={(v) => updateAdjustment(a.id, { kind: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ADJ_KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 flex flex-col">
                  <Label className="text-xs">Percentage?</Label>
                  <div className="flex items-center gap-2 h-9">
                    <Switch checked={!!a.is_percentage} disabled={isApproved}
                            onCheckedChange={(v) => updateAdjustment(a.id, { is_percentage: v })} />
                    <span className="text-xs text-muted-foreground">{a.is_percentage ? "%" : "fixed"}</span>
                  </div>
                </div>
                {a.is_percentage ? (
                  <div className="col-span-2">
                    <Label className="text-xs">Percentage</Label>
                    <Input type="number" step="0.1" value={a.percentage ?? ""} disabled={isApproved}
                           onChange={(e) => updateAdjustment(a.id, { percentage: e.target.value === "" ? null : Number(e.target.value) })} />
                  </div>
                ) : (
                  <div className="col-span-2">
                    <Label className="text-xs">Amount (price)</Label>
                    <Input type="number" step="1" value={a.amount_price ?? 0} disabled={isApproved}
                           onChange={(e) => updateAdjustment(a.id, { amount_price: Number(e.target.value || 0), amount_cost: Number(e.target.value || 0) })} />
                  </div>
                )}
                <div className="col-span-2 text-right">
                  <div className="text-xs text-muted-foreground">Price</div>
                  <div className="font-medium">{fmt(a.amount_price, estimate?.currency)}</div>
                </div>
                <div className="col-span-1 text-right">
                  {!isApproved && (
                    <Button size="icon" variant="ghost" onClick={() => deleteAdjustment(a.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
            {adjustments.length === 0 && (
              <Card className="p-4 text-sm text-muted-foreground">No adjustments yet.</Card>
            )}
          </div>
        </section>

        <section>
          <Label className="text-xs">Notes</Label>
          <Textarea value={estimate?.notes ?? ""} disabled={isApproved} rows={2}
                    onChange={async (e) => {
                      await supabase.from("work_package_estimates").update({ notes: e.target.value }).eq("id", estimateId);
                    }}
                    onBlur={() => refetchEstimate()} />
        </section>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {!isApproved && <Button variant="outline" onClick={recalc}>Recalculate</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}