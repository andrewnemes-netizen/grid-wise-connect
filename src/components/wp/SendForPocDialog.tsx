import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Zap, CheckCircle2, AlertTriangle, FileText, ShieldAlert } from "lucide-react";
import { validateSiteForPoc, enrichSiteForPoc, type PocSiteEnriched } from "@/lib/wp/pocValidation";
import { Link } from "react-router-dom";

export interface PocAssignment {
  mode: "internal" | "external";
  assigneeUserId?: string | null;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  message?: string;
  dueDate: string; // ISO date
  sendEmail: boolean;
  sites: PocSiteEnriched[];
  // Present only when the external designer is being paid via a POC design PO.
  // Gated behind adminOnly; missing for internal or non-PO external assignments.
  po?: {
    fee: number;
    feeBasis: "per_site" | "fixed";
    paymentTerms: string;
    poTerms?: string | null;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  siteIds: string[];
  workPackageName?: string;
  // Two-step flow: form → review → confirm. Consumers only see the final assignment.
  onConfirm: (a: PocAssignment) => Promise<void> | void;
  // When true, external designer flow requires a fee/PO and shows PO fields.
  // Pilot rollout: parent should pass hasRole('admin'). Default true so callers
  // that forget to pass it get the safer PO-mandatory path.
  adminOnly?: boolean;
  submitting?: boolean;
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(n);

const PAYMENT_TERMS = ["Net 14 days", "Net 30 days", "Net 45 days", "Net 60 days", "On acceptance"];
const DEFAULT_PO_TERMS =
  "Deliverables: complete POC application pack per attached site list. Please acknowledge this PO and quote the PO number on all invoices. Any variation must be agreed in writing before work commences.";

export function SendForPocDialog({
  open, onOpenChange, siteIds, workPackageName, onConfirm, submitting, adminOnly = true,
}: Props) {
  const siteCount = siteIds.length;
  const defaultDue = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 45);
    return d.toISOString().slice(0, 10);
  }, []);
  const [step, setStep] = useState<"form" | "review">("form");
  const [mode, setMode] = useState<"internal" | "external">("internal");
  const [internalUserId, setInternalUserId] = useState<string>("");
  const [contactId, setContactId] = useState<string>("__manual");
  const [externalName, setExternalName] = useState("");
  const [externalEmail, setExternalEmail] = useState("");
  const [message, setMessage] = useState("");
  const [dueDate, setDueDate] = useState(defaultDue);
  // PO fields (external + adminOnly)
  const [feeRaw, setFeeRaw] = useState<string>("");
  const [feeBasis, setFeeBasis] = useState<"per_site" | "fixed">("per_site");
  const [paymentTerms, setPaymentTerms] = useState<string>("Net 30 days");
  const [poTerms, setPoTerms] = useState<string>(DEFAULT_PO_TERMS);

  useEffect(() => {
    if (open) {
      setStep("form");
      setMode("internal");
      setInternalUserId("");
      setContactId("__manual");
      setExternalName("");
      setExternalEmail("");
      setMessage("");
      setDueDate(defaultDue);
      setFeeRaw("");
      setFeeBasis("per_site");
      setPaymentTerms("Net 30 days");
      setPoTerms(DEFAULT_PO_TERMS);
    }
  }, [open, defaultDue]);

  const { data: siteRecords = [], isLoading: sitesLoading } = useQuery({
    queryKey: ["poc-sites", siteIds.join(",")],
    enabled: open && siteIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_sites_for_poc", { _site_ids: siteIds });
      if (error) {
        // Fallback: select without lat/lng if RPC absent
        const { data: rows, error: e2 } = await supabase
          .from("sites")
          .select("id, site_name, postcode, client_site_code, socket_count, proposed_kw")
          .in("id", siteIds);
        if (e2) throw e2;
        return (rows ?? []).map((r: any) => ({ ...r, lat: null, lng: null }));
      }
      return data ?? [];
    },
  });

  const enriched = useMemo(
    () => (siteRecords as any[]).map((r) => ({ record: enrichSiteForPoc(r), validation: validateSiteForPoc(r) })),
    [siteRecords],
  );
  const allValid = enriched.length > 0 && enriched.every((e) => e.validation.ok);

  const { data: internalUsers = [] } = useQuery({
    queryKey: ["poc-internal-users"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, company")
        .eq("is_approved", true)
        .order("full_name");
      if (error) throw error;
      return (data ?? []).filter((r: any) => r.user_id);
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["poc-external-contacts"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, full_name, email, role")
        .not("email", "is", null)
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (contactId && contactId !== "__manual") {
      const c = (contacts as any[]).find((x) => x.id === contactId);
      if (c) {
        setExternalName(c.full_name ?? "");
        setExternalEmail(c.email ?? "");
      }
    }
  }, [contactId, contacts]);

  // External + admin path requires a valid fee. Non-admin externals skip PO.
  const feeNum = Number(feeRaw);
  const feeValid = feeRaw !== "" && Number.isFinite(feeNum) && feeNum > 0;
  const externalNeedsPo = mode === "external" && adminOnly;

  const canProceed = (() => {
    if (!allValid) return false;
    if (mode === "internal") return !!internalUserId;
    if (!isEmail(externalEmail)) return false;
    if (externalNeedsPo && !feeValid) return false;
    return true;
  })();

  // Preview values
  const totalFee = feeValid
    ? feeBasis === "per_site"
      ? feeNum * Math.max(1, siteCount)
      : feeNum
    : 0;
  const perSiteFee = feeValid
    ? feeBasis === "per_site"
      ? feeNum
      : feeNum / Math.max(1, siteCount)
    : 0;

  const buildAssignment = (): PocAssignment => {
    const sitesPayload = enriched.map((e) => e.record);
    if (mode === "internal") {
      const u = (internalUsers as any[]).find((x) => x.user_id === internalUserId);
      return {
        mode: "internal",
        assigneeUserId: internalUserId,
        assigneeName: u?.full_name ?? null,
        assigneeEmail: null,
        message: message.trim() || undefined,
        dueDate,
        sendEmail: false,
        sites: sitesPayload,
      };
    }
    return {
      mode: "external",
      assigneeUserId: null,
      assigneeName: externalName.trim() || null,
      assigneeEmail: externalEmail.trim(),
      message: message.trim() || undefined,
      dueDate,
      sendEmail: true,
      sites: sitesPayload,
      ...(externalNeedsPo && feeValid
        ? {
            po: {
              fee: feeNum,
              feeBasis,
              paymentTerms,
              poTerms: poTerms.trim() || null,
            },
          }
        : {}),
    };
  };

  const handleNext = () => {
    if (!canProceed) return;
    // Internal has no PO step; skip review to preserve existing UX.
    if (mode === "internal") {
      void onConfirm(buildAssignment());
      return;
    }
    setStep("review");
  };

  const handleConfirmSend = async () => {
    if (!canProceed) return;
    await onConfirm(buildAssignment());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            {step === "review" ? "Review & send POC PO" : "Send for POC"}
          </DialogTitle>
          <DialogDescription>
            {step === "review" ? (
              <>Confirm the PO and email that will go to the designer. Nothing is sent until you press <span className="font-medium">Issue PO &amp; email designer</span>.</>
            ) : (
              <>
                Assign the POC application task for{" "}
                <Badge variant="secondary" className="text-[10px]">{siteCount} site{siteCount === 1 ? "" : "s"}</Badge>
                {workPackageName && <> in <span className="font-medium">{workPackageName}</span></>}.
                Internal assignments create an in-app task. External assignments raise a purchase order and email the designer.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {step === "form" ? (
        <>
        <div className="rounded-md border p-3 space-y-2 bg-muted/30">
          <div className="text-xs font-medium">Site readiness</div>
          {sitesLoading ? (
            <p className="text-[11px] text-muted-foreground">Checking site records…</p>
          ) : enriched.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No sites selected.</p>
          ) : (
            <ul className="space-y-1.5">
              {enriched.map(({ record, validation }) => (
                <li key={record.id} className="flex items-start gap-2 text-[12px]">
                  {validation.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{record.address ?? "Unnamed site"}</span>
                      {record.siteId && <Badge variant="outline" className="text-[10px]">{record.siteId}</Badge>}
                    </div>
                    {!validation.ok && (
                      <div className="text-destructive text-[11px] mt-0.5">
                        Missing: {validation.missing.join(", ")}
                      </div>
                    )}
                    {validation.ok && (
                      <div className="text-[11px] text-muted-foreground mt-0.5 space-y-0.5">
                        <div>
                          {record.totalSockets} sockets · {record.breakdownLabel || "—"} · Total {Math.round(record.totalConnectedKw * 100) / 100} kW
                        </div>
                        <div>
                          L1 {Math.round(record.phaseTotals.L1 * 100) / 100}kW ·
                          L2 {Math.round(record.phaseTotals.L2 * 100) / 100}kW ·
                          L3 {Math.round(record.phaseTotals.L3 * 100) / 100}kW
                        </div>
                      </div>
                    )}
                  </div>
                  {!validation.ok && (
                    <Link
                      to={`/site/${record.id}`}
                      className="text-[11px] underline text-muted-foreground hover:text-foreground shrink-0"
                      target="_blank"
                    >
                      Open
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!sitesLoading && !allValid && enriched.length > 0 && (
            <p className="text-[11px] text-destructive">
              Fix the missing fields on each site before triggering PoC.
            </p>
          )}
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="internal">Internal designer</TabsTrigger>
            <TabsTrigger value="external">External designer</TabsTrigger>
          </TabsList>

          <TabsContent value="internal" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label>Assign to team member</Label>
              <Select value={internalUserId} onValueChange={setInternalUserId}>
                <SelectTrigger><SelectValue placeholder="Select a team member" /></SelectTrigger>
                <SelectContent>
                  {(internalUsers as any[]).map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.full_name}{u.company ? ` · ${u.company}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">They will be notified in-app via their assigned task.</p>
            </div>
          </TabsContent>

          <TabsContent value="external" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <Label>Pick from directory</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger><SelectValue placeholder="Directory contact" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual">— Enter manually —</SelectItem>
                  {(contacts as any[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name} · {c.email}{c.role ? ` (${c.role})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={externalName} onChange={(e) => setExternalName(e.target.value)} placeholder="Designer name" />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={externalEmail}
                  onChange={(e) => setExternalEmail(e.target.value)}
                  placeholder="designer@company.com"
                />
              </div>
            </div>
            {externalEmail && !isEmail(externalEmail) && (
              <p className="text-[11px] text-destructive">Enter a valid email address.</p>
            )}

            {externalNeedsPo && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-3">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <FileText className="h-3.5 w-3.5" /> Purchase order (required for external designers)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>Fee (£)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={feeRaw}
                      onChange={(e) => setFeeRaw(e.target.value)}
                      placeholder="e.g. 450"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Fee basis</Label>
                    <Select value={feeBasis} onValueChange={(v) => setFeeBasis(v as any)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="per_site">Per site</SelectItem>
                        <SelectItem value="fixed">Fixed total</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Payment terms</Label>
                  <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Terms (appears on the PO)</Label>
                  <Textarea rows={3} maxLength={2000} value={poTerms} onChange={(e) => setPoTerms(e.target.value)} />
                </div>
                {feeRaw && !feeValid && (
                  <p className="text-[11px] text-destructive">Fee must be a positive number.</p>
                )}
                {feeValid && (
                  <p
                    data-testid="po-preview"
                    className="text-[12px] rounded bg-background border px-2 py-1.5"
                  >
                    A PO for <span className="font-semibold">{gbp(totalFee)}</span> will be issued to{" "}
                    <span className="font-semibold">{externalName.trim() || externalEmail || "the designer"}</span>{" "}
                    for <span className="font-semibold">{siteCount} site{siteCount === 1 ? "" : "s"}</span>
                    {feeBasis === "per_site" ? ` (${gbp(feeNum)} per site).` : "."}
                  </p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="space-y-1.5">
          <Label>Target return date</Label>
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Message (optional)</Label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Any brief for the designer…"
            rows={3}
            maxLength={1000}
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleNext} disabled={!canProceed || submitting} data-testid="poc-next-btn">
            {submitting
              ? "Working…"
              : mode === "external"
              ? (externalNeedsPo ? "Review PO" : "Assign & email")
              : "Assign"}
          </Button>
        </DialogFooter>
        </>
        ) : (
          <div className="space-y-3" data-testid="poc-review-step">
            <div className="rounded-md border p-3 bg-muted/30 space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Designer</span>
                <span className="font-medium text-right">
                  {externalName.trim() || "(no name)"} <span className="text-muted-foreground">· {externalEmail}</span>
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Sites</span>
                <span className="font-medium">{siteCount}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Fee basis</span>
                <span className="font-medium">{feeBasis === "per_site" ? `${gbp(perSiteFee)} per site` : "Fixed total"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Total PO value</span>
                <span className="font-semibold text-primary">{gbp(totalFee)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Payment terms</span>
                <span className="font-medium">{paymentTerms}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Target return</span>
                <span className="font-medium">{dueDate}</span>
              </div>
            </div>
            <div className="text-[12px] rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-800 p-2 flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                On confirm we'll: create the PO as <span className="font-medium">draft</span>, generate the PDF, email the designer with
                the PO and site list attached, mirror the PDF to OneDrive, and mark the PO <span className="font-medium">issued</span>.
              </span>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("form")} disabled={submitting}>Back</Button>
              <Button onClick={handleConfirmSend} disabled={submitting} data-testid="poc-confirm-send">
                {submitting ? "Issuing…" : "Issue PO & email designer"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}