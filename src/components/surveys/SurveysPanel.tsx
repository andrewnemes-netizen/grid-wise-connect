import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, RefreshCw, Send, Ban, CalendarClock, AlertTriangle, Copy, ExternalLink, Search, FileText, Wand2 } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { SendSurveyDialog } from "@/components/portfolio/SendSurveyDialog";
import { sendSurveyToSites } from "@/lib/sendSurveyToSites";

type Status = "pending" | "opened" | "submitted" | "expired" | "cancelled" | "revoked";

interface Row {
  id: string;
  site_id: string;
  token: string;
  sent_to_email: string;
  sent_to_name: string | null;
  sent_by: string;
  status: Status;
  created_at: string;
  submitted_at: string | null;
  opened_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  response_id: string | null;
  site_name: string;
  postcode: string | null;
  wp_id?: string | null;
  wp_name?: string | null;
  sender_name?: string | null;
}

interface Props {
  workPackageId?: string;
  title?: string;
}

const STATUS_CLASS: Record<Status, string> = {
  pending: "bg-amber-100 text-amber-800",
  opened: "bg-blue-100 text-blue-800",
  submitted: "bg-emerald-100 text-emerald-800",
  expired: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
  revoked: "bg-red-100 text-red-800",
};

function deriveStatus(r: Row): Status {
  if (r.status === "submitted" || r.status === "revoked" || r.status === "cancelled") return r.status;
  if (new Date(r.expires_at).getTime() < Date.now()) return "expired";
  if (r.opened_at) return "opened";
  return "pending";
}

export function SurveysPanel({ workPackageId, title }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [wpFilter, setWpFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [publicBase, setPublicBase] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendSiteIds, setSendSiteIds] = useState<string[]>([]);
  const [extendTarget, setExtendTarget] = useState<Row | null>(null);
  const [extendDays, setExtendDays] = useState<number>(30);
  const [revokeTarget, setRevokeTarget] = useState<Row | Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings").select("public_app_base_url").limit(1).maybeSingle();
      setPublicBase((data?.public_app_base_url ?? "").replace(/\/$/, ""));
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    setSelected(new Set());
    let siteIds: string[] | null = null;
    if (workPackageId) {
      const { data: wpSites } = await supabase
        .from("wp_sites").select("site_id").eq("work_package_id", workPackageId);
      siteIds = (wpSites ?? []).map((x: any) => x.site_id);
      if (siteIds.length === 0) { setRows([]); setLoading(false); return; }
    }

    let q = supabase
      .from("site_surveys")
      .select("id, site_id, token, sent_to_email, sent_to_name, sent_by, status, created_at, submitted_at, opened_at, expires_at, revoked_at, response_id, sites!inner(site_name, postcode)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (siteIds) q = q.in("site_id", siteIds);
    const { data, error } = await q;
    if (error) { toast.error(error.message); setLoading(false); return; }

    const raw = (data as any[]) ?? [];
    const senderIds = Array.from(new Set(raw.map((r) => r.sent_by).filter(Boolean)));
    const siteIdList = Array.from(new Set(raw.map((r) => r.site_id)));

    const [profilesRes, wpRes] = await Promise.all([
      senderIds.length
        ? supabase.from("profiles").select("id, display_name, full_name, email").in("id", senderIds)
        : Promise.resolve({ data: [] as any[] }),
      siteIdList.length
        ? supabase.from("wp_sites").select("site_id, work_package_id, work_packages(name)").in("site_id", siteIdList)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const profileMap = new Map<string, any>((profilesRes.data ?? []).map((p: any) => [p.id, p]));
    const wpMap = new Map<string, { wp_id: string; wp_name: string }>();
    for (const w of ((wpRes as any).data ?? [])) {
      if (!wpMap.has(w.site_id)) wpMap.set(w.site_id, { wp_id: w.work_package_id, wp_name: w.work_packages?.name ?? "—" });
    }

    const mapped: Row[] = raw.map((r) => {
      const p = profileMap.get(r.sent_by);
      const wp = wpMap.get(r.site_id);
      return {
        id: r.id, site_id: r.site_id, token: r.token,
        sent_to_email: r.sent_to_email, sent_to_name: r.sent_to_name,
        sent_by: r.sent_by, status: r.status, created_at: r.created_at,
        submitted_at: r.submitted_at, opened_at: r.opened_at,
        expires_at: r.expires_at, revoked_at: r.revoked_at,
        response_id: r.response_id,
        site_name: r.sites?.site_name ?? "—",
        postcode: r.sites?.postcode ?? null,
        wp_id: wp?.wp_id ?? null, wp_name: wp?.wp_name ?? null,
        sender_name: p?.display_name ?? p?.full_name ?? p?.email ?? null,
      };
    });
    setRows(mapped);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [workPackageId]);

  // Duplicate detection: sites with >1 active (pending/opened) survey
  const duplicateSiteIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const s = deriveStatus(r);
      if (s === "pending" || s === "opened") counts.set(r.site_id, (counts.get(r.site_id) ?? 0) + 1);
    }
    return new Set(Array.from(counts.entries()).filter(([, n]) => n > 1).map(([id]) => id));
  }, [rows]);

  const wpOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.wp_id && r.wp_name) map.set(r.wp_id, r.wp_name);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = fromDate ? new Date(fromDate).getTime() : null;
    const to = toDate ? new Date(toDate).getTime() + 86400_000 : null;
    return rows.filter((r) => {
      const s = deriveStatus(r);
      if (statusFilter !== "all" && s !== statusFilter) return false;
      if (!workPackageId && wpFilter !== "all" && r.wp_id !== wpFilter) return false;
      if (q && !(r.site_name.toLowerCase().includes(q) || (r.postcode ?? "").toLowerCase().includes(q) || r.sent_to_email.toLowerCase().includes(q))) return false;
      const t = new Date(r.created_at).getTime();
      if (from && t < from) return false;
      if (to && t >= to) return false;
      return true;
    });
  }, [rows, search, fromDate, toDate, statusFilter, wpFilter, workPackageId]);

  const selectedRows = filtered.filter((r) => selected.has(r.id));
  const toggleAll = (checked: boolean) => {
    setSelected(checked ? new Set(filtered.map((r) => r.id)) : new Set());
  };
  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id); else n.delete(id);
      return n;
    });
  };

  const surveyUrl = (token: string) => `${publicBase || window.location.origin}/survey/${token}`;

  // -------- actions --------
  const doRevokeMany = async (targets: Row[], reason?: string) => {
    setBusy(true);
    let ok = 0, fail = 0;
    for (const r of targets) {
      const { error } = await supabase.rpc("revoke_survey" as any, { _survey_id: r.id, _reason: reason ?? null });
      if (error) fail++; else ok++;
    }
    setBusy(false);
    if (ok) toast.success(`Revoked ${ok} survey${ok === 1 ? "" : "s"}`);
    if (fail) toast.error(`${fail} failed`);
    await load();
  };

  const doExtend = async (target: Row, days: number) => {
    setBusy(true);
    const { error } = await supabase.rpc("extend_survey_expiry" as any, { _survey_id: target.id, _days: days });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Expiry extended by ${days} day${days === 1 ? "" : "s"}`);
    setExtendTarget(null);
    await load();
  };

  const doResend = async (targets: Row[]) => {
    setBusy(true);
    try {
      // group by site: pick latest sent_to_email per site to resend to
      const bySite = new Map<string, Row>();
      for (const r of targets) if (!bySite.has(r.site_id)) bySite.set(r.site_id, r);
      let sent = 0;
      for (const [siteId, r] of bySite) {
        const res = await sendSurveyToSites({
          sites: [{ id: siteId, site_name: r.site_name, surveyor_email: r.sent_to_email }],
          deliveryMode: "email",
          useSiteContact: false,
          extraEmails: [r.sent_to_email],
        });
        sent += res.emailedCount + res.linksOnlyCount;
      }
      toast.success(`Resent ${sent} survey${sent === 1 ? "" : "s"}`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Resend failed");
    } finally {
      setBusy(false);
    }
  };

  const keepNewestRevokeRest = async (siteId: string) => {
    const group = rows
      .filter((r) => r.site_id === siteId && (deriveStatus(r) === "pending" || deriveStatus(r) === "opened"))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (group.length < 2) { toast.info("No duplicates to resolve"); return; }
    const toRevoke = group.slice(1);
    await doRevokeMany(toRevoke, "Duplicate — superseded by newer survey");
  };

  const openSendDialog = (siteIds: string[]) => {
    if (siteIds.length === 0) { toast.info("Select at least one row"); return; }
    setSendSiteIds(Array.from(new Set(siteIds)));
    setSendOpen(true);
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{title ?? "Surveys"}</h2>
            <Badge variant="secondary">{filtered.length}</Badge>
            {duplicateSiteIds.size > 0 && (
              <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1">
                <AlertTriangle className="h-3 w-3" /> {duplicateSiteIds.size} duplicate site{duplicateSiteIds.size === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => openSendDialog(selectedRows.map((r) => r.site_id))}
              disabled={selectedRows.length === 0}
            >
              <Send className="h-3 w-3 mr-1" /> Send new survey
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-3 w-3 absolute left-2 top-2.5 text-muted-foreground" />
            <Input
              className="h-8 pl-7 w-56"
              placeholder="Site, postcode, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Status" /></SelectTrigger>
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
              <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Work package" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All work packages</SelectItem>
                {wpOptions.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-1 text-xs">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" className="h-8 w-36" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" className="h-8 w-36" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          {(search || statusFilter !== "all" || wpFilter !== "all" || fromDate || toDate) && (
            <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setStatusFilter("all"); setWpFilter("all"); setFromDate(""); setToDate(""); }}>
              Clear
            </Button>
          )}
        </div>

        {/* Bulk toolbar */}
        {selectedRows.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded border bg-muted/40 px-2 py-1.5 text-xs">
            <span className="font-medium">{selectedRows.length} selected</span>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => doResend(selectedRows)}>
              <Send className="h-3 w-3 mr-1" /> Resend (new token)
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setRevokeTarget(selectedRows)}>
              <Ban className="h-3 w-3 mr-1" /> Revoke
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" disabled={busy}>
                  <CalendarClock className="h-3 w-3 mr-1" /> Extend expiry
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 space-y-2">
                <Label className="text-xs">Extend all by (days)</Label>
                <Input type="number" min={1} max={180} value={extendDays} onChange={(e) => setExtendDays(Number(e.target.value))} />
                <Button
                  size="sm" className="w-full"
                  onClick={async () => {
                    setBusy(true);
                    let ok = 0;
                    for (const r of selectedRows) {
                      const { error } = await supabase.rpc("extend_survey_expiry" as any, { _survey_id: r.id, _days: extendDays });
                      if (!error) ok++;
                    }
                    setBusy(false);
                    toast.success(`Extended ${ok} survey${ok === 1 ? "" : "s"}`);
                    await load();
                  }}
                >Apply</Button>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Table */}
        <div className="border rounded overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={filtered.length > 0 && filtered.every((r) => selected.has(r.id))}
                    onCheckedChange={(v) => toggleAll(!!v)}
                  />
                </TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Postcode</TableHead>
                {!workPackageId && <TableHead>WP</TableHead>}
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
              {loading ? (
                <TableRow><TableCell colSpan={11}><div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div></TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={11}><div className="text-center py-6 text-sm text-muted-foreground">No surveys found.</div></TableCell></TableRow>
              ) : filtered.map((r) => {
                const s = deriveStatus(r);
                const isDup = duplicateSiteIds.has(r.site_id) && (s === "pending" || s === "opened");
                const canRevoke = s === "pending" || s === "opened" || s === "expired";
                const canExtend = s === "pending" || s === "opened" || s === "expired";
                return (
                  <TableRow key={r.id} className={isDup ? "bg-red-50/40" : undefined}>
                    <TableCell>
                      <Checkbox checked={selected.has(r.id)} onCheckedChange={(v) => toggleOne(r.id, !!v)} />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Link to={`/site/${r.site_id}`} className="hover:underline truncate max-w-[16rem]">{r.site_name}</Link>
                        {isDup && (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 gap-1 text-[10px]">
                            <AlertTriangle className="h-3 w-3" /> Duplicate
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{r.postcode ?? "—"}</TableCell>
                    {!workPackageId && (
                      <TableCell className="text-xs">
                        {r.wp_id ? <Link to={`/wp/${r.wp_id}/sites/surveys`} className="hover:underline">{r.wp_name}</Link> : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    )}
                    <TableCell className="text-xs whitespace-nowrap" title={format(new Date(r.created_at), "PPpp")}>
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell className="text-xs">{r.sender_name ?? "—"}</TableCell>
                    <TableCell className="text-xs truncate max-w-[14rem]" title={r.sent_to_email}>{r.sent_to_email}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_CLASS[s]}>{s}</Badge>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{format(new Date(r.expires_at), "d MMM yyyy")}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {r.submitted_at ? format(new Date(r.submitted_at), "d MMM HH:mm") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {r.response_id && (
                          <Button asChild size="sm" variant="ghost" className="h-7 px-2" title="View response">
                            <Link to={`/site/${r.site_id}`}><FileText className="h-3 w-3" /></Link>
                          </Button>
                        )}
                        {(s === "pending" || s === "opened") && (
                          <>
                            <Button
                              size="sm" variant="ghost" className="h-7 px-2"
                              title="Copy link"
                              onClick={() => { navigator.clipboard.writeText(surveyUrl(r.token)); toast.success("Link copied"); }}
                            ><Copy className="h-3 w-3" /></Button>
                            <Button asChild size="sm" variant="ghost" className="h-7 px-2" title="Open survey">
                              <a href={surveyUrl(r.token)} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /></a>
                            </Button>
                          </>
                        )}
                        {isDup && (
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2 text-red-700"
                            title="Keep newest, revoke duplicates for this site"
                            disabled={busy}
                            onClick={() => keepNewestRevokeRest(r.site_id)}
                          ><Wand2 className="h-3 w-3" /></Button>
                        )}
                        {canExtend && (
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2"
                            title="Extend expiry"
                            onClick={() => { setExtendTarget(r); setExtendDays(30); }}
                          ><CalendarClock className="h-3 w-3" /></Button>
                        )}
                        {(s === "pending" || s === "opened" || s === "expired") && (
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2"
                            title="Resend (new token)"
                            disabled={busy}
                            onClick={() => doResend([r])}
                          ><Send className="h-3 w-3" /></Button>
                        )}
                        {canRevoke && (
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2 text-red-700"
                            title="Revoke"
                            disabled={busy}
                            onClick={() => setRevokeTarget(r)}
                          ><Ban className="h-3 w-3" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Extend dialog */}
      <Dialog open={!!extendTarget} onOpenChange={(o) => !o && setExtendTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Extend survey expiry</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="text-muted-foreground">{extendTarget?.site_name} — {extendTarget?.sent_to_email}</div>
            <Label className="text-xs">Days to add</Label>
            <Input type="number" min={1} max={180} value={extendDays} onChange={(e) => setExtendDays(Number(e.target.value))} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendTarget(null)}>Cancel</Button>
            <Button disabled={busy || !extendTarget} onClick={() => extendTarget && doExtend(extendTarget, extendDays)}>
              {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null} Extend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <AlertDialog open={!!revokeTarget} onOpenChange={(o) => !o && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {Array.isArray(revokeTarget) ? `${revokeTarget.length} surveys?` : "this survey?"}</AlertDialogTitle>
            <AlertDialogDescription>
              The link will stop working immediately. Recipients that already opened it will see an error on submit.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                const arr = Array.isArray(revokeTarget) ? revokeTarget : revokeTarget ? [revokeTarget] : [];
                await doRevokeMany(arr);
                setRevokeTarget(null);
              }}
            >
              {busy ? "Revoking…" : "Revoke"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SendSurveyDialog
        open={sendOpen}
        onOpenChange={(o) => { setSendOpen(o); if (!o) load(); }}
        siteIds={sendSiteIds}
      />
    </Card>
  );
}