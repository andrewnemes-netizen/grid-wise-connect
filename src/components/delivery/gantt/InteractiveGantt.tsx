import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ZoomIn, ZoomOut, ChevronDown, ChevronRight, GitBranch, CalendarDays, Crosshair } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";

type Zoom = "day" | "week" | "month";

const ZOOM_WIDTHS: Record<Zoom, number> = { day: 28, week: 90, month: 280 };
const MS_DAY = 86400000;

function toDate(s: string | null | undefined) { return s ? new Date(s) : null; }
function iso(d: Date) { return d.toISOString().slice(0, 10); }
function daysBetween(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / MS_DAY); }
function addDays(d: Date, n: number) { return new Date(d.getTime() + n * MS_DAY); }
function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

export function InteractiveGantt({
  scope, milestones = [],
}: {
  scope: { table: "wp_tasks" | "project_tasks"; depsTable: "wp_task_dependencies" | "project_task_dependencies"; scopeCol: "work_package_id" | "project_id"; scopeId: string };
  milestones?: any[];
}) {
  const qc = useQueryClient();
  const [zoom, setZoom] = useState<Zoom>("week");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const didAutoFitRef = useRef(false);
  const [openEditorId, setOpenEditorId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);

  const tasksQ = useQuery({
    queryKey: [`gantt-tasks`, scope.scopeId],
    queryFn: async () => {
      const { data, error } = await supabase.from(scope.table as any).select("*").eq(scope.scopeCol, scope.scopeId).order("sort_index").order("created_at");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const depsQ = useQuery({
    queryKey: [`gantt-deps`, scope.scopeId],
    queryFn: async () => {
      const { data, error } = await supabase.from(scope.depsTable as any).select("*");
      if (error) return [];
      return (data ?? []) as any[];
    },
  });

  const updateTask = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from(scope.table as any).update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`gantt-tasks`, scope.scopeId] }); toast.success("Saved", { duration: 1200 }); },
    onError: (e: any) => toast.error(e.message),
  });

  const tasks = tasksQ.data ?? [];
  const deps = depsQ.data ?? [];

  // Determine range
  const dates = tasks.flatMap((t) => [toDate(t.start_date), toDate(t.due_date)]).filter(Boolean) as Date[];
  const today = startOfDay(new Date());
  const minDate = dates.length ? startOfDay(new Date(Math.min(...dates.map((d) => d.getTime())))) : addDays(today, -14);
  const maxDate = dates.length ? startOfDay(new Date(Math.max(...dates.map((d) => d.getTime())))) : addDays(today, 60);
  const rangeStart = addDays(minDate, -7);
  const rangeEnd = addDays(maxDate, 14);
  const totalDays = Math.max(30, daysBetween(rangeStart, rangeEnd));
  const dayWidth = zoom === "day" ? 28 : zoom === "week" ? 90 / 7 : 280 / 30;
  const canvasWidth = totalDays * dayWidth;

  // Decide grouping: Site → Stage (when tasks have site_id) else by milestone
  const hasSiteHierarchy = tasks.some((t) => t.site_id && t.task_kind);

  const rows: Array<
    | { kind: "group"; id: string; name: string; count: number; depth?: number; color?: string | null; summaryTask?: any }
    | { kind: "task"; task: any; depth?: number }
  > = [];

  if (hasSiteHierarchy) {
    const siteSummaries = tasks.filter((t) => t.task_kind === "site_summary");
    const stageSummaries = tasks.filter((t) => t.task_kind === "stage_summary");
    const workTasks = tasks.filter((t) => (t.task_kind ?? "work") === "work");
    // Orphan work rows (no site_id) grouped last
    const orphanWork = workTasks.filter((t) => !t.site_id);

    for (const site of siteSummaries) {
      const siteId = site.site_id;
      const stages = stageSummaries.filter((s) => s.site_id === siteId).sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""));
      const siteWork = workTasks.filter((t) => t.site_id === siteId);
      rows.push({ kind: "group", id: `site-${site.id}`, name: site.title, count: siteWork.length, depth: 0, summaryTask: site });
      if (collapsed[`site-${site.id}`]) continue;
      for (const st of stages) {
        const rowsForStage = siteWork.filter((t) => t.stage_code === st.stage_code);
        rows.push({ kind: "group", id: `stage-${st.id}`, name: st.title, count: rowsForStage.length, depth: 1, color: st.gantt_color, summaryTask: st });
        if (collapsed[`stage-${st.id}`]) continue;
        for (const t of rowsForStage) rows.push({ kind: "task", task: t, depth: 2 });
      }
    }
    if (orphanWork.length) {
      rows.push({ kind: "group", id: "__orphan", name: "Ungrouped", count: orphanWork.length, depth: 0 });
      if (!collapsed["__orphan"]) for (const t of orphanWork) rows.push({ kind: "task", task: t, depth: 1 });
    }
  } else {
    const groupMap: Record<string, any[]> = { __none: [] };
    for (const t of tasks) {
      const k = t.milestone_id ?? "__none";
      (groupMap[k] ??= []).push(t);
    }
    const groupOrder = [
      ...(milestones ?? []).filter((m) => groupMap[m.id]).map((m) => ({ id: m.id, name: m.name })),
      ...(groupMap["__none"]?.length ? [{ id: "__none", name: "Ungrouped" }] : []),
    ];
    for (const g of groupOrder) {
      const gt = groupMap[g.id] ?? [];
      rows.push({ kind: "group", id: g.id, name: g.name, count: gt.length });
      if (!collapsed[g.id]) for (const t of gt) rows.push({ kind: "task", task: t });
    }
  }

  // Positions
  const taskPos: Record<string, { top: number; left: number; width: number }> = {};
  const groupPos: Record<string, { top: number; left: number; width: number; color?: string | null; task?: any }> = {};
  const rowH = 40;
  let y = 0;
  for (const r of rows) {
    if (r.kind === "task") {
      const t = r.task;
      const s = toDate(t.start_date) ?? toDate(t.due_date) ?? today;
      const e = toDate(t.due_date) ?? s;
      const left = daysBetween(rangeStart, s) * dayWidth;
      const width = Math.max(dayWidth, (daysBetween(s, e) + 1) * dayWidth);
      taskPos[t.id] = { top: y, left, width };
    } else if (r.summaryTask?.start_date && r.summaryTask?.due_date) {
      const s = toDate(r.summaryTask.start_date)!;
      const e = toDate(r.summaryTask.due_date)!;
      const left = daysBetween(rangeStart, s) * dayWidth;
      const width = Math.max(dayWidth, (daysBetween(s, e) + 1) * dayWidth);
      groupPos[r.id] = { top: y, left, width, color: r.color, task: r.summaryTask };
    }
    y += rowH;
  }

  // Drag/resize state (also supports live progress drag)
  const [drag, setDrag] = useState<
    | { id: string; mode: "move" | "resize-l" | "resize-r"; startX: number; origStart: Date; origEnd: Date }
    | { id: string; mode: "progress"; startX: number; origPct: number; barWidth: number }
    | null
  >(null);
  const [livePct, setLivePct] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!drag) return;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - drag.startX;
      if (drag.mode === "progress") {
        const nextPct = Math.min(100, Math.max(0, Math.round(drag.origPct + (dx / drag.barWidth) * 100)));
        setLivePct((s) => ({ ...s, [drag.id]: nextPct }));
        return;
      }
      const dDays = Math.round(dx / dayWidth);
      if (dDays === 0) return;
      const el = document.getElementById(`gbar-${drag.id}`);
      if (!el) return;
      const orig = taskPos[drag.id];
      if (drag.mode === "move") {
        el.style.transform = `translateX(${dDays * dayWidth}px)`;
      } else if (drag.mode === "resize-r") {
        el.style.width = `${Math.max(dayWidth, orig.width + dDays * dayWidth)}px`;
      } else {
        el.style.transform = `translateX(${dDays * dayWidth}px)`;
        el.style.width = `${Math.max(dayWidth, orig.width - dDays * dayWidth)}px`;
      }
    };
    const onUp = (ev: MouseEvent) => {
      const dx = ev.clientX - drag.startX;
      if (drag.mode === "progress") {
        const nextPct = Math.min(100, Math.max(0, Math.round(drag.origPct + (dx / drag.barWidth) * 100)));
        setLivePct((s) => { const c = { ...s }; delete c[drag.id]; return c; });
        if (nextPct !== drag.origPct) updateTask.mutate({ id: drag.id, patch: { percent_complete: nextPct } });
        setDrag(null);
        return;
      }
      const dDays = Math.round(dx / dayWidth);
      const el = document.getElementById(`gbar-${drag.id}`);
      if (el) { el.style.transform = ""; el.style.width = ""; }
      if (dDays !== 0) {
        let newStart = drag.origStart, newEnd = drag.origEnd;
        if (drag.mode === "move") { newStart = addDays(drag.origStart, dDays); newEnd = addDays(drag.origEnd, dDays); }
        else if (drag.mode === "resize-r") { newEnd = addDays(drag.origEnd, dDays); if (newEnd < newStart) newEnd = newStart; }
        else { newStart = addDays(drag.origStart, dDays); if (newStart > newEnd) newStart = newEnd; }
        updateTask.mutate({ id: drag.id, patch: { start_date: iso(newStart), due_date: iso(newEnd) } });
      }
      setDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [drag, dayWidth]);

  // Draw dependency arrows
  const arrows: Array<{ from: any; to: any; type: string }> = [];
  for (const d of deps) {
    const a = taskPos[d.depends_on_task_id];
    const b = taskPos[d.task_id];
    if (a && b) arrows.push({ from: a, to: b, type: d.link_type ?? "FS" });
  }

  // Dual-band header: top = months, bottom = weeks/days depending on zoom
  const monthBands: React.ReactNode[] = [];
  {
    let cursor = new Date(rangeStart);
    cursor.setDate(1);
    while (cursor <= rangeEnd) {
      const next = new Date(cursor);
      next.setMonth(next.getMonth() + 1);
      const startIdx = Math.max(0, daysBetween(rangeStart, cursor));
      const endIdx = Math.min(totalDays, daysBetween(rangeStart, next));
      const w = (endIdx - startIdx) * dayWidth;
      if (w > 0) {
        monthBands.push(
          <div key={+cursor} className="absolute top-0 h-5 border-r border-border/60 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center px-2 bg-muted/40"
            style={{ left: startIdx * dayWidth, width: w }}>
            {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </div>
        );
      }
      cursor = next;
    }
  }
  const subCells: React.ReactNode[] = [];
  for (let i = 0; i <= totalDays; i++) {
    const d = addDays(rangeStart, i);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const isMonday = d.getDay() === 1;
    if (zoom === "day") {
      subCells.push(
        <div key={i} className={`absolute top-5 h-7 border-r border-border/40 text-[10px] text-center pt-1 ${isWeekend ? "bg-muted/50 text-muted-foreground" : "text-foreground/80"} ${isMonday ? "font-semibold" : ""}`}
          style={{ left: i * dayWidth, width: dayWidth }}>
          {d.getDate()}
        </div>
      );
    } else if (zoom === "week" && isMonday) {
      subCells.push(
        <div key={i} className="absolute top-5 h-7 text-[10px] font-medium border-l border-border/40 pl-1.5 pt-1 text-foreground/70"
          style={{ left: i * dayWidth, width: dayWidth * 7 }}>
            W{weekNum(d)} · {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </div>
      );
    } else if (zoom === "month" && d.getDate() === 1) {
      subCells.push(
        <div key={i} className="absolute top-5 h-7 text-[10px] font-semibold border-l border-border/40 pl-1 pt-1"
          style={{ left: i * dayWidth, width: 280 }}>
          {d.toLocaleDateString(undefined, { month: "short" })}
        </div>
      );
    }
  }
  const HEADER_H = 52;

  const todayLeft = daysBetween(rangeStart, today) * dayWidth;
  const nameColW = 420;

  const jumpTo = (leftPx: number) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, leftPx - nameColW / 2), behavior: "smooth" });
  };

  // Auto-fit: scroll to the earliest task on first load / when data arrives, or when zoom changes
  useEffect(() => {
    if (!tasks.length || !containerRef.current) return;
    const firstTaskLeft = daysBetween(rangeStart, minDate) * dayWidth;
    // Land ~1 day before the first task so it isn't flush against the name column
    const target = Math.max(0, firstTaskLeft - dayWidth);
    containerRef.current.scrollLeft = target;
    didAutoFitRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks.length, zoom]);

  return (
    <div className="border rounded-md overflow-hidden bg-card">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5" /> {tasks.length} tasks · {deps.length} links
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => jumpTo(todayLeft)} title="Jump to today">
            <Crosshair className="h-3.5 w-3.5 mr-1" /> Today
          </Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Button size="sm" variant={zoom === "day" ? "default" : "ghost"} onClick={() => setZoom("day")}>Day</Button>
          <Button size="sm" variant={zoom === "week" ? "default" : "ghost"} onClick={() => setZoom("week")}>Week</Button>
          <Button size="sm" variant={zoom === "month" ? "default" : "ghost"} onClick={() => setZoom("month")}>Month</Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Button size="icon" variant="ghost" onClick={() => setZoom(zoom === "month" ? "week" : "day")}><ZoomIn className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" onClick={() => setZoom(zoom === "day" ? "week" : "month")}><ZoomOut className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div ref={containerRef} className="overflow-auto max-h-[70vh]" style={{ maxWidth: "100%" }}>
        <div className="grid relative" style={{ gridTemplateColumns: `${nameColW}px ${canvasWidth}px` }}>
          {/* Sticky task name col header */}
          <div className="sticky top-0 left-0 z-30 bg-muted/60 border-b border-r px-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground" style={{ height: HEADER_H }}>
            <CalendarDays className="h-3.5 w-3.5" /> Task
          </div>
          <div className="sticky top-0 z-20 bg-background border-b relative" style={{ width: canvasWidth, height: HEADER_H }}>
            {monthBands}
            {subCells}
            {/* today marker in header */}
            {todayLeft > 0 && todayLeft < canvasWidth && (
              <div className="absolute top-0 bottom-0 border-l-2 border-primary/70" style={{ left: todayLeft }}>
                <div className="absolute -top-0.5 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-[9px] px-1.5 py-0.5 font-semibold shadow-sm">TODAY</div>
              </div>
            )}
          </div>

          {/* Rows */}
          {rows.map((r, i) => (
            <RowCells key={r.kind === "group" ? `g-${r.id}` : `t-${r.task.id}`} rowIndex={i}
              r={r} rowH={rowH} nameColW={nameColW} canvasWidth={canvasWidth} dayWidth={dayWidth}
              collapsed={collapsed} setCollapsed={setCollapsed} taskPos={taskPos} groupPos={groupPos} zoom={zoom}
              editingTitleId={editingTitleId} setEditingTitleId={setEditingTitleId}
              openEditorId={openEditorId} setOpenEditorId={setOpenEditorId}
              livePct={livePct}
              onSave={(id, patch) => updateTask.mutate({ id, patch })}
              onDragStart={(mode, ev, t) => {
                if (mode === "progress") {
                  const bw = taskPos[t.id]?.width ?? dayWidth;
                  setDrag({ id: t.id, mode: "progress", startX: ev.clientX, origPct: Number(t.percent_complete ?? 0), barWidth: bw });
                  return;
                }
                const s = toDate(t.start_date) ?? today;
                const e = toDate(t.due_date) ?? s;
                setDrag({ id: t.id, mode, startX: ev.clientX, origStart: s, origEnd: e });
              }} />
          ))}

          {/* Dependency arrows overlay — absolute so it doesn't consume grid cells */}
          <div
            className="pointer-events-none absolute"
            style={{ left: nameColW, top: HEADER_H, width: canvasWidth, height: rows.length * rowH }}
          >
            <svg width={canvasWidth} height={rows.length * rowH} className="absolute top-0 left-0">
              {/* Today line */}
              {todayLeft > 0 && todayLeft < canvasWidth && (
                <line x1={todayLeft} y1={0} x2={todayLeft} y2={rows.length * rowH} stroke="hsl(var(--primary))" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.55} />
              )}
              {arrows.map((a, idx) => {
                const x1 = a.from.left + a.from.width;
                const y1 = a.from.top + rowH / 2;
                const x2 = a.to.left;
                const y2 = a.to.top + rowH / 2;
                const midX = x1 + Math.max(8, (x2 - x1) / 2);
                return (
                  <g key={idx}>
                    <path d={`M${x1},${y1} L${midX},${y1} L${midX},${y2} L${x2 - 4},${y2}`} stroke="hsl(var(--primary))" strokeWidth={1.2} fill="none" opacity={0.6} />
                    <polygon points={`${x2},${y2} ${x2 - 6},${y2 - 3} ${x2 - 6},${y2 + 3}`} fill="hsl(var(--primary))" />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function RowCells({ r, rowIndex, rowH, nameColW, canvasWidth, dayWidth, collapsed, setCollapsed, taskPos, groupPos, onDragStart, zoom, editingTitleId, setEditingTitleId, openEditorId, setOpenEditorId, livePct, onSave }: any) {
  const zebra = rowIndex % 2 === 1 ? "bg-muted/[0.35]" : "bg-background";
  if (r.kind === "group") {
    const col = collapsed[r.id];
    const depth = r.depth ?? 0;
    const gp = groupPos?.[r.id];
    const isSite = depth === 0 && r.id.startsWith("site-");
    const isStage = depth === 1;
    return (
      <>
        <div
          className={`sticky left-0 border-b border-r flex items-center gap-2 px-2 ${isSite ? "bg-primary/15 border-primary/30" : isStage ? "bg-primary/5 border-primary/15" : "bg-primary/10 border-primary/20"}`}
          style={{ width: nameColW, height: rowH, paddingLeft: 8 + depth * 14 }}
        >
          <button onClick={() => setCollapsed((s: any) => ({ ...s, [r.id]: !s[r.id] }))}>
            {col ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <span className={`truncate min-w-0 ${isSite ? "text-xs font-bold uppercase tracking-wider text-primary" : isStage ? "text-xs font-semibold text-foreground" : "text-xs font-semibold uppercase tracking-wider text-primary"}`} title={r.name}>{r.name}</span>
          <Badge variant="outline" className="ml-auto text-[9px] h-4 px-1 border-primary/30 text-primary">{r.count}</Badge>
        </div>
        <div className={`relative border-b ${isSite ? "bg-primary/10 border-primary/30" : isStage ? "bg-primary/[0.03] border-primary/15" : "bg-primary/5 border-primary/20"}`} style={{ height: rowH, width: canvasWidth }}>
          {gp && (
            <div
              className={`absolute rounded-[3px] ${isSite ? "top-3 h-4" : "top-3.5 h-3"} shadow-sm`}
              style={{
                left: gp.left, width: gp.width,
                background: gp.color
                  ? `linear-gradient(180deg, ${gp.color}, ${gp.color})`
                  : (isSite ? "linear-gradient(180deg, hsl(var(--primary)), hsl(var(--primary) / 0.75))" : "linear-gradient(180deg, hsl(var(--primary) / 0.75), hsl(var(--primary) / 0.5))"),
              }}
              title={r.name}
            >
              {isSite && <div className="absolute -bottom-1 left-0 w-2 h-2 bg-inherit rotate-45" />}
              {isSite && <div className="absolute -bottom-1 right-0 w-2 h-2 bg-inherit rotate-45" />}
            </div>
          )}
        </div>
      </>
    );
  }
  const t = r.task;
  const depth = r.depth ?? 0;
  const p = taskPos[t.id];
  const pct = Math.min(100, Math.max(0, Number(livePct?.[t.id] ?? t.percent_complete ?? 0)));
  const isEditingTitle = editingTitleId === t.id;
  const isOpen = openEditorId === t.id;
  const color = t.gantt_color || "hsl(var(--primary))";
  return (
    <>
      <div className={`sticky left-0 ${zebra} border-b border-r flex items-center text-xs min-w-0 group/name hover:bg-primary/5`}
        style={{ width: nameColW, height: rowH, zIndex: 5, paddingLeft: 12 + depth * 14, paddingRight: 12 }} title={t.title}>
        <span className="inline-block w-1 h-4 rounded-sm mr-2 shrink-0" style={{ background: color }} />
        <div className="min-w-0 flex-1 leading-tight">
          {isEditingTitle ? (
            <Input
              autoFocus
              defaultValue={t.title}
              className="h-6 text-xs px-1.5"
              onBlur={(e) => {
                const v = e.currentTarget.value.trim();
                setEditingTitleId(null);
                if (v && v !== t.title) onSave(t.id, { title: v });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                if (e.key === "Escape") { setEditingTitleId(null); }
              }}
            />
          ) : (
            <div className="truncate font-medium cursor-text" onDoubleClick={() => setEditingTitleId(t.id)}>{t.title}</div>
          )}
          {t.description?.startsWith("Rate: ") && (
            <div className="truncate text-[9px] text-muted-foreground font-mono mt-0.5">{t.description.slice(6)}</div>
          )}
        </div>
      </div>
      <div className={`relative border-b ${zebra}`} style={{ height: rowH, width: canvasWidth }}>
        {/* weekend shading in day zoom */}
        {zoom === "day" && (
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: Math.ceil(canvasWidth / (dayWidth * 7)) }).map((_, i) => (
              <div key={i} className="absolute top-0 bottom-0 bg-muted/40" style={{ left: (i * 7 + 5) * dayWidth, width: dayWidth * 2 }} />
            ))}
          </div>
        )}
        <Popover open={isOpen} onOpenChange={(v) => setOpenEditorId(v ? t.id : null)}>
          <PopoverTrigger asChild>
            <div
              id={`gbar-${t.id}`}
              className="absolute top-2 h-7 rounded-md select-none cursor-grab active:cursor-grabbing group ring-1 ring-black/5 hover:ring-primary/40 hover:shadow-md transition-shadow"
              style={{
                left: p?.left ?? 0,
                width: p?.width ?? dayWidth,
                background: `linear-gradient(180deg, ${color}, color-mix(in oklab, ${color} 70%, black))`,
                boxShadow: "0 1px 2px rgb(0 0 0 / 0.15), inset 0 1px 0 rgb(255 255 255 / 0.25)",
              }}
              title={`${t.title}\n${t.start_date ?? "—"} → ${t.due_date ?? "—"}\n${pct}% complete`}
              onMouseDown={(ev) => {
                // ignore mousedown on handles (they call stopPropagation)
                onDragStart("move", ev, t);
              }}
              onClick={(ev) => { ev.stopPropagation(); setOpenEditorId(t.id); }}
            >
              {/* left resize */}
              <div className="absolute inset-y-0 left-0 w-2 cursor-w-resize rounded-l-md hover:bg-white/25"
                onMouseDown={(ev) => { ev.stopPropagation(); onDragStart("resize-l", ev, t); }} />
              {/* right resize */}
              <div className="absolute inset-y-0 right-0 w-2 cursor-e-resize rounded-r-md hover:bg-white/25"
                onMouseDown={(ev) => { ev.stopPropagation(); onDragStart("resize-r", ev, t); }} />
              {/* progress fill */}
              <div className="absolute inset-y-0 left-0 rounded-l-md pointer-events-none"
                style={{ width: `${pct}%`, background: "rgba(255,255,255,0.35)" }} />
              {/* progress drag handle */}
              <div
                className="absolute top-0 bottom-0 w-2 -ml-1 cursor-ew-resize opacity-0 group-hover:opacity-100"
                style={{ left: `${pct}%` }}
                onMouseDown={(ev) => { ev.stopPropagation(); onDragStart("progress", ev, t); }}
                title="Drag to update progress"
              >
                <div className="mx-auto h-full w-0.5 bg-white/90 shadow" />
              </div>
              {/* label */}
              <div className="relative flex items-center h-full px-2 text-[10px] text-primary-foreground font-semibold whitespace-nowrap overflow-hidden">
                <span className="truncate">{t.title}</span>
                <span className="ml-2 tabular-nums opacity-90">{pct}%</span>
              </div>
            </div>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-3 space-y-2" onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Edit task</div>
            <div>
              <Label className="text-[10px]">Title</Label>
              <Input defaultValue={t.title}
                onBlur={(e) => { const v = e.currentTarget.value.trim(); if (v && v !== t.title) onSave(t.id, { title: v }); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px]">Start</Label>
                <Input type="date" defaultValue={t.start_date ?? ""}
                  onBlur={(e) => { const v = e.currentTarget.value || null; if (v !== t.start_date) onSave(t.id, { start_date: v }); }} />
              </div>
              <div>
                <Label className="text-[10px]">Due</Label>
                <Input type="date" defaultValue={t.due_date ?? ""}
                  onBlur={(e) => { const v = e.currentTarget.value || null; if (v !== t.due_date) onSave(t.id, { due_date: v }); }} />
              </div>
            </div>
            <div>
              <Label className="text-[10px]">Progress · {pct}%</Label>
              <Slider defaultValue={[pct]} max={100} step={1}
                onValueCommit={(v) => { const n = v[0] ?? 0; if (n !== Number(t.percent_complete ?? 0)) onSave(t.id, { percent_complete: n }); }} />
            </div>
            <div>
              <Label className="text-[10px]">Bar colour</Label>
              <div className="flex items-center gap-2 mt-1">
                <input type="color" defaultValue={hexOrDefault(t.gantt_color)}
                  onBlur={(e) => { const v = e.currentTarget.value; if (v && v !== t.gantt_color) onSave(t.id, { gantt_color: v }); }}
                  className="h-8 w-10 rounded border" />
                <div className="flex gap-1">
                  {["#2563eb","#0ea5e9","#10b981","#f59e0b","#ef4444","#8b5cf6","#64748b"].map((c) => (
                    <button key={c} className="h-5 w-5 rounded ring-1 ring-border hover:ring-primary" style={{ background: c }}
                      onClick={() => onSave(t.id, { gantt_color: c })} />
                  ))}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </>
  );
}

function hexOrDefault(v: any) {
  if (typeof v === "string" && /^#([0-9a-f]{3}){1,2}$/i.test(v)) return v;
  return "#2563eb";
}

function weekNum(d: Date) {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  return 1 + Math.ceil((firstThursday - target.valueOf()) / (7 * MS_DAY));
}