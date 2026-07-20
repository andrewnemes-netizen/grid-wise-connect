import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { sendSurveyToSites } from "@/lib/sendSurveyToSites";
import { collectRowsForPdf } from "@/lib/survey-schema";
import { generateSurveyPdf, type SurveyPhotoGroup } from "@/lib/survey-pdf";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertTriangle, Copy, Download, FileText, Loader2, Mail, RefreshCw,
  Send, ShieldOff, CalendarPlus, Search, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

interface Props {
  /** Scope the panel to sites in a single work package. Omit for org-wide view. */
  workPackageId?: string;
}

type Status = "pending" | "opened" | "submitted" | "expired" | "revoked" | "cancelled";

interface SurveyRow {
  id: string;
  site_id: string;
  token: string;
  sent_to_email: string;
  sent_to_name: string | null;
  sent_by: string;
  status: Status;
  created_at: string;
  expires_at: string;
  submitted_at: string | null;
  opened_at: string | null;
  revoked_at: string | null;
  response_id: string | null;
  // joined
  site_name?: string | null;
  postcode?: string | null;
  wp_id?: string | null;
  wp_name?: string | null;
  sent_by_name?: string | null;
}

const STATUS_STYLES: Record<Status, string> = {
  pending: "bg-amber-100 text-amber-800",
  opened: "bg-sky-100 text-sky-800",
  submitted: "bg-emerald-100 text-emerald-800",
  expired: "bg-muted text-muted-foreground",
  revoked: "bg-rose-100 text-rose-800",
  cancelled: "bg-muted text-muted-foreground",
};

const ACTIVE_STATUSES: Status[] = ["pending", "opened"];

export function SurveysPanel({ workPackageId }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth() as any;
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [wpFilter, setWpFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<{ ids: string[]; label: string } | null>(null);
  const [extendDialog, setExtendDialog] = useState<{ ids: string[]; days: number } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string } | null>(null);
  const [openingPdf, setOpeningPdf] = useState<string | null>(null);

  const scopeKey = ["surveys-panel", workPackageId ?? "all"];

  const query = useQuery({
    queryKey: scopeKey,
    queryFn: async (): Promise<SurveyRow[]> => {
      // 1. Restrict site set by WP if scoped.
      const sb = supabase as any;
      let siteIds: string[] | null = null;
      if (workPackageId) {
        const { data: wpSites } = await sb
          .from("wp_sites")
          .select("site_id")
          .eq("work_package_id", workPackageId);
        siteIds = (wpSites ?? []).map((r: any) => r.site_id);
        if (siteIds.length === 0) return [];
      }

      let q = sb
        .from("site_surveys")
        .select("id, site_id, token, sent_to_email, sent_to_name, sent_by, status, created_at, expires_at, submitted_at, opened_at, revoked_at, response_id")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (siteIds) q = q.in("site_id", siteIds);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data as SurveyRow[]) ?? [];
      if (rows.length === 0) return rows;

      const uniqueSiteIds = Array.from(new Set(rows.map((r) => r.site_id)));
      const uniqueUserIds = Array.from(new Set(rows.map((r) => r.sent_by).filter(Boolean)));

      const [sitesRes, wpSitesRes, profilesRes] = await Promise.all([
        sb.from("sites").select("id, site_name, postcode").in("id", uniqueSiteIds),
        sb.from("wp_sites").select("site_id, work_package_id").in("site_id", uniqueSiteIds),
        uniqueUserIds.length
          ? sb.from("profiles").select("id, full_name, email").in("id", uniqueUserIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const sitesData = sitesRes.data;
      const wpSitesData = wpSitesRes.data;
      const profilesData = profilesRes.data;
      const wpIds = Array.from(new Set(((wpSitesData ?? []) as any[]).map((r) => r.work_package_id)));
      const wpsRes = wpIds.length
        ? await sb.from("work_packages").select("id, name").in("id", wpIds)
        : { data: [] as any[] };
      const wpsData = wpsRes.data;

      const siteMap = new Map<string, any>((sitesData ?? []).map((s: any) => [s.id, s]));
      const siteWp = new Map<string, string>(((wpSitesData ?? []) as any[]).map((r) => [r.site_id, r.work_package_id]));
      const wpMap = new Map<string, string>(((wpsData ?? []) as any[]).map((w) => [w.id, w.name]));
      const profileMap = new Map<string, any>(((profilesData ?? []) as any[]).map((p) => [p.id, p]));

      return rows.map((r) => {
        const site = siteMap.get(r.site_id);
        const wpId = siteWp.get(r.site_id) ?? null;
        const prof = profileMap.get(r.sent_by);
        return {
          ...r,
          site_name: site?.site_name ?? null,
          postcode: site?.postcode ?? null,
          wp_id: wpId,
          wp_name: wpId ? wpMap.get(wpId) ?? null : null,
          sent_by_name: prof?.full_name ?? prof?.email ?? null,
        };
      });
    },
  });

  const rows = query.data ?? [];

  const wpOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => { if (r.wp_id && r.wp_name) map.set(r.wp_id, r.wp_name); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const duplicates = useMemo(() => {
    const grouped = new Map<string, SurveyRow[]>();
    for (const r of rows) {
      if (!ACTIVE_STATUSES.includes(r.status)) continue;
      const arr = grouped.get(r.site_id) ?? [];
      arr.push(r);
      grouped.set(r.site_id, arr);
    }
    const dup = new Map<string, SurveyRow[]>();
    for (const [k, v] of grouped) if (v.length > 1) dup.set(k, v);
    return dup;
  }, [rows]);

  const filtered = useMemo(() => {
    const from = dateFrom ? new Date(dateFrom).getTime() : null;
    const to = dateTo ? new Date(dateTo).getTime() + 86_400_000 : null;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!workPackageId && wpFilter !== "all" && r.wp_id !== wpFilter) return false;
      const ts = new Date(r.created_at).getTime();
      if (from && ts < from) return false;
      if (to && ts >= to) return false;
      if (q) {
        const hay = `${r.site_name ?? ""} ${r.postcode ?? ""} ${r.sent_to_email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, wpFilter, dateFrom, dateTo, search, workPackageId]);

  const allVisibleChecked = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const someVisibleChecked = filtered.some((r) => selected.has(r.id));
  const toggleAll = (v: boolean) => {
    const next = new Set(selected);
    filtered.forEach((r) => (v ? next.add(r.id) : next.delete(r.id)));
    setSelected(next);
  };
  const toggleOne = (id: string, v: boolean) => {
    const next = new Set(selected);
    if (v) next.add(id); else next.delete(id);
    setSelected(next);
  };

  const refresh = () => qc.invalidateQueries({ queryKey: scopeKey });

  const revoke = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    const { error } = await (supabase as any)
      .from("site_surveys")
      .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: user?.id ?? null })
      .in("id", ids);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Revoked ${ids.length} survey${ids.length === 1 ? "" : "s"}`);
    setSelected(new Set());
    setConfirmRevoke(null);
    refresh();
  };

  const extend = async (ids: string[], days: number) => {
    if (ids.length === 0 || !days) return;
    setBusy(true);
    // Extend each row's own expires_at by N days (fetch, compute, update in chunks).
    const targets = rows.filter((r) => ids.includes(r.id));
    for (const r of targets) {
      const base = new Date(r.expires_at).getTime();
      const newExp = new Date(Math.max(base, Date.now()) + days * 86_400_000).toISOString();
      const { error } = await (supabase as any)
        .from("site_surveys")
        .update({ expires_at: newExp })
        .eq("id", r.id);
      if (error) { toast.error(error.message); setBusy(false); return; }
    }
    setBusy(false);
    toast.success(`Extended ${ids.length} survey${ids.length === 1 ? "" : "s"} by ${days} days`);
    setExtendDialog(null);
    setSelected(new Set());
    refresh();
  };

  const resend = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusy(true);
    const targets = rows.filter((r) => ids.includes(r.id));
    let sent = 0, failed = 0;
    for (const r of targets) {
      try {
        await sendSurveyToSites({
          siteIds: [r.site_id],
          recipients: [{ email: r.sent_to_email, name: r.sent_to_name ?? undefined }],
          deliveryMode: "email",
          resentFromId: r.id,
        });
        // Revoke the superseded token so the old link stops working.
        await (supabase as any)
          .from("site_surveys")
          .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: user?.id ?? null })
          .eq("id", r.id)
          .in("status", ACTIVE_STATUSES);
        sent++;
      } catch (e: any) {
        failed++;
        toast.error(`Resend failed for ${r.site_name ?? r.site_id}: ${e?.message ?? e}`);
      }
    }
    setBusy(false);
    if (sent) toast.success(`Resent ${sent} survey${sent === 1 ? "" : "s"}`);
    if (failed) toast.error(`${failed} resend(s) failed`);
    setSelected(new Set());
    refresh();
  };

  const keepNewestRevokeRest = async (siteId: string) => {
    const group = (duplicates.get(siteId) ?? []).slice().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const toRevoke = group.slice(1).map((r) => r.id);
    if (toRevoke.length === 0) return;
    await revoke(toRevoke);
  };

  const openPdf = async (r: SurveyRow) => {
    if (!r.response_id) return;
    setOpeningPdf(r.id);
    try {
      const { data } = await (supabase as any)
        .from("site_survey_responses")
        .select("id, submitter_name, submitter_email, submitted_at, submission")
        .eq("id", r.response_id)
        .maybeSingle();
      if (!data) throw new Error("Response not found");
      const submission: any = (data as any).submission ?? {};
      const photoGroups = Array.isArray(submission._photo_groups)
        ? (submission._photo_groups as SurveyPhotoGroup[])
        : [];
      const blob = await generateSurveyPdf({
        siteName: submission.site_name_address ?? r.site_name ?? "Site Survey",
        submitterName: (data as any).submitter_name ?? undefined,
        submitterEmail: (data as any).submitter_email ?? undefined,
        submittedAt: (data as any).submitted_at ? new Date((data as any).submitted_at) : new Date(),
        sections: collectRowsForPdf(submission),
        photoGroups,
        relevantDno: submission.relevant_dno,
        surveyDate: submission.site_survey_date,
      });
      const url = URL.createObjectURL(blob);
      setPdfPreview((cur) => { if (cur?.url) URL.revokeObjectURL(cur.url); return { url, filename: `survey-${r.id}.pdf` }; });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open PDF");
    } finally {
      setOpeningPdf(null);
    }
  };

  const selectedIds = Array.from(selected);
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const anyActiveSelected = selectedRows.some((r) => ACTIVE_STATUSES.includes(r.status));

  return (
    <Card>
      <CardContent className="py-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Surveys</h3>
            <Badge variant="secondary">{filtered.length}</Badge>
            {duplicates.size > 0 && (
              <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-300 gap-1">
                <AlertTriangle className="h-3 w-3" /> {duplicates.size} duplicate site{duplicates.size === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={refresh} disabled={query.isFetching}>
            <RefreshCw className={`h-3 w-3 mr-1 ${query.isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Site, postcode, email…"
              className="pl-7 h-8 w-56 text-xs"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="opened">Opened</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          {!workPackageId && (
            <Select value={wpFilter} onValueChange={setWpFilter}>
              <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="Work package" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All work packages</SelectItem>
                {wpOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 w-36 text-xs" />
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 w-36 text-xs" />
          {(search || statusFilter !== "all" || wpFilter !== "all" || dateFrom || dateTo) && (
            <Button size="sm" variant="ghost" onClick={() => { setSearch(""); setStatusFilter("all"); setWpFilter("all"); setDateFrom(""); setDateTo(""); }}>
              Clear
            </Button>
          )}
        </div>

        {/* Bulk actions */}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 rounded border bg-muted/40 px-3 py-2 text-xs">
            <span className="font-medium">{selected.size} selected</span>
            <Button size="sm" variant="outline" disabled={busy || !anyActiveSelected} onClick={() => resend(selectedIds)}>
              <Send className="h-3 w-3 mr-1" /> Resend
            </Button>
            <Button size="sm" variant="outline" disabled={busy || !anyActiveSelected}
              onClick={() => setExtendDialog({ ids: selectedIds, days: 14 })}>
              <CalendarPlus className="h-3 w-3 mr-1" /> Extend
            </Button>
            <Button size="sm" variant="outline" disabled={busy || !anyActiveSelected}
              onClick={() => setConfirmRevoke({ ids: selectedIds, label: `${selectedIds.length} survey(s)` })}>
              <ShieldOff className="h-3 w-3 mr-1" /> Revoke
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        )}

        {/* Table */}
        {query.isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">No surveys match these filters.</p>
        ) : (
          <div className="rounded border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allVisibleChecked ? true : someVisibleChecked ? "indeterminate" : false}
                      onCheckedChange={(v) => toggleAll(Boolean(v))}
                    />
                  </TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Postcode</TableHead>
                  {!workPackageId && <TableHead>Work Package</TableHead>}
                  <TableHead>Sent</TableHead>
                  <TableHead>Sent by</TableHead>
                  <TableHead>Sent to</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const isDup = duplicates.has(r.site_id) && ACTIVE_STATUSES.includes(r.status);
                  const isActive = ACTIVE_STATUSES.includes(r.status);
                  return (
                    <TableRow key={r.id} className={isDup ? "bg-amber-50/50" : ""}>
                      <TableCell>
                        <Checkbox checked={selected.has(r.id)} onCheckedChange={(v) => toggleOne(r.id, Boolean(v))} />
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex items-center gap-2">
                          <Link to={`/site/${r.site_id}`} className="hover:underline font-medium truncate max-w-[200px]">
                            {r.site_name ?? r.site_id.slice(0, 8)}
                          </Link>
                          {isDup && (
                            <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 gap-1 text-[10px]">
                              <AlertTriangle className="h-3 w-3" /> Duplicate
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{r.postcode ?? "—"}</TableCell>
                      {!workPackageId && (
                        <TableCell className="text-xs">
                          {r.wp_id ? (
                            <Link to={`/wp/${r.wp_id}/sites/surveys`} className="hover:underline inline-flex items-center gap-1">
                              {r.wp_name ?? "WP"} <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-xs whitespace-nowrap" title={format(new Date(r.created_at), "PPpp")}>
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-xs">{r.sent_by_name ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        <span className="inline-flex items-center gap-1 truncate max-w-[180px]">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {r.sent_to_email}
                        </span>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={STATUS_STYLES[r.status]}>{r.status}</Badge></TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {format(new Date(r.expires_at), "d MMM yyyy")}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.submitted_at ? format(new Date(r.submitted_at), "d MMM yyyy") : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {r.status === "submitted" && r.response_id && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={openingPdf === r.id} onClick={() => openPdf(r)}>
                              {openingPdf === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                            </Button>
                          )}
                          {isActive && (
                            <>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" title="Copy link"
                                onClick={() => {
                                  const base = window.location.origin;
                                  navigator.clipboard.writeText(`${base}/survey/${r.token}`);
                                  toast.success("Link copied");
                                }}>
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" title="Resend" disabled={busy}
                                onClick={() => resend([r.id])}>
                                <Send className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" title="Extend" disabled={busy}
                                onClick={() => setExtendDialog({ ids: [r.id], days: 14 })}>
                                <CalendarPlus className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" title="Revoke" disabled={busy}
                                onClick={() => setConfirmRevoke({ ids: [r.id], label: r.sent_to_email })}>
                                <ShieldOff className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                          {isDup && (
                            <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={busy}
                              onClick={() => keepNewestRevokeRest(r.site_id)}>
                              Keep newest
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Revoke confirm */}
      <AlertDialog open={!!confirmRevoke} onOpenChange={(o) => { if (!o) setConfirmRevoke(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke survey?</AlertDialogTitle>
            <AlertDialogDescription>
              This immediately invalidates the link for <strong>{confirmRevoke?.label}</strong>.
              The surveyor will not be able to open or submit the form.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (confirmRevoke) revoke(confirmRevoke.ids); }}>
              {busy ? "Revoking…" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Extend dialog */}
      <Dialog open={!!extendDialog} onOpenChange={(o) => { if (!o) setExtendDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Extend expiry</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Add days to current expiry</label>
            <Input type="number" min={1} max={365}
              value={extendDialog?.days ?? 14}
              onChange={(e) => setExtendDialog((d) => d ? { ...d, days: Number(e.target.value) || 0 } : d)} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExtendDialog(null)} disabled={busy}>Cancel</Button>
            <Button disabled={busy || !extendDialog?.days}
              onClick={() => extendDialog && extend(extendDialog.ids, extendDialog.days)}>
              {busy ? "Extending…" : "Extend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF preview */}
      <Dialog open={!!pdfPreview} onOpenChange={(o) => {
        if (!o) setPdfPreview((cur) => { if (cur?.url) URL.revokeObjectURL(cur.url); return null; });
      }}>
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-8">
              <DialogTitle>Survey PDF</DialogTitle>
              {pdfPreview && (
                <Button asChild size="sm" variant="outline">
                  <a href={pdfPreview.url} download={pdfPreview.filename}>
                    <Download className="h-3 w-3 mr-1" /> Download
                  </a>
                </Button>
              )}
            </div>
          </DialogHeader>
          {pdfPreview && (
            <iframe title="Survey PDF preview" src={pdfPreview.url}
              className="min-h-0 flex-1 w-full rounded border bg-background" />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}