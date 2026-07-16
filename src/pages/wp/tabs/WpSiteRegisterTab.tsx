import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Zap, ClipboardList, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { SitePreconGatesDialog } from "@/components/wp/SitePreconGatesDialog";

export default function WpSiteRegisterTab() {
  const { id: wpId } = useParams<{ id: string }>();
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gatesFor, setGatesFor] = useState<{ siteId: string; siteName?: string } | null>(null);
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["wp-site-register", wpId] });
    qc.invalidateQueries({ queryKey: ["wp-site-precon-status", wpId] });
  };
  const clearSel = () => setSelected(new Set());

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["wp-site-register", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wp_sites")
        .select(`
          id, sequence, local_ref, site_id,
          sites:sites(id, site_name, postcode, viability_index, updated_at, current_stage_id, primary_partner_id)
        `)
        .eq("work_package_id", wpId!)
        .order("sequence", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const siteIds = useMemo(() => rows.map((r: any) => r.site_id).filter(Boolean), [rows]);

  const { data: precon = [] } = useQuery({
    queryKey: ["wp-site-precon-status", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_wp_site_precon_status")
        .select("*")
        .eq("work_package_id", wpId!);
      if (error) throw error;
      return data ?? [];
    },
  });
  const preconBySite = new Map<string, any>((precon as any[]).map((p) => [p.site_id, p]));

  const bulkSendPoc = useMutation({
    mutationFn: async (siteIds: string[]) => {
      if (!wpId || siteIds.length === 0) return;
      const due = new Date(); due.setDate(due.getDate() + 45);
      const rows = siteIds.map((sid) => ({
        work_package_id: wpId,
        site_id: sid,
        task_kind: "poc" as const,
        title: "POC application",
        status: "not_started",
        due_date: due.toISOString().slice(0, 10),
      }));
      const { error } = await (supabase as any).from("wp_tasks").insert(rows);
      if (error) throw error;
      await (supabase as any).from("audit_log").insert(
        siteIds.map((sid) => ({ action: "poc.requested", site_id: sid, meta_json: { work_package_id: wpId } })),
      );
    },
    onSuccess: (_d, sids) => { toast.success(`POC task raised for ${sids.length} site${sids.length === 1 ? "" : "s"}`); clearSel(); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Failed to raise POC tasks"),
  });

  const bulkSurveyAlloc = useMutation({
    mutationFn: async (siteIds: string[]) => {
      if (!wpId || siteIds.length === 0) return;
      const due = new Date(); due.setDate(due.getDate() + 14);
      const rows = siteIds.map((sid) => ({
        work_package_id: wpId,
        site_id: sid,
        task_kind: "survey_alloc" as const,
        title: "Allocate site survey",
        status: "not_started",
        due_date: due.toISOString().slice(0, 10),
      }));
      const { error } = await (supabase as any).from("wp_tasks").insert(rows);
      if (error) throw error;
    },
    onSuccess: (_d, sids) => { toast.success(`Survey allocation queued for ${sids.length} site${sids.length === 1 ? "" : "s"}`); clearSel(); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Failed to queue survey allocation"),
  });

  const bulkPassFinalGate = useMutation({
    mutationFn: async (siteIds: string[]) => {
      if (!wpId || siteIds.length === 0) return;
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id ?? null;
      const rows = siteIds.map((sid) => ({
        work_package_id: wpId,
        site_id: sid,
        gate_key: "final_review" as const,
        state: "passed" as const,
        passed_at: new Date().toISOString(),
        passed_by: uid,
      }));
      const { error } = await (supabase as any)
        .from("site_precon_gates")
        .upsert(rows, { onConflict: "work_package_id,site_id,gate_key" });
      if (error) throw error;
      await (supabase as any).from("audit_log").insert(
        siteIds.map((sid) => ({ action: "precon.final_review.passed", site_id: sid, meta_json: { work_package_id: wpId } })),
      );
    },
    onSuccess: (_d, sids) => { toast.success(`Final review passed for ${sids.length} site${sids.length === 1 ? "" : "s"}`); clearSel(); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "Failed to pass final review"),
  });

  const { data: partners = [] } = useQuery({
    queryKey: ["wp-site-partners", wpId, siteIds.join(",")],
    enabled: siteIds.length > 0,
    queryFn: async () => {
      const partnerIds = Array.from(new Set(rows.map((r: any) => r.sites?.primary_partner_id).filter(Boolean))) as string[];
      if (partnerIds.length === 0) return [];
      const { data, error } = await supabase.from("partners").select("id, name").in("id", partnerIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stages = [] } = useQuery({
    queryKey: ["stage-defs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stage_definitions").select("id, label");
      if (error) throw error;
      return data ?? [];
    },
  });

  const partnerById = new Map(partners.map((p: any) => [p.id, p]));
  const stageById = new Map(stages.map((s: any) => [s.id, s]));

  const filtered = rows.filter((r: any) => {
    if (!q.trim()) return true;
    const s = r.sites;
    const hay = [s?.site_name, s?.postcode, r.local_ref].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  const filteredSiteIds = filtered.map((r: any) => r.site_id).filter(Boolean) as string[];
  const allChecked = filteredSiteIds.length > 0 && filteredSiteIds.every((id) => selected.has(id));
  const someChecked = !allChecked && filteredSiteIds.some((id) => selected.has(id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allChecked) filteredSiteIds.forEach((id) => next.delete(id));
    else filteredSiteIds.forEach((id) => next.add(id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const selectedIds = Array.from(selected);
  const busy = bulkSendPoc.isPending || bulkSurveyAlloc.isPending || bulkPassFinalGate.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Site Register</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Every site in scope for this WP with stage, partner and viability. Click a row to open the site detail.
          </p>
        </div>
        <div className="relative w-64">
          <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, postcode, ref" className="pl-8 h-9" />
        </div>
      </div>

      {selectedIds.length > 0 && (
        <Card className="p-2 flex flex-wrap items-center gap-2 border-primary/40 bg-primary/5">
          <span className="text-xs font-medium ml-2">{selectedIds.length} selected</span>
          <div className="flex-1" />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => bulkSendPoc.mutate(selectedIds)}>
            <Zap className="h-3.5 w-3.5 mr-1" /> Send for POC
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => bulkSurveyAlloc.mutate(selectedIds)}>
            <ClipboardList className="h-3.5 w-3.5 mr-1" /> Queue survey
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => bulkPassFinalGate.mutate(selectedIds)}>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Pass final review
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSel}>Clear</Button>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allChecked ? true : someChecked ? "indeterminate" : false}
                    onCheckedChange={toggleAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Postcode</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead className="text-right">Viability</TableHead>
                <TableHead>POC</TableHead>
                <TableHead>Offer</TableHead>
                <TableHead>Estimate</TableHead>
                <TableHead>Survey</TableHead>
                <TableHead>EV design</TableHead>
                <TableHead>ICP design</TableHead>
                <TableHead>RAMS</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Next action</TableHead>
                <TableHead>Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={17}><Skeleton className="h-5 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={17} className="text-center text-muted-foreground py-8">
                    {rows.length === 0 ? "No sites allocated to this work package yet." : "No sites match your search."}
                  </TableCell>
                </TableRow>
              ) : filtered.map((r: any, idx: number) => {
                const s = r.sites;
                const partner = s?.primary_partner_id ? partnerById.get(s.primary_partner_id) : null;
                const stage = s?.current_stage_id ? stageById.get(s.current_stage_id) : null;
                const pc = s?.id ? preconBySite.get(s.id) : null;
                const dash = <span className="text-muted-foreground text-xs">—</span>;
                const laneBadge = (val?: string | null) =>
                  val ? <Badge variant="outline" className="text-[10px]">{val}</Badge> : dash;
                const isSel = s?.id ? selected.has(s.id) : false;
                return (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => {
                    if (s?.id) window.open(`/site/${s.id}`, "_blank");
                  }}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSel}
                        onCheckedChange={() => s?.id && toggleOne(s.id)}
                        aria-label="Select site"
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums text-xs">{r.sequence ?? idx + 1}</TableCell>
                    <TableCell className="font-medium">
                      <Link to={`/site/${s?.id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {s?.site_name ?? "Site"}
                      </Link>
                      {r.local_ref && <span className="text-[11px] text-muted-foreground ml-2">{r.local_ref}</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s?.postcode ?? "—"}</TableCell>
                    <TableCell>
                      {stage ? <Badge variant="secondary" className="text-[10px]">{(stage as any).label}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">{(partner as any)?.name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s?.viability_index != null ? (
                        <Badge variant={s.viability_index >= 70 ? "default" : s.viability_index >= 40 ? "secondary" : "destructive"}>
                          {s.viability_index}
                        </Badge>
                      ) : <span className="text-muted-foreground text-xs">—</span>}
                    </TableCell>
                    <TableCell>{laneBadge(pc?.poc_status)}</TableCell>
                    <TableCell>{laneBadge(pc?.latest_offer_status)}</TableCell>
                    <TableCell>{laneBadge(pc?.estimate_status)}</TableCell>
                    <TableCell>{laneBadge(pc?.survey_status)}</TableCell>
                    <TableCell>{laneBadge(pc?.ev_design_status)}</TableCell>
                    <TableCell>{laneBadge(pc?.icp_design_status)}</TableCell>
                    <TableCell>{laneBadge(pc?.rams_status)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <button
                        className="inline-flex"
                        onClick={() => s?.id && setGatesFor({ siteId: s.id, siteName: s.site_name })}
                        title="Open gates"
                      >
                        {laneBadge(pc?.final_review_state)}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs">
                      {pc?.next_action_label ? (
                        <span>
                          {pc.next_action_label}
                          {pc.next_action_due && (
                            <span className="text-muted-foreground ml-1">· {pc.next_action_due}</span>
                          )}
                        </span>
                      ) : pc?.blocker_reason ? (
                        <Badge variant="destructive" className="text-[10px]">Blocked</Badge>
                      ) : dash}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {s?.updated_at ? formatDistanceToNow(new Date(s.updated_at), { addSuffix: true }) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <p className="text-[11px] text-muted-foreground">{filtered.length} of {rows.length} sites shown.</p>
      )}

      {gatesFor && wpId && (
        <SitePreconGatesDialog
          open={!!gatesFor}
          onOpenChange={(v) => !v && setGatesFor(null)}
          workPackageId={wpId}
          siteId={gatesFor.siteId}
          siteName={gatesFor.siteName}
        />
      )}
    </div>
  );
}