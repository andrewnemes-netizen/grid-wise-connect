import { useMemo, useState, useEffect } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { STAGES, STAGE_LABEL_MAP, STAGE_STATUS_LABEL, STAGE_STATUS_COLORS, isCompleteStatus, type StageKey, type StageStatus } from "@/lib/wp/stageStatus";

type Row = {
  id: string;
  work_package_id: string;
  site_id: string;
  stage: StageKey;
  workflow_status: StageStatus;
  owner_id: string | null;
  planned_start_date: string | null;
  planned_finish_date: string | null;
  actual_start_date: string | null;
  actual_finish_date: string | null;
  blocked_reason: string | null;
  review_notes: string | null;
  updated_at: string;
  updated_by: string | null;
};

export default function WpMatrixTab() {
  const { id: wpId } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const focusSiteId = params.get("site");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ siteId: string; siteName?: string; stage: StageKey; row?: Row } | null>(null);

  const { data: sites = [] } = useQuery({
    queryKey: ["wp-sites-basic", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase.from("wp_sites")
        .select("id, sequence, local_ref, site_id, sites:sites(id, site_name, postcode)")
        .eq("work_package_id", wpId!)
        .order("sequence", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rows = [] } = useQuery({
    queryKey: ["wp-stage-status", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("site_stage_status")
        .select("*").eq("work_package_id", wpId!);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const byKey = useMemo(() => {
    const m = new Map<string, Row>();
    rows.forEach((r) => m.set(`${r.site_id}:${r.stage}`, r));
    return m;
  }, [rows]);

  const filteredSites = useMemo(() => {
    if (!focusSiteId) return sites as any[];
    return (sites as any[]).filter((s) => s.site_id === focusSiteId);
  }, [sites, focusSiteId]);

  const counts = useMemo(() => {
    const c: Record<string, { done: number; blocked: number; live: number }> = {};
    STAGES.forEach((s) => (c[s.key] = { done: 0, blocked: 0, live: 0 }));
    (sites as any[]).forEach((s: any) => {
      STAGES.forEach((st) => {
        const r = byKey.get(`${s.site_id}:${st.key}`);
        const v = (r?.workflow_status ?? "not_started") as StageStatus;
        if (isCompleteStatus(v)) c[st.key].done += 1;
        else if (v === "blocked") c[st.key].blocked += 1;
        else if (v === "in_progress" || v === "review") c[st.key].live += 1;
      });
    });
    return c;
  }, [sites, byKey]);

  const setStatus = useMutation({
    mutationFn: async (p: { site_id: string; stage: StageKey; value: StageStatus }) => {
      const existing = byKey.get(`${p.site_id}:${p.stage}`);
      if (existing) {
        const { error } = await (supabase as any).from("site_stage_status")
          .update({ workflow_status: p.value }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("site_stage_status").insert({
          work_package_id: wpId!, site_id: p.site_id, stage: p.stage, workflow_status: p.value,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wp-stage-status", wpId] }),
    onError: (e: any) => toast.error(e.message ?? "Failed to update stage"),
  });

  if ((sites as any[]).length === 0) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">No sites in this work package yet.</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Delivery Matrix</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            The single source of truth for stage workflow status. Editing here updates the Site Register,
            Overview counters and site detail pages. Click a status cell to record dates, owner, blockers and notes.
          </p>
          {focusSiteId && (
            <div className="mt-2 text-xs">
              <Badge variant="outline">Filtered to 1 site</Badge>
              <Link to={`../sites/matrix`} className="ml-2 text-primary hover:underline">Show all sites</Link>
            </div>
          )}
        </div>
        <Badge variant="outline" className="shrink-0">Source of truth</Badge>
      </div>

      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        {STAGES.map((st) => (
          <Card key={st.key} className="p-2">
            <div className="text-[11px] text-muted-foreground">{st.label}</div>
            <div className="text-lg font-semibold tabular-nums">
              {counts[st.key].done}
              <span className="text-xs text-muted-foreground">/{(sites as any[]).length}</span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              {counts[st.key].live} live · {counts[st.key].blocked} blocked
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-0 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-2 sticky left-0 bg-muted/40 z-10">Site</th>
              {STAGES.map((s) => <th key={s.key} className="p-2 text-left">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {filteredSites.map((s: any) => (
              <tr key={s.id} className="border-t">
                <td className="p-2 sticky left-0 bg-background font-medium whitespace-nowrap">
                  {s.local_ref ? `${s.local_ref} · ` : ""}{s.sites?.site_name}
                </td>
                {STAGES.map((st) => {
                  const r = byKey.get(`${s.site_id}:${st.key}`);
                  const v = (r?.workflow_status ?? "not_started") as StageStatus;
                  return (
                    <td key={st.key} className="p-1 align-top">
                      <div className="flex items-center gap-1">
                        <Select value={v} onValueChange={(nv) => setStatus.mutate({ site_id: s.site_id, stage: st.key, value: nv as StageStatus })}>
                          <SelectTrigger className={`h-7 text-[10px] px-2 border ${STAGE_STATUS_COLORS[v]} flex-1`}>
                            <SelectValue>{STAGE_STATUS_LABEL[v]}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(STAGE_STATUS_LABEL) as StageStatus[]).map((k) => (
                              <SelectItem key={k} value={k}>{STAGE_STATUS_LABEL[k]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={() => setEditing({ siteId: s.site_id, siteName: s.sites?.site_name, stage: st.key, row: r })}
                          title="Edit dates, owner, notes"
                        >
                          ⋯
                        </button>
                      </div>
                      {r?.blocked_reason && v === "blocked" && (
                        <div className="text-[10px] text-rose-600 mt-0.5 line-clamp-1" title={r.blocked_reason}>⚠ {r.blocked_reason}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="text-[11px] text-muted-foreground">
        Every change is recorded in an immutable audit trail with previous status, new status, user and timestamp.
      </p>

      {editing && wpId && (
        <StageDetailDialog
          wpId={wpId}
          siteId={editing.siteId}
          siteName={editing.siteName}
          stage={editing.stage}
          row={editing.row}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["wp-stage-status", wpId] })}
        />
      )}
    </div>
  );
}

function StageDetailDialog({
  wpId, siteId, siteName, stage, row, onClose, onSaved,
}: {
  wpId: string;
  siteId: string;
  siteName?: string;
  stage: StageKey;
  row?: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<StageStatus>((row?.workflow_status ?? "not_started") as StageStatus);
  const [plannedStart, setPlannedStart] = useState(row?.planned_start_date ?? "");
  const [plannedFinish, setPlannedFinish] = useState(row?.planned_finish_date ?? "");
  const [actualStart, setActualStart] = useState(row?.actual_start_date ?? "");
  const [actualFinish, setActualFinish] = useState(row?.actual_finish_date ?? "");
  const [blockedReason, setBlockedReason] = useState(row?.blocked_reason ?? "");
  const [reviewNotes, setReviewNotes] = useState(row?.review_notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setStatus((row?.workflow_status ?? "not_started") as StageStatus);
    setPlannedStart(row?.planned_start_date ?? "");
    setPlannedFinish(row?.planned_finish_date ?? "");
    setActualStart(row?.actual_start_date ?? "");
    setActualFinish(row?.actual_finish_date ?? "");
    setBlockedReason(row?.blocked_reason ?? "");
    setReviewNotes(row?.review_notes ?? "");
  }, [row?.id]);

  const { data: audit = [] } = useQuery({
    queryKey: ["stage-audit", siteId, stage],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("site_stage_status_audit")
        .select("previous_status,new_status,changed_by,changed_at,reason")
        .eq("site_id", siteId).eq("stage", stage)
        .order("changed_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = async () => {
    setSaving(true);
    try {
      const patch = {
        work_package_id: wpId,
        site_id: siteId,
        stage,
        workflow_status: status,
        planned_start_date: plannedStart || null,
        planned_finish_date: plannedFinish || null,
        actual_start_date: actualStart || null,
        actual_finish_date: actualFinish || null,
        blocked_reason: blockedReason || null,
        review_notes: reviewNotes || null,
      };
      if (row?.id) {
        const { error } = await (supabase as any).from("site_stage_status")
          .update(patch).eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("site_stage_status").insert(patch);
        if (error) throw error;
      }
      toast.success("Stage updated");
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{STAGE_LABEL_MAP[stage]} · {siteName ?? "Site"}</DialogTitle>
          <DialogDescription>Workflow status and delivery dates. All changes are recorded in the audit trail below.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Workflow status</span>
            <Select value={status} onValueChange={(v) => setStatus(v as StageStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(STAGE_STATUS_LABEL) as StageStatus[]).map((k) => (
                  <SelectItem key={k} value={k}>{STAGE_STATUS_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Planned start</span>
            <Input type="date" value={plannedStart ?? ""} onChange={(e) => setPlannedStart(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Planned finish</span>
            <Input type="date" value={plannedFinish ?? ""} onChange={(e) => setPlannedFinish(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Actual start</span>
            <Input type="date" value={actualStart ?? ""} onChange={(e) => setActualStart(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Actual finish</span>
            <Input type="date" value={actualFinish ?? ""} onChange={(e) => setActualFinish(e.target.value)} />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Blocked reason</span>
            <Textarea rows={2} value={blockedReason ?? ""} onChange={(e) => setBlockedReason(e.target.value)} placeholder="Only set when status is Blocked" />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Review notes</span>
            <Textarea rows={2} value={reviewNotes ?? ""} onChange={(e) => setReviewNotes(e.target.value)} />
          </label>
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Audit trail</div>
          {audit.length === 0 ? (
            <p className="text-xs text-muted-foreground">No changes recorded yet.</p>
          ) : (
            <ul className="text-xs space-y-1 max-h-40 overflow-auto">
              {audit.map((a: any, i: number) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-muted-foreground tabular-nums shrink-0">
                    {formatDistanceToNow(new Date(a.changed_at), { addSuffix: true })}
                  </span>
                  <span>
                    <Badge variant="outline" className="text-[10px]">{a.previous_status ?? "—"}</Badge>
                    <span className="mx-1">→</span>
                    <Badge variant="outline" className="text-[10px]">{a.new_status}</Badge>
                    {a.reason && <span className="ml-2 text-muted-foreground">· {a.reason}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}