import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const COLS: { key: string; label: string }[] = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "blocked", label: "Blocked" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

export function TaskKanban({ projectId, tasks }: { projectId: string; tasks: any[] }) {
  const qc = useQueryClient();
  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("project_tasks")
        .update({ status: status as any, percent_complete: status === "done" ? 100 : undefined })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["delivery-project", projectId] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="grid grid-cols-5 gap-3">
      {COLS.map((c) => {
        const items = tasks.filter((t) => t.status === c.key);
        return (
          <div
            key={c.key}
            className="bg-muted/30 rounded-md p-2 min-h-[300px]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              const id = e.dataTransfer.getData("text/plain");
              if (id) move.mutate({ id, status: c.key });
            }}
          >
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</span>
              <span className="text-xs text-muted-foreground">{items.length}</span>
            </div>
            <div className="space-y-2">
              {items.map((t) => (
                <Card
                  key={t.id}
                  className="p-2 cursor-move"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                >
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="flex items-center justify-between mt-1">
                    <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>
                    {t.due_date && (
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(t.due_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}