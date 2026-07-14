import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronDown, ChevronRight, MoreHorizontal, Search, Trash2, Plus, EyeOff, GripVertical,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useBoardConfig, BoardScopeColumn } from "@/hooks/useBoardConfig";
import { runAutomations } from "@/lib/board/automations";
import {
  BoardColumn, BoardViewConfig, StatusOption, DEFAULT_STATUS_OPTIONS, DEFAULT_PRIORITY_OPTIONS,
} from "@/lib/board/types";
import { StatusCell } from "./cells/StatusCell";
import { TextCell } from "./cells/TextCell";
import { NumberCell } from "./cells/NumberCell";
import { DateCell } from "./cells/DateCell";
import { ProgressCell } from "./cells/ProgressCell";
import { CheckboxCell } from "./cells/CheckboxCell";
import { PersonCell } from "./cells/PersonCell";
import { FormulaCell } from "./cells/FormulaCell";
import { AddColumnPopover } from "./AddColumnPopover";
import { ViewsMenu } from "./ViewsMenu";
import { AutomationsPanel } from "./AutomationsPanel";

const GROUP_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#ec4899", "#14b8a6", "#ef4444", "#8b5cf6"];

function getBuiltin(row: any, key: string) {
  return row[key];
}
function getCustom(row: any, key: string) {
  return row.metadata_json?.custom?.[key];
}
function getValue(row: any, col: BoardColumn) {
  if (col.is_system) return getBuiltin(row, col.options_json.builtinKey ?? col.key);
  return getCustom(row, col.key);
}

export function TaskBoard({
  projectId,
  tasks,
  milestones,
  scope,
  statusOptions,
  invalidateKeys,
  addRowPlaceholder,
  buildNewRow,
}: {
  projectId: string;
  tasks: any[];
  milestones: { id: string; name: string }[];
  scope?: { table: "project_tasks" | "wp_tasks" | "work_packages"; scopeCol: BoardScopeColumn; scopeId: string; builtinSet?: "tasks" | "work_packages" };
  statusOptions?: StatusOption[];
  invalidateKeys?: string[][];
  addRowPlaceholder?: string;
  buildNewRow?: (title: string) => Record<string, any>;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const effectiveScope = scope ?? { table: "project_tasks" as const, scopeCol: "project_id" as BoardScopeColumn, scopeId: projectId };
  const table = effectiveScope.table;
  const scopeCol = effectiveScope.scopeCol;
  const scopeId = effectiveScope.scopeId;
  const isWpBoard = table === "work_packages";
  const statuses = statusOptions ?? DEFAULT_STATUS_OPTIONS;
  const cfg = useBoardConfig(scopeId, scopeCol, effectiveScope.builtinSet ?? (isWpBoard ? "work_packages" : "tasks"));
  const invalidateAll = () => {
    (invalidateKeys ?? [["delivery-tasks", projectId], ["delivery-project", projectId]])
      .forEach((k) => qc.invalidateQueries({ queryKey: k }));
  };

  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [localConfig, setLocalConfig] = useState<BoardViewConfig>({ groupBy: "status", sortBy: [], search: "" });
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Load active view config
  const activeView = cfg.views.find((v) => v.id === activeViewId);
  const viewCfg: BoardViewConfig = activeView ? { ...localConfig, ...activeView.config_json } : localConfig;

  const visibleColumns = useMemo(() => {
    return cfg.columns.filter((c) => !hidden.has(c.id));
  }, [cfg.columns, hidden]);

  const updateTask = useMutation({
    mutationFn: async ({ id, patch, isCustom, customKey }: { id: string; patch: any; isCustom?: boolean; customKey?: string }) => {
      const before = tasks.find((t) => t.id === id);
      if (isCustom && customKey) {
        const meta = { ...(before?.metadata_json ?? {}) };
        meta.custom = { ...(meta.custom ?? {}), [customKey]: patch };
        const { error } = await supabase.from(table as any).update({ metadata_json: meta }).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table as any).update(patch).eq("id", id);
        if (error) throw error;
        if (before) await runAutomations(cfg.automations, id, before, { ...before, ...patch });
      }
    },
    onSuccess: () => {
      invalidateAll();
      
    },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  const createTask = useMutation({
    mutationFn: async (title: string) => {
      const base = buildNewRow
        ? buildNewRow(title)
        : isWpBoard
          ? { name: title, code: `WP-${Date.now().toString(36).toUpperCase()}`, status: statuses[0]?.value ?? "planning", created_by: user?.id }
          : { title, status: statuses[0]?.value ?? "todo", priority: "medium", created_by: user?.id };
      const { error } = await supabase.from(table as any).insert({ [scopeCol]: scopeId, ...base } as any);
      if (error) throw error;
    },
    onSuccess: () => invalidateAll(),
    onError: (e: any) => toast.error(e.message ?? "Create failed"),
  });

  const bulkDelete = useMutation({
    mutationFn: async () => {
      const ids = Array.from(selected);
      const { error } = await supabase.from(table as any).delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelected(new Set());
      invalidateAll();
      toast.success("Deleted");
    },
  });

  const bulkStatus = useMutation({
    mutationFn: async (status: string) => {
      const ids = Array.from(selected);
      const { error } = await supabase.from(table as any).update({ status: status as any }).in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateAll();
    },
  });

  // Filter + sort
  const filteredTasks = useMemo(() => {
    let out = tasks;
    const s = (viewCfg.search ?? "").trim().toLowerCase();
    if (s) out = out.filter((t) => (t.title ?? "").toLowerCase().includes(s));
    return out;
  }, [tasks, viewCfg.search]);

  // Group
  const groupBy = viewCfg.groupBy ?? "status";
  const groups = useMemo(() => {
    if (!groupBy || groupBy === "none") return [{ key: "__all__", label: "All tasks", color: GROUP_COLORS[0], rows: filteredTasks }];
    const map = new Map<string, any[]>();
    for (const t of filteredTasks) {
      let k: any = "—";
      if (groupBy === "status") k = t.status ?? "todo";
      else if (groupBy === "priority") k = t.priority ?? "medium";
      else if (groupBy === "owner") k = t.owner_user_id ?? "unassigned";
      else if (groupBy === "milestone") k = t.milestone_id ?? "none";
      const key = String(k);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    const arr: { key: string; label: string; color: string; rows: any[] }[] = [];
    let i = 0;
    for (const [key, rows] of map.entries()) {
      let label = key;
      let color = GROUP_COLORS[i % GROUP_COLORS.length];
      if (groupBy === "status") {
        const o = statuses.find((x) => x.value === key);
        label = o?.label ?? key;
        color = o?.color ?? color;
      } else if (groupBy === "priority") {
        const o = DEFAULT_PRIORITY_OPTIONS.find((x) => x.value === key);
        label = o?.label ?? key;
        color = o?.color ?? color;
      } else if (groupBy === "milestone") {
        const m = milestones.find((x) => x.id === key);
        label = m?.name ?? (key === "none" ? "No milestone" : key);
      } else if (groupBy === "owner") {
        label = key === "unassigned" ? "Unassigned" : "Assigned";
      }
      arr.push({ key, label, color, rows });
      i++;
    }
    return arr;
  }, [filteredTasks, groupBy, milestones, statuses]);

  const gridCols = useMemo(() => {
    return `32px ${visibleColumns.map((c) => `${c.width}px`).join(" ")} 40px`;
  }, [visibleColumns]);

  const renderCell = (col: BoardColumn, row: any) => {
    const bkey = col.options_json.builtinKey;
    const setBuiltin = (patch: any) => updateTask.mutate({ id: row.id, patch });
    const setCustom = (v: any) => updateTask.mutate({ id: row.id, patch: v, isCustom: true, customKey: col.key });

    if (col.is_system) {
      // Generic (non-task) system columns write directly to a DB column matching builtinKey
      const dbKey = bkey ?? col.key;
      const writeGeneric = (v: any) => setBuiltin({ [dbKey]: v });
      switch (bkey) {
        case "title":
          return <TextCell value={row.title} onChange={(v) => setBuiltin({ title: v })} />;
        case "status":
          return <StatusCell
            value={row.status}
            options={(col.options_json.options ?? statuses)}
            onChange={(v) => setBuiltin(isWpBoard ? { status: v as any } : { status: v as any, percent_complete: v === "done" ? 100 : row.percent_complete })}
          />;
        case "priority":
          return <StatusCell value={row.priority} options={DEFAULT_PRIORITY_OPTIONS} onChange={(v) => setBuiltin({ priority: v as any })} />;
        case "owner":
          return <PersonCell value={row.owner_user_id} onChange={(v) => setBuiltin({ owner_user_id: v })} />;
        case "due_date":
          return <DateCell value={row.due_date} onChange={(v) => setBuiltin({ due_date: v })} />;
        case "percent_complete":
          return <ProgressCell value={Number(row.percent_complete) || 0} onChange={(v) => setBuiltin({ percent_complete: v, status: v >= 100 ? "done" : row.status })} />;
        case "estimated_hours":
          return <NumberCell value={row.estimated_hours} onChange={(v) => setBuiltin({ estimated_hours: v })} />;
      }
      // Fallback: render by column type against the DB column named by builtinKey
      switch (col.type) {
        case "text": return <TextCell value={row[dbKey]} onChange={writeGeneric} />;
        case "number": return <NumberCell value={row[dbKey]} onChange={writeGeneric} />;
        case "currency": return <NumberCell value={row[dbKey]} onChange={writeGeneric} prefix={col.options_json.currency ?? "£"} />;
        case "date": return <DateCell value={row[dbKey]} onChange={writeGeneric} />;
        case "checkbox": return <CheckboxCell value={row[dbKey]} onChange={writeGeneric} />;
        case "status":
        case "dropdown":
          return <StatusCell value={row[dbKey]} options={col.options_json.options ?? []} onChange={writeGeneric} />;
      }
      return null;
    }
    const val = getCustom(row, col.key);
    switch (col.type) {
      case "text": return <TextCell value={val} onChange={setCustom} />;
      case "number": return <NumberCell value={val} onChange={setCustom} />;
      case "currency": return <NumberCell value={val} onChange={setCustom} prefix="£" />;
      case "date": return <DateCell value={val} onChange={setCustom} />;
      case "checkbox": return <CheckboxCell value={val} onChange={setCustom} />;
      case "status":
      case "dropdown":
        return <StatusCell value={val} options={col.options_json.options ?? []} onChange={setCustom} />;
      case "person": return <PersonCell value={val ?? null} onChange={setCustom} />;
      case "formula": return <FormulaCell expression={col.options_json.expression ?? ""} row={row} />;
      default: return null;
    }
  };

  const aggregate = (col: BoardColumn, rows: any[]): string => {
    const agg = col.options_json.aggregate;
    if (!agg || agg === "none") return "";
    const nums = rows.map((r) => Number(getValue(r, col))).filter((n) => Number.isFinite(n));
    if (nums.length === 0) return "";
    if (agg === "count") return String(nums.length);
    const sum = nums.reduce((a, b) => a + b, 0);
    if (agg === "sum") return sum.toLocaleString();
    if (agg === "avg") return (sum / nums.length).toFixed(1);
    return "";
  };

  const [newTitle, setNewTitle] = useState("");

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 w-56 pl-7"
            placeholder="Search tasks…"
            value={viewCfg.search ?? ""}
            onChange={(e) => setLocalConfig((c) => ({ ...c, search: e.target.value }))}
          />
        </div>
        <Select value={groupBy ?? "none"} onValueChange={(v) => setLocalConfig((c) => ({ ...c, groupBy: v }))}>
          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No grouping</SelectItem>
            <SelectItem value="status">Group by status</SelectItem>
            <SelectItem value="priority">Group by priority</SelectItem>
            <SelectItem value="owner">Group by owner</SelectItem>
            <SelectItem value="milestone">Group by milestone</SelectItem>
          </SelectContent>
        </Select>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8"><EyeOff className="h-3 w-3 mr-1" /> Columns</Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2">
            {cfg.columns.map((c) => (
              <label key={c.id} className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-muted rounded cursor-pointer">
                <Checkbox
                  checked={!hidden.has(c.id)}
                  onCheckedChange={(v) => {
                    setHidden((s) => {
                      const n = new Set(s);
                      if (v) n.delete(c.id); else n.add(c.id);
                      return n;
                    });
                  }}
                />
                <span className="flex-1">{c.label}</span>
                {!c.is_system && (
                  <button
                    className="text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.preventDefault(); cfg.deleteColumn.mutate(c.id); }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </label>
            ))}
          </PopoverContent>
        </Popover>
        <AddColumnPopover onAdd={(col) => cfg.upsertColumn.mutate({ ...col, sort_index: cfg.columns.length })} />
        <ViewsMenu
          views={cfg.views}
          activeId={activeViewId}
          currentConfig={{ ...viewCfg, hidden: Array.from(hidden) } as any}
          onSelect={(id) => {
            setActiveViewId(id);
            const v = cfg.views.find((x) => x.id === id);
            if (v) {
              setLocalConfig(v.config_json ?? {});
              const h = (v.config_json as any).hidden ?? [];
              setHidden(new Set(h));
            }
          }}
          onSave={(name, config) => cfg.upsertView.mutate({ name, config_json: config })}
          onDelete={(id) => { cfg.deleteView.mutate(id); if (activeViewId === id) setActiveViewId(null); }}
          onSetDefault={(id) => cfg.upsertView.mutate({ id, is_default: true })}
        />
        <AutomationsPanel
          automations={cfg.automations}
          columns={cfg.columns}
          onCreate={(a) => cfg.upsertAutomation.mutate(a)}
          onUpdate={(a) => cfg.upsertAutomation.mutate(a)}
          onDelete={(id) => cfg.deleteAutomation.mutate(id)}
        />

        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2 bg-primary/10 border border-primary/30 rounded px-2 py-1">
            <span className="text-xs font-medium">{selected.size} selected</span>
            <Select onValueChange={(v) => bulkStatus.mutate(v)}>
              <SelectTrigger className="h-7 w-32 text-xs"><SelectValue placeholder="Set status" /></SelectTrigger>
              <SelectContent>
                {statuses.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" variant="destructive" className="h-7" onClick={() => bulkDelete.mutate()}>
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
          </div>
        )}
      </div>

      {/* Board */}
      <div className="border rounded-md overflow-x-auto bg-background">
        {/* Header row */}
        <div className="grid border-b bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" style={{ gridTemplateColumns: gridCols, minWidth: "fit-content" }}>
          <div className="px-2 py-2 flex items-center justify-center border-r">
            <Checkbox
              checked={selected.size > 0 && selected.size === filteredTasks.length}
              onCheckedChange={(v) => setSelected(v ? new Set(filteredTasks.map((t) => t.id)) : new Set())}
            />
          </div>
          {visibleColumns.map((c) => (
            <div key={c.id} className="px-2 py-2 border-r truncate">{c.label}</div>
          ))}
          <div />
        </div>

        {/* Groups */}
        {groups.map((g) => {
          const isCollapsed = collapsed.has(g.key);
          return (
            <div key={g.key}>
              {/* Group header */}
              <div className="grid border-b bg-muted/20 hover:bg-muted/30" style={{ gridTemplateColumns: gridCols, minWidth: "fit-content" }}>
                <div className="flex items-center justify-center border-r" style={{ background: g.color, width: 4 }} />
                <button
                  className="col-span-full flex items-center gap-2 px-3 py-2 text-left"
                  style={{ gridColumn: `2 / span ${visibleColumns.length + 1}` }}
                  onClick={() => setCollapsed((s) => {
                    const n = new Set(s);
                    if (n.has(g.key)) n.delete(g.key); else n.add(g.key);
                    return n;
                  })}
                >
                  {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  <span className="text-sm font-semibold" style={{ color: g.color.startsWith("hsl") ? g.color : g.color }}>{g.label}</span>
                  <span className="text-xs text-muted-foreground">{g.rows.length}</span>
                </button>
              </div>

              {/* Rows */}
              {!isCollapsed && g.rows.map((row) => (
                <div
                  key={row.id}
                  className="grid border-b hover:bg-muted/20 items-stretch"
                  style={{ gridTemplateColumns: gridCols, minWidth: "fit-content", minHeight: 40 }}
                >
                  <div className="flex items-center justify-center border-r">
                    <Checkbox
                      checked={selected.has(row.id)}
                      onCheckedChange={(v) => setSelected((s) => {
                        const n = new Set(s);
                        if (v) n.add(row.id); else n.delete(row.id);
                        return n;
                      })}
                    />
                  </div>
                  {visibleColumns.map((col) => (
                    <div key={col.id} className="border-r overflow-hidden flex items-stretch">
                      {renderCell(col, row)}
                    </div>
                  ))}
                  <div className="flex items-center justify-center">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-6 w-6">
                          <MoreHorizontal className="h-3 w-3" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-40 p-1">
                        <button
                          className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted flex items-center gap-2 text-destructive"
                          onClick={async () => {
                            await supabase.from(table as any).delete().eq("id", row.id);
                            invalidateAll();
                          }}
                        >
                          <Trash2 className="h-3 w-3" /> Delete task
                        </button>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              ))}

              {/* Group footer with aggregations */}
              {!isCollapsed && g.rows.length > 0 && (
                <div className="grid border-b bg-muted/10 text-xs text-muted-foreground" style={{ gridTemplateColumns: gridCols, minWidth: "fit-content" }}>
                  <div className="border-r" />
                  {visibleColumns.map((c) => (
                    <div key={c.id} className="px-2 py-1.5 border-r text-right tabular-nums">
                      {aggregate(c, g.rows)}
                    </div>
                  ))}
                  <div />
                </div>
              )}
            </div>
          );
        })}

        {/* Add task row */}
        <div className="flex items-center gap-2 p-2">
          <Plus className="h-3 w-3 text-muted-foreground ml-1" />
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newTitle.trim()) {
                createTask.mutate(newTitle.trim());
                setNewTitle("");
              }
            }}
            placeholder="+ Add task"
            className="flex-1 bg-transparent text-sm outline-none px-1"
          />
        </div>
      </div>
    </div>
  );
}