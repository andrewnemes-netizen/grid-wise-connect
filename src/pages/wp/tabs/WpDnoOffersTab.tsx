import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, PlugZap, Trash2 } from "lucide-react";
import { toast } from "sonner";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(n));

const STATUSES = ["draft", "requested", "received", "accepted", "rejected", "expired"];
const DNO_KEYS = ["UKPN", "SSEN", "NPG", "NGED", "SPEN", "ENWL"];

function statusClass(s?: string) {
  switch (s) {
    case "accepted": return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    case "received": return "bg-sky-500/15 text-sky-600 border-sky-500/30";
    case "requested": return "bg-amber-500/15 text-amber-600 border-amber-500/30";
    case "rejected": case "expired": return "bg-rose-500/15 text-rose-600 border-rose-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function WpDnoOffersTab() {
  const { id: wpId } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);

  const { data: offers = [], isLoading } = useQuery({
    queryKey: ["wp-dno-offers", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dno_offers")
        .select("*")
        .eq("work_package_id", wpId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    const list = offers as any[];
    return {
      total: list.length,
      accepted: list.filter((o) => o.status === "accepted").reduce((s, o) => s + Number(o.offer_value || 0), 0),
      pending: list.filter((o) => ["requested", "received"].includes(o.status)).reduce((s, o) => s + Number(o.offer_value || 0), 0),
    };
  }, [offers]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["wp-dno-offers", wpId] });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("dno_offers").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Offer updated"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("dno_offers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Offer deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  if (!wpId) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">DNO Offers</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            DNO quotations, offer status and per-site allocation for this work package.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="shrink-0">Phase 5</Badge>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New offer
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Metric label="Offers" value={String(totals.total)} />
        <Metric label="Pending value" value={fmt(totals.pending)} />
        <Metric label="Accepted value" value={fmt(totals.accepted)} highlight />
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading offers…</Card>
      ) : offers.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <PlugZap className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="font-medium">No DNO offers yet</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Record a DNO offer to track connection cost commitments against this WP.
          </p>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New offer
          </Button>
        </Card>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {(offers as any[]).map((o) => (
            <AccordionItem key={o.id} value={o.id} className="border rounded-lg bg-card">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4 gap-3">
                  <div className="text-left min-w-0">
                    <div className="font-medium truncate">
                      {o.offer_ref || "(no ref)"} <span className="text-xs text-muted-foreground">· {o.dno_key ?? "—"}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Rev {o.revision ?? 1}
                      {o.received_at ? ` · Received ${new Date(o.received_at).toLocaleDateString()}` : ""}
                      {o.expires_at ? ` · Expires ${new Date(o.expires_at).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Value</div>
                      <div className="font-semibold">{fmt(o.offer_value)}</div>
                    </div>
                    <Badge variant="outline" className={statusClass(o.status)}>{o.status}</Badge>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select value={o.status} onValueChange={(v) => updateStatus.mutate({ id: o.id, status: v })}>
                    <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="ml-auto">
                    <Button size="sm" variant="ghost" className="text-destructive"
                      onClick={() => { if (confirm("Delete this offer?")) del.mutate(o.id); }}>
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
                {o.notes && <Card className="p-3 text-sm text-muted-foreground whitespace-pre-wrap">{o.notes}</Card>}
                <OfferSitesTable offerId={o.id} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <NewOfferDialog wpId={wpId} open={newOpen} onOpenChange={setNewOpen} onCreated={invalidate} />
    </div>
  );
}

function OfferSitesTable({ offerId }: { offerId: string }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["dno-offer-sites", offerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dno_offer_sites")
        .select("site_id, sites(site_name,postcode)")
        .eq("dno_offer_id", offerId);
      if (error) throw error;
      return data ?? [];
    },
  });
  if (isLoading) return <div className="text-sm text-muted-foreground">Loading sites…</div>;
  if (rows.length === 0) return <Card className="p-3 text-sm text-muted-foreground">No sites linked to this offer.</Card>;
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader><TableRow><TableHead>Site</TableHead><TableHead>Postcode</TableHead></TableRow></TableHeader>
        <TableBody>
          {(rows as any[]).map((r, i) => (
            <TableRow key={i}>
              <TableCell>{r.sites?.site_name ?? "—"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{r.sites?.postcode ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={`p-3 ${highlight ? "border-primary/40 bg-primary/5" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${highlight ? "text-primary" : ""}`}>{value}</div>
    </Card>
  );
}

function NewOfferDialog({ wpId, open, onOpenChange, onCreated }: { wpId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [dno, setDno] = useState<string | undefined>();
  const [ref, setRef] = useState("");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("requested");
  const [notes, setNotes] = useState("");
  const [siteId, setSiteId] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const reset = () => { setDno(undefined); setRef(""); setValue(""); setStatus("requested"); setNotes(""); setSiteId(undefined); };

  const { data: wpSites = [] } = useQuery({
    queryKey: ["wp-sites-for-offer", wpId],
    enabled: !!wpId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wp_sites")
        .select("site_id, sites:sites(id, site_name, postcode)")
        .eq("work_package_id", wpId)
        .order("sequence", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const submit = async () => {
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const { data: inserted, error } = await supabase.from("dno_offers").insert({
        work_package_id: wpId,
        dno_key: dno ?? null,
        offer_ref: ref.trim() || null,
        offer_value: value ? Number(value) : null,
        status,
        notes: notes.trim() || null,
        site_id: siteId ?? null,
        created_by: user.user?.id ?? null,
      }).select("id").maybeSingle();
      if (error) throw error;
      // If a site was picked, also record the link in dno_offer_sites for multi-site consistency.
      if (siteId && inserted?.id) {
        await (supabase as any)
          .from("dno_offer_sites")
          .upsert({ dno_offer_id: inserted.id, site_id: siteId }, { onConflict: "dno_offer_id,site_id" });
      }
      toast.success("Offer created");
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e: any) {
      toast.error(e.message ?? "Could not create offer");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New DNO offer</DialogTitle>
          <DialogDescription>Record a DNO connection quotation for this work package.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>DNO</Label>
              <Select value={dno} onValueChange={setDno}>
                <SelectTrigger><SelectValue placeholder="Select DNO" /></SelectTrigger>
                <SelectContent>{DNO_KEYS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Offer reference</Label>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="e.g. UKPN-2026-01234" />
          </div>
          <div>
            <Label>Offer value (£)</Label>
            <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <Label>Site (optional)</Label>
            <Select value={siteId ?? "none"} onValueChange={(v) => setSiteId(v === "none" ? undefined : v)}>
              <SelectTrigger><SelectValue placeholder="Whole work package" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Whole work package</SelectItem>
                {(wpSites as any[]).map((r) => (
                  <SelectItem key={r.site_id} value={r.site_id}>
                    {r.sites?.site_name ?? "Site"}{r.sites?.postcode ? ` · ${r.sites.postcode}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Linking to a site closes its POC task and opens an estimate task automatically.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create offer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}