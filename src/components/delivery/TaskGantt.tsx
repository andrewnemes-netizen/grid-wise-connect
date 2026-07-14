import { useMemo } from "react";

function toDate(d: string | null): Date | null {
  return d ? new Date(d) : null;
}
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function TaskGantt({ tasks, deps = [] }: { tasks: any[]; deps?: any[] }) {
  const rows = useMemo(() => {
    return tasks
      .map((t) => ({ ...t, _start: toDate(t.start_date), _end: toDate(t.due_date) }))
      .filter((t) => t._start || t._end)
      .map((t) => ({ ...t, _start: t._start ?? t._end, _end: t._end ?? t._start }));
  }, [tasks]);

  if (rows.length === 0) {
    return (
      <div className="p-8 border rounded-md text-center text-sm text-muted-foreground">
        Add start and due dates to tasks to see the Gantt chart.
      </div>
    );
  }

  const minDate = new Date(Math.min(...rows.map((r) => r._start!.getTime())));
  const maxDate = new Date(Math.max(...rows.map((r) => r._end!.getTime())));
  const totalDays = Math.max(1, daysBetween(minDate, maxDate) + 1);
  const dayWidth = 24;
  const width = totalDays * dayWidth;

  const depSet = new Set(deps.map((d) => `${d.task_id}:${d.depends_on_task_id}`));

  return (
    <div className="border rounded-md overflow-auto">
      <div className="grid" style={{ gridTemplateColumns: `240px ${width}px` }}>
        <div className="p-2 border-b border-r bg-muted/30 text-xs font-medium sticky left-0 z-10">Task</div>
        <div className="border-b bg-muted/30 flex text-[10px] text-muted-foreground">
          {Array.from({ length: totalDays }).map((_, i) => {
            const d = new Date(minDate.getTime() + i * 86400000);
            const isFirst = d.getDate() === 1 || i === 0;
            return (
              <div key={i} className="border-r text-center py-1" style={{ width: dayWidth }}>
                {isFirst ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : d.getDate()}
              </div>
            );
          })}
        </div>
        {rows.map((t) => {
          const offset = daysBetween(minDate, t._start!);
          const span = Math.max(1, daysBetween(t._start!, t._end!) + 1);
          return (
            <div key={t.id} className="contents">
              <div className="p-2 border-b border-r text-xs sticky left-0 bg-background z-10 truncate">{t.title}</div>
              <div className="border-b relative h-8">
                <div
                  className="absolute top-1 h-6 rounded bg-primary/70 text-white text-[10px] flex items-center px-2 overflow-hidden"
                  style={{ left: offset * dayWidth, width: span * dayWidth - 2 }}
                  title={`${t.title}${depSet.size ? "" : ""}`}
                >
                  {Math.round(t.percent_complete)}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}