import { useMemo, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { STAGES, STAGE_STATUS_LABEL, STAGE_STATUS_COLORS, isCompleteStatus, type StageKey, type StageStatus } from "@/lib/wp/stageStatus";
import { StageDetailDialog, type StageRow as Row } from "@/components/wp/StageDetailDialog";

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
      const { error } = await (supabase as any).from("site_stage_status")
        .upsert(
          { work_package_id: wpId!, site_id: p.site_id, stage: p.stage, workflow_status: p.value },
          { onConflict: "site_id,stage" },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wp-stage-status", wpId] }),
    onError: (e: any) => toast.error(e.message ?? "Failed to update stage"),
  });

  /** Inline dropdown handler: 'done' always routes through the modal so
   *  the recipient requirement cannot be bypassed. */
  const handleInlineStatus = (site: any, stage: StageKey, next: StageStatus, row?: Row) => {
    if (next === "done") {
      setEditing({ siteId: site.site_id, siteName: site.sites?.site_name, stage, row });
      toast.info("Pick who this goes to next before marking Done.");
      return;
    }
    setStatus.mutate({ site_id: site.site_id, stage, value: next });
  };

  if ((sites as any[]).length === 0) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">No sites in this work package yet.</Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pre-Con Flow</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Stage-by-stage workflow with explicit owner assignment. No stage auto-assigns an owner — pick
            one when you're ready and the picked person is notified. Editing here updates the Site Register,
            Overview counters and site detail pages.
          </p>
          {focusSiteId && (
            <div className="mt-2 text-xs">
              <Badge variant="outline">Filtered to 1 site</Badge>
              <Link to={`/wp/${wpId}/sites/matrix`} className="ml-2 text-primary hover:underline">Show all sites</Link>
            </div>
          )}
        </div>
        <Badge variant="outline" className="shrink-0">Source of truth</Badge>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-8 gap-2">
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
              {STAGES.map((s) => (
                <th key={s.key} className={`p-2 text-left whitespace-nowrap ${s.track === "build" ? "bg-primary/5" : s.track === "connections" ? "bg-amber-500/5" : ""}`}>
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {s.track === "build" ? "Build" : s.track === "connections" ? "Connections" : ""}
                  </div>
                  {s.label}
                </th>
              ))}
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
                    <td key={st.key} className={`p-1 align-top ${st.track === "build" ? "bg-primary/[0.02]" : st.track === "connections" ? "bg-amber-500/[0.03]" : ""}`}>
                      <div className="flex items-center gap-1">
                        <Select value={v} onValueChange={(nv) => handleInlineStatus(s, st.key, nv as StageStatus, r)}>
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

