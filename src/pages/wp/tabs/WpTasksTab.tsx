import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ListTodo, X } from "lucide-react";
import {
  STAGES,
  STAGE_LABEL_MAP,
  STAGE_STATUS_LABEL,
  STAGE_STATUS_COLORS,
  type StageKey,
  type StageStatus,
} from "@/lib/wp/stageStatus";
import { StageDetailDialog, type StageRow } from "@/components/wp/StageDetailDialog";

type SiteLite = { id: string; site_name: string | null; postcode: string | null };

const STATUS_KEYS: StageStatus[] = ["not_started", "in_progress", "review", "blocked", "done"];

export default function WpTasksTab() {
  const { id: wpId } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editing, setEditing] = useState<{ siteId: string; siteName?: string; stage: StageKey; row: StageRow } | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["wp-tasks-stage-rows", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("site_stage_status")
        .select("*")
        .eq("work_package_id", wpId!);
      if (error) throw error;
      return (data ?? []) as StageRow[];
    },
  });

  // Only rows that have a real assignment (owner or recipients) are "tasks".
  const assignedRows = useMemo(
    () =>
      (rows as StageRow[]).filter(
        (r) =>
          !!r.owner_id ||
          (r.recipient_user_ids && r.recipient_user_ids.length > 0) ||
          (r.recipient_contact_ids && r.recipient_contact_ids.length > 0),
      ),
    [rows],
  );

  const siteIds = useMemo(() => Array.from(new Set(assignedRows.map((r) => r.site_id))), [assignedRows]);
  const { data: sites = [] } = useQuery({
    queryKey: ["wp-tasks-sites", siteIds.join(",")],
    enabled: siteIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sites")
        .select("id, site_name, postcode")
        .in("id", siteIds);
      if (error) throw error;
      return (data ?? []) as SiteLite[];
    },
  });
  const sitesById = useMemo(() => new Map((sites as SiteLite[]).map((s) => [s.id, s])), [sites]);

  const userIds = useMemo(() => {
    const set = new Set<string>();
    assignedRows.forEach((r) => {
      if (r.owner_id) set.add(r.owner_id);
      r.recipient_user_ids?.forEach((u) => set.add(u));
    });
    return Array.from(set);
  }, [assignedRows]);

  const contactIds = useMemo(() => {
    const set = new Set<string>();
    assignedRows.forEach((r) => r.recipient_contact_ids?.forEach((c) => set.add(c)));
    return Array.from(set);
  }, [assignedRows]);

  const { data: profiles = [] } = useQuery({
    queryKey: ["wp-tasks-profiles", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const profileById = useMemo(
    () => new Map((profiles as any[]).map((p) => [p.user_id, p])),
    [profiles],
  );

  const { data: contacts = [] } = useQuery({
    queryKey: ["wp-tasks-contacts", contactIds.join(",")],
    enabled: contactIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contacts")
        .select("id, full_name, email")
        .in("id", contactIds);
      if (error) throw error;
      return data ?? [];
    },
  });
  const contactById = useMemo(
    () => new Map((contacts as any[]).map((c) => [c.id, c])),
    [contacts],
  );

  const nameForUser = (id: string) => {
    const p: any = profileById.get(id);
    return p?.full_name || id.slice(0, 8);
  };
  const nameForContact = (id: string) => {
    const c: any = contactById.get(id);
    return c?.full_name || c?.email || id.slice(0, 8);
  };

  // Flatten to one row per (row, owner-key) for filtering & display.
  type TaskLine = {
    row: StageRow;
    ownerKey: string; // "u:<uuid>" or "c:<uuid>"
    ownerLabel: string;
    ownerKind: "internal" | "external";
  };

  const taskLines = useMemo<TaskLine[]>(() => {
    const out: TaskLine[] = [];
    for (const r of assignedRows) {
      const users = new Set<string>();
      if (r.owner_id) users.add(r.owner_id);
      r.recipient_user_ids?.forEach((u) => users.add(u));
      const contactsL = r.recipient_contact_ids ?? [];
      if (users.size === 0 && contactsL.length === 0) continue;
      users.forEach((u) =>
        out.push({ row: r, ownerKey: `u:${u}`, ownerLabel: nameForUser(u), ownerKind: "internal" }),
      );
      contactsL.forEach((c) =>
        out.push({ row: r, ownerKey: `c:${c}`, ownerLabel: nameForContact(c), ownerKind: "external" }),
      );
    }
    return out;
  }, [assignedRows, profileById, contactById]);

  const ownerOptions = useMemo(() => {
    const m = new Map<string, string>();
    taskLines.forEach((t) => m.set(t.ownerKey, t.ownerLabel));
    return Array.from(m.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [taskLines]);

  const filtered = useMemo(() => {
    return taskLines.filter((t) => {
      if (ownerFilter !== "all" && t.ownerKey !== ownerFilter) return false;
      if (stageFilter !== "all" && t.row.stage !== stageFilter) return false;
      if (statusFilter !== "all" && t.row.workflow_status !== statusFilter) return false;
      return true;
    });
  }, [taskLines, ownerFilter, stageFilter, statusFilter]);

  const clearFilters = () => {
    setOwnerFilter("all");
    setStageFilter("all");
    setStatusFilter("all");
  };
  const filterActive = ownerFilter !== "all" || stageFilter !== "all" || statusFilter !== "all";

  if (!wpId) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Every assigned Pre-Con Flow stage across all sites in this work package. Editing a task here
            updates the same record on the Pre-Con Flow — one source of truth, no duplicate task entity.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">{filtered.length} of {taskLines.length}</Badge>
      </div>

      <Card className="p-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 min-w-[220px]">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Task owner</span>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="h-9"><SelectValue placeholder="All owners" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All owners</SelectItem>
              {ownerOptions.map((o) => (
                <SelectItem key={o.key} value={o.key}>
                  {o.label}
                  {o.key.startsWith("c:") ? " · ext" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-[220px]">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Stage</span>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-9"><SelectValue placeholder="All stages" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {STAGES.map((s) => (
                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 min-w-[180px]">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Status</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUS_KEYS.map((k) => (
                <SelectItem key={k} value={k}>{STAGE_STATUS_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {filterActive && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
            <X className="h-4 w-4 mr-1" /> Clear filters
          </Button>
        )}
      </Card>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading tasks…</Card>
      ) : taskLines.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <ListTodo className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="font-medium">No assigned tasks yet</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Assign an owner or recipient to a Pre-Con Flow stage and it will appear here automatically.
          </p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No tasks match these filters.
        </Card>
      ) : (
        <Card className="p-0 overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left p-2">Site</th>
                <th className="text-left p-2">Stage</th>
                <th className="text-left p-2">Owner</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2">Planned start</th>
                <th className="text-left p-2">Planned finish</th>
                <th className="text-left p-2">Actual start</th>
                <th className="text-left p-2">Actual finish</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, i) => {
                const site = sitesById.get(t.row.site_id);
                const v = t.row.workflow_status;
                return (
                  <tr
                    key={`${t.row.id}:${t.ownerKey}:${i}`}
                    className="border-t hover:bg-muted/30 cursor-pointer"
                    onClick={() =>
                      setEditing({
                        siteId: t.row.site_id,
                        siteName: site?.site_name ?? undefined,
                        stage: t.row.stage,
                        row: t.row,
                      })
                    }
                  >
                    <td className="p-2 font-medium whitespace-nowrap">
                      {site?.site_name ?? t.row.site_id.slice(0, 8)}
                      {site?.postcode && (
                        <span className="ml-1 text-muted-foreground">· {site.postcode}</span>
                      )}
                    </td>
                    <td className="p-2 whitespace-nowrap">{STAGE_LABEL_MAP[t.row.stage]}</td>
                    <td className="p-2 whitespace-nowrap">
                      {t.ownerLabel}
                      {t.ownerKind === "external" && (
                        <Badge variant="outline" className="ml-1 text-[9px] uppercase">ext</Badge>
                      )}
                    </td>
                    <td className="p-2">
                      <Badge variant="outline" className={`text-[10px] border ${STAGE_STATUS_COLORS[v]}`}>
                        {STAGE_STATUS_LABEL[v]}
                      </Badge>
                    </td>
                    <td className="p-2 tabular-nums text-muted-foreground">{t.row.planned_start_date ?? "—"}</td>
                    <td className="p-2 tabular-nums text-muted-foreground">{t.row.planned_finish_date ?? "—"}</td>
                    <td className="p-2 tabular-nums text-muted-foreground">{t.row.actual_start_date ?? "—"}</td>
                    <td className="p-2 tabular-nums text-muted-foreground">{t.row.actual_finish_date ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {editing && wpId && (
        <StageDetailDialog
          wpId={wpId}
          siteId={editing.siteId}
          siteName={editing.siteName}
          stage={editing.stage}
          row={editing.row}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["wp-tasks-stage-rows", wpId] });
            qc.invalidateQueries({ queryKey: ["wp-stage-status", wpId] });
          }}
        />
      )}
    </div>
  );
}