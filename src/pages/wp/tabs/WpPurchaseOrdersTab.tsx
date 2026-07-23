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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Receipt, Trash2, FileText, Mail } from "lucide-react";
import { toast } from "sonner";
import { SendPurchaseOrderDialog } from "@/components/delivery/SendPurchaseOrderDialog";
import { XeroPoButton } from "@/components/delivery/XeroPoButton";
import { PocDesignerReturnReviewDialog } from "@/components/delivery/PocDesignerReturnReviewDialog";
import { Link } from "react-router-dom";

const fmt = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(n));

const PO_STATUSES = ["draft", "issued", "acknowledged", "part_delivered", "delivered", "closed", "cancelled"];

const CATEGORY_LABEL: Record<string, string> = {
  build: "Build",
  poc_design: "POC design",
  other: "Other",
};
function categoryClass(c: string) {
  switch (c) {
    case "poc_design": return "bg-violet-500/15 text-violet-600 border-violet-500/30";
    case "other": return "bg-slate-500/15 text-slate-600 border-slate-500/30";
    default: return "bg-primary/10 text-primary border-primary/30";
  }
}

function statusClass(s: string) {
  switch (s) {
    case "issued":
    case "acknowledged":
      return "bg-sky-500/15 text-sky-600 border-sky-500/30";
    case "part_delivered":
      return "bg-amber-500/15 text-amber-600 border-amber-500/30";
    case "delivered":
    case "closed":
      return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    case "cancelled":
      return "bg-rose-500/15 text-rose-600 border-rose-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export default function WpPurchaseOrdersTab() {
  const { id: wpId } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [sendPo, setSendPo] = useState<any | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "build" | "poc_design" | "other">("all");
  const [cancelPoc, setCancelPoc] = useState<any | null>(null);
  const [reviewPoc, setReviewPoc] = useState<any | null>(null);

  const { data: workPackage } = useQuery({
    queryKey: ["wp-basic", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_packages")
        .select("id, name, wp_code")
        .eq("id", wpId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: pos = [], isLoading } = useQuery({
    queryKey: ["wp-purchase-orders", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select("*, clients(id,name), poc_designer_returns(id,status,submitted_at,expires_at)")
        .eq("work_package_id", wpId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const totals = useMemo(() => {
    const open = (pos as any[]).filter((p) => !["closed", "cancelled"].includes(p.status));
    return {
      count: pos.length,
      openCount: open.length,
      commitment: (pos as any[])
        .filter((p) => p.status !== "cancelled")
        .reduce((s, p) => s + Number(p.order_value || 0), 0),
    };
  }, [pos]);

  const filteredPos = useMemo(() => {
    if (categoryFilter === "all") return pos as any[];
    return (pos as any[]).filter((p) => (p.category ?? "build") === categoryFilter);
  }, [pos, categoryFilter]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["wp-purchase-orders", wpId] });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { status };
      if (status === "issued") patch.issued_at = new Date().toISOString();
      const { error } = await supabase.from("purchase_orders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("PO updated"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchase_orders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Purchase order deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Delete failed"),
  });

  if (!wpId) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Client and partner POs for this work package. Track order value, status and per-site allocation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="shrink-0">Phase 5</Badge>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New PO
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Metric label="Purchase orders" value={String(totals.count)} />
        <Metric label="Open" value={String(totals.openCount)} />
        <Metric label="Committed value" value={fmt(totals.commitment)} highlight />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Category:</span>
        {(["all", "build", "poc_design", "other"] as const).map((c) => (
          <Button
            key={c}
            size="sm"
            variant={categoryFilter === c ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setCategoryFilter(c)}
          >
            {c === "all" ? "All" : CATEGORY_LABEL[c]}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading purchase orders…</Card>
      ) : filteredPos.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <Receipt className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="font-medium">
            {categoryFilter === "all" ? "No purchase orders yet" : `No ${CATEGORY_LABEL[categoryFilter]} POs`}
          </div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Raise a PO to capture committed spend from clients or partners against this work package.
          </p>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New PO
          </Button>
        </Card>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {filteredPos.map((po) => (
            <AccordionItem key={po.id} value={po.id} className="border rounded-lg bg-card">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center justify-between w-full pr-4 gap-3">
                  <div className="text-left min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      <span>{po.po_number || "(no PO number)"}</span>
                      <Badge variant="outline" className={`text-[10px] ${categoryClass(po.category ?? "build")}`}>
                        {CATEGORY_LABEL[po.category ?? "build"] ?? po.category ?? "build"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {po.clients?.name ?? "Unassigned client"}
                      {po.issued_at ? ` · Issued ${new Date(po.issued_at).toLocaleDateString()}` : ""}
                      {po.source_task_id && (
                        <> · <Link to={`/wp/${wpId}/sites/register`} className="underline hover:text-foreground" onClick={(e) => e.stopPropagation()}>from site register</Link></>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Value</div>
                      <div className="font-semibold">{fmt(po.order_value)}</div>
                    </div>
                    <Badge variant="outline" className={statusClass(po.status)}>
                      {po.status?.replace("_", " ")}
                    </Badge>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <Select
                    value={po.status}
                    onValueChange={(v) => updateStatus.mutate({ id: po.id, status: v })}
                  >
                    <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PO_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="ml-auto">
                    <Button
                      size="sm"
                      variant="outline"
                      className="mr-2"
                      onClick={() => setSendPo(po)}
                    >
                      <Mail className="h-3.5 w-3.5 mr-1" /> Send to supplier
                    </Button>
                    {po.category === "poc_design" && (() => {
                      const ret = Array.isArray(po.poc_designer_returns) ? po.poc_designer_returns[0] : null;
                      if (!ret) return null;
                      return (
                        <Button
                          size="sm"
                          variant="outline"
                          className={`mr-2 ${ret.status === "submitted" ? "border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10" : ""}`}
                          onClick={() => setReviewPoc(po)}
                        >
                          Designer return: {ret.status}
                        </Button>
                      );
                    })()}
                    {po.category === "poc_design" && po.status !== "cancelled" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="mr-2 border-rose-500/40 text-rose-600 hover:bg-rose-500/10"
                        onClick={() => setCancelPoc(po)}
                      >
                        Cancel & notify designer
                      </Button>
                    )}
                    <XeroPoButton po={po} onDone={invalidate} />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm(`Delete PO ${po.po_number ?? ""}? This cannot be undone.`)) {
                          del.mutate(po.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  </div>
                </div>
                {po.notes && (
                  <Card className="p-3 text-sm text-muted-foreground whitespace-pre-wrap">
                    {po.notes}
                  </Card>
                )}
                <PoLinesTable poId={po.id} />
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <NewPoDialog wpId={wpId} open={newOpen} onOpenChange={setNewOpen} onCreated={invalidate} />

      {sendPo && (
        <SendPurchaseOrderDialog
          open={!!sendPo}
          onOpenChange={(o) => { if (!o) setSendPo(null); }}
          po={sendPo}
          workPackage={workPackage}
        />
      )}

      {cancelPoc && (
        <CancelPocPoDialog
          po={cancelPoc}
          workPackage={workPackage}
          onClose={() => setCancelPoc(null)}
          onDone={() => { setCancelPoc(null); invalidate(); }}
        />
      )}

      {reviewPoc && (
        <PocDesignerReturnReviewDialog
          open={!!reviewPoc}
          onOpenChange={(o) => { if (!o) setReviewPoc(null); }}
          po={reviewPoc}
        />
      )}
    </div>
  );
}

function CancelPocPoDialog({
  po, workPackage, onClose, onDone,
}: {
  po: any; workPackage: any; onClose: () => void; onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      // 1. Email the designer (real notification, not a silent flip)
      if (po.supplier_contact_email) {
        const { error: emailErr } = await supabase.functions.invoke("send-poc-po-cancellation-email", {
          body: {
            recipientEmail: po.supplier_contact_email,
            recipientName: po.supplier_contact_name ?? undefined,
            companyName: po.clients?.name ?? undefined,
            workPackageName: workPackage?.wp_code
              ? `${workPackage.name ?? ""} (${workPackage.wp_code})`.trim()
              : (workPackage?.name ?? undefined),
            poNumber: po.po_number ?? undefined,
            reason: reason.trim() || undefined,
          },
        });
        if (emailErr) throw emailErr;
      }
      // 2. Flip status → cancelled + audit
      const { error: upErr } = await supabase
        .from("purchase_orders")
        .update({ status: "cancelled" })
        .eq("id", po.id);
      if (upErr) throw upErr;
      await (supabase as any).from("audit_log").insert({
        action: "poc_po.cancelled",
        entity_type: "purchase_order",
        entity_id: po.id,
        meta_json: { po_number: po.po_number, reason: reason.trim() || null },
      });
      toast.success(`PO ${po.po_number ?? ""} cancelled — designer notified`);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Cancellation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel POC PO {po.po_number}</DialogTitle>
          <DialogDescription>
            This will email <span className="font-medium">{po.supplier_contact_email || "the designer"}</span> to stand down and mark the PO cancelled.
            The original assignment task is unchanged — reassign it via <span className="font-medium">Send for POC</span> if a replacement is needed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Reason (shared with the designer)</Label>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Client withdrew the site from scope." />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Keep PO</Button>
          <Button
            onClick={submit}
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {busy ? "Cancelling…" : "Cancel PO & email designer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PoLinesTable({ poId }: { poId: string }) {
  const { data: lines = [], isLoading } = useQuery({
    queryKey: ["po-lines", poId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("po_lines")
        .select("*, po_line_sites(site_id, qty, value, sites(site_name,postcode))")
        .eq("po_id", poId)
        .order("sort_index");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Loading lines…</div>;
  if (lines.length === 0) {
    return (
      <Card className="p-4 text-sm text-muted-foreground flex items-center gap-2">
        <FileText className="h-4 w-4" /> No PO lines recorded.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead>Site allocation</TableHead>
            <TableHead className="text-right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(lines as any[]).map((l) => (
            <TableRow key={l.id}>
              <TableCell className="max-w-md">
                <div className="font-medium truncate">{l.description ?? "(no description)"}</div>
              </TableCell>
              <TableCell className="text-sm">
                {(l.po_line_sites?.length ?? 0) === 0 ? (
                  <span className="text-muted-foreground">Unallocated</span>
                ) : (
                  <div className="space-y-0.5">
                    {l.po_line_sites.map((s: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="truncate">{s.sites?.site_name ?? "Site"}</span>
                        <span className="text-xs text-muted-foreground">{fmt(s.value)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right font-medium">{fmt(l.line_value)}</TableCell>
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

function NewPoDialog({
  wpId, open, onOpenChange, onCreated,
}: {
  wpId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void;
}) {
  const [poNumber, setPoNumber] = useState("");
  const [clientId, setClientId] = useState<string | undefined>();
  const [orderValue, setOrderValue] = useState<string>("");
  const [status, setStatus] = useState("draft");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const reset = () => {
    setPoNumber(""); setClientId(undefined); setOrderValue(""); setStatus("draft"); setNotes("");
  };

  const submit = async () => {
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const payload: any = {
        work_package_id: wpId,
        po_number: poNumber.trim() || null,
        client_id: clientId ?? null,
        order_value: orderValue ? Number(orderValue) : null,
        status,
        notes: notes.trim() || null,
        created_by: user.user?.id ?? null,
      };
      if (status === "issued") payload.issued_at = new Date().toISOString();
      const { error } = await supabase.from("purchase_orders").insert(payload);
      if (error) throw error;
      toast.success("Purchase order created");
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e: any) {
      toast.error(e.message ?? "Could not create purchase order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New purchase order</DialogTitle>
          <DialogDescription>Capture a client or partner PO against this work package.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>PO number</Label>
            <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} placeholder="e.g. PO-2026-001" />
          </div>
          <div>
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select client (optional)" /></SelectTrigger>
              <SelectContent>
                {(clients as any[]).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Order value (£)</Label>
              <Input type="number" step="0.01" value={orderValue} onChange={(e) => setOrderValue(e.target.value)} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PO_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create PO"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}