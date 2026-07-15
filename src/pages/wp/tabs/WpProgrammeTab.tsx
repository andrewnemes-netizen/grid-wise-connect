import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InteractiveGantt } from "@/components/delivery/gantt/InteractiveGantt";
import { MilestoneIcon, Flag } from "lucide-react";

function statusClass(s?: string) {
  switch (s) {
    case "complete": case "passed": return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
    case "in_progress": case "active": return "bg-sky-500/15 text-sky-600 border-sky-500/30";
    case "blocked": case "failed": return "bg-rose-500/15 text-rose-600 border-rose-500/30";
    default: return "bg-muted text-muted-foreground";
  }
}

export default function WpProgrammeTab() {
  const { id: wpId } = useParams<{ id: string }>();

  const { data: milestones = [], isLoading } = useQuery({
    queryKey: ["wp-milestones", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wp_milestones")
        .select("*")
        .eq("work_package_id", wpId!)
        .order("sequence");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!wpId) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Programme</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Delivery programme and milestone gantt for this work package.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">Phase 2</Badge>
      </div>

      <section className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Flag className="h-4 w-4" /> Milestones ({milestones.length})
        </div>
        {isLoading ? (
          <Card className="p-4 text-sm text-muted-foreground">Loading milestones…</Card>
        ) : milestones.length === 0 ? (
          <Card className="p-4 text-sm text-muted-foreground">No milestones defined yet.</Card>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {(milestones as any[]).map((m) => (
              <Card key={m.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {m.sequence != null && <span className="text-muted-foreground mr-1">{m.sequence}.</span>}
                      {m.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {m.phase && <>Phase: {m.phase} · </>}
                      Planned {m.planned_date ?? "—"}
                      {m.actual_date ? ` · Actual ${m.actual_date}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className={statusClass(m.status)}>{m.status ?? "—"}</Badge>
                    {m.gate_type && (
                      <Badge variant="outline" className={`text-[10px] ${statusClass(m.gate_status)}`}>
                        Gate: {m.gate_status ?? "pending"}
                      </Badge>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="text-sm font-medium">Task gantt</div>
        <InteractiveGantt
          scope={{ table: "wp_tasks", depsTable: "wp_task_dependencies", scopeCol: "work_package_id", scopeId: wpId }}
          milestones={milestones as any[]}
        />
      </section>
    </div>
  );
}