import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ZoomIn, ZoomOut, ChevronDown, ChevronRight, GitBranch } from "lucide-react";
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
    onSuccess: () => qc.invalidateQueries({ queryKey: [`gantt-tasks`, scope.scopeId] }),
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

  // Group by milestone
  const groups = useMemo(() => {
    const groupMap: Record<string, any[]> = { __none: [] };
    for (const t of tasks) {
      const k = t.milestone_id ?? "__none";
      (groupMap[k] ??= []).push(t);
    }
    return groupMap;
  }, [tasks]);

  const rows: Array<{ kind: "group"; id: string; name: string; count: number } | { kind: "task"; task: any }> = [];
  const groupOrder = [
    ...(milestones ?? []).filter((m) => groups[m.id]).map((m) => ({ id: m.id, name: m.name })),
    ...(groups["__none"]?.length ? [{ id: "__none", name: "Ungrouped" }] : []),
  ];
  for (const g of groupOrder) {
    const gt = groups[g.id] ?? [];
    rows.push({ kind: "group", id: g.id, name: g.name, count: gt.length });
    if (!collapsed[g.id]) for (const t of gt) rows.push({ kind: "task", task: t });
  }

  // Positions
  const taskPos: Record<string, { top: number; left: number; width: number }> = {};
  const rowH = 32;
  let y = 0;
  for (const r of rows) {
    if (r.kind === "task") {
      const t = r.task;
      const s = toDate(t.start_date) ?? toDate(t.due_date) ?? today;
      const e = toDate(t.due_date) ?? s;
      const left = daysBetween(rangeStart, s) * dayWidth;
      const width = Math.max(dayWidth, (daysBetween(s, e) + 1) * dayWidth);
      taskPos[t.id] = { top: y, left, width };
    }
    y += rowH;
  }

  // Drag/resize state
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "resize-l" | "resize-r"; startX: number; origStart: Date; origEnd: Date } | null>(null);

  useEffect(() => {
    if (!drag) return;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - drag.startX;
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

  // Day header cells
  const headerCells: React.ReactNode[] = [];
  for (let i = 0; i <= totalDays; i++) {
    const d = addDays(rangeStart, i);
    const isFirst = d.getDate() === 1 || i === 0;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    if (zoom === "day") {
      headerCells.push(
        <div key={i} className={`border-r text-[10px] text-center py-1 ${isWeekend ? "bg-muted/40" : ""} ${isFirst ? "font-semibold" : ""}`} style={{ width: dayWidth }}>
          {isFirst ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : d.getDate()}
        </div>
      );
    } else if (zoom === "week" && d.getDay() === 1) {
      headerCells.push(
        <div key={i} className="absolute text-[10px] font-medium border-l pl-1" style={{ left: i * dayWidth, width: dayWidth * 7 }}>
          W{weekNum(d)} · {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </div>
      );
    } else if (zoom === "month" && d.getDate() === 1) {
      headerCells.push(
        <div key={i} className="absolute text-xs font-semibold border-l pl-1" style={{ left: i * dayWidth, width: 280 }}>
          {d.toLocaleDateString(undefined, { month: "short", year: "numeric" })}
        </div>
      );
    }
  }

  const todayLeft = daysBetween(rangeStart, today) * dayWidth;
  const nameColW = 260;

  return (
    <div className="border rounded-md overflow-hidden bg-card">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5" /> {tasks.length} tasks · {deps.length} links
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant={zoom === "day" ? "default" : "ghost"} onClick={() => setZoom("day")}>Day</Button>
          <Button size="sm" variant={zoom === "week" ? "default" : "ghost"} onClick={() => setZoom("week")}>Week</Button>
          <Button size="sm" variant={zoom === "month" ? "default" : "ghost"} onClick={() => setZoom("month")}>Month</Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Button size="icon" variant="ghost" onClick={() => setZoom(zoom === "month" ? "week" : "day")}><ZoomIn className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" onClick={() => setZoom(zoom === "day" ? "week" : "month")}><ZoomOut className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      <div ref={containerRef} className="overflow-auto max-h-[70vh]" style={{ maxWidth: "100%" }}>
        <div className="grid" style={{ gridTemplateColumns: `${nameColW}px ${canvasWidth}px` }}>
          {/* Sticky task name col header */}
          <div className="sticky top-0 left-0 z-30 bg-muted/50 border-b border-r px-3 py-2 text-xs font-medium">Task</div>
          <div className="sticky top-0 z-20 bg-muted/50 border-b relative" style={{ width: canvasWidth, height: 32 }}>
            {headerCells}
          </div>

          {/* Rows */}
          {rows.map((r, i) => (
            <RowCells key={r.kind === "group" ? `g-${r.id}` : `t-${r.task.id}`}
              r={r} rowH={rowH} nameColW={nameColW} canvasWidth={canvasWidth} dayWidth={dayWidth}
              collapsed={collapsed} setCollapsed={setCollapsed} taskPos={taskPos} zoom={zoom}
              onDragStart={(mode, ev, t) => {
                const s = toDate(t.start_date) ?? today;
                const e = toDate(t.due_date) ?? s;
                setDrag({ id: t.id, mode, startX: ev.clientX, origStart: s, origEnd: e });
              }} />
          ))}

          {/* Dependency arrows overlay */}
          <div className="col-start-2 relative" style={{ gridRow: `2 / span ${rows.length}`, marginTop: -rows.length * rowH }}>
            <svg width={canvasWidth} height={rows.length * rowH} className="pointer-events-none absolute top-0 left-0">
              {/* Today line */}
              {todayLeft > 0 && todayLeft < canvasWidth && (
                <line x1={todayLeft} y1={0} x2={todayLeft} y2={rows.length * rowH} stroke="hsl(var(--primary))" strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
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

function RowCells({ r, rowH, nameColW, canvasWidth, dayWidth, collapsed, setCollapsed, taskPos, onDragStart, zoom }: any) {
  if (r.kind === "group") {
    const col = collapsed[r.id];
    return (
      <>
        <div className="sticky left-0 bg-primary/10 border-b border-r border-primary/20 flex items-center gap-2 px-2" style={{ width: nameColW, height: rowH }}>
          <button onClick={() => setCollapsed((s: any) => ({ ...s, [r.id]: !s[r.id] }))}>
            {col ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <span className="text-xs font-semibold uppercase tracking-wider text-primary truncate">{r.name}</span>
          <Badge variant="outline" className="ml-auto text-[9px] h-4 px-1 border-primary/30 text-primary">{r.count}</Badge>
        </div>
        <div className="bg-primary/5 border-b border-primary/20" style={{ height: rowH, width: canvasWidth }} />
      </>
    );
  }
  const t = r.task;
  const p = taskPos[t.id];
  const pct = Math.min(100, Math.max(0, Number(t.percent_complete ?? 0)));
  return (
    <>
      <div className="sticky left-0 bg-background border-b border-r px-3 flex items-center gap-2 text-xs" style={{ width: nameColW, height: rowH, zIndex: 5 }}>
        <span className="truncate">{t.title}</span>
      </div>
      <div className="relative border-b" style={{ height: rowH, width: canvasWidth }}>
        {/* weekend shading in day zoom */}
        {zoom === "day" && (
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: Math.ceil(canvasWidth / (dayWidth * 7)) }).map((_, i) => (
              <div key={i} className="absolute top-0 bottom-0 bg-muted/40" style={{ left: (i * 7 + 5) * dayWidth, width: dayWidth * 2 }} />
            ))}
          </div>
        )}
        <div id={`gbar-${t.id}`} className="absolute top-1 h-6 rounded shadow-sm select-none cursor-grab active:cursor-grabbing group"
          style={{ left: p?.left ?? 0, width: p?.width ?? dayWidth, background: t.gantt_color || "hsl(var(--primary) / 0.85)" }}
          onMouseDown={(ev) => onDragStart("move", ev, t)}>
          <div className="absolute inset-y-0 left-0 w-1.5 cursor-w-resize hover:bg-white/30" onMouseDown={(ev) => { ev.stopPropagation(); onDragStart("resize-l", ev, t); }} />
          <div className="absolute inset-y-0 right-0 w-1.5 cursor-e-resize hover:bg-white/30" onMouseDown={(ev) => { ev.stopPropagation(); onDragStart("resize-r", ev, t); }} />
          <div className="absolute inset-y-0 left-0 bg-primary rounded-l" style={{ width: `${pct}%`, opacity: 0.5 }} />
          <div className="relative flex items-center h-full px-2 text-[10px] text-white font-medium truncate">
            {t.title} · {pct}%
          </div>
        </div>
      </div>
    </>
  );
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