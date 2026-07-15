import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, ListTodo } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["not_started", "in_progress", "review", "blocked", "done"] as const;

const STATUS_META: Record<string, { label: string; className: string }> = {
  not_started: { label: "Not started", className: "bg-muted text-muted-foreground" },
  in_progress: { label: "In progress", className: "bg-sky-500/15 text-sky-600 border-sky-500/30" },
  review: { label: "Review", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  blocked: { label: "Blocked", className: "bg-rose-500/15 text-rose-600 border-rose-500/30" },
  done: { label: "Done", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
};

export default function WpTasksTab() {
  const { id: wpId } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["wp-tasks-board", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wp_tasks")
        .select("id,title,status,priority,due_date,percent_complete,sort_index,site_id,sites(site_name)")
        .eq("work_package_id", wpId!)
        .order("sort_index")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const byStatus = useMemo(() => {
    const buckets: Record<string, any[]> = {};
    STATUSES.forEach((s) => (buckets[s] = []));
    (tasks as any[]).forEach((t) => {
      const s = STATUSES.includes(t.status) ? t.status : "not_started";
      buckets[s].push(t);
    });
    return buckets;
  }, [tasks]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("wp_tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wp-tasks-board", wpId] }),
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  if (!wpId) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Work package tasks in a status board. Drag-free — change status inline on each card.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="shrink-0">Phase 2</Badge>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New task
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading tasks…</Card>
      ) : tasks.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <ListTodo className="h-8 w-8 mx-auto text-muted-foreground" />
          <div className="font-medium">No tasks yet</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Add WP-level tasks to plan delivery activity. Site-level tasks continue to live under each site.
          </p>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New task
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {STATUSES.map((s) => (
            <Card key={s} className="p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className={STATUS_META[s].className}>{STATUS_META[s].label}</Badge>
                <span className="text-xs text-muted-foreground">{byStatus[s].length}</span>
              </div>
              <div className="space-y-2">
                {byStatus[s].map((t) => (
                  <Card key={t.id} className="p-3 space-y-1">
                    <div className="text-sm font-medium leading-tight">{t.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.sites?.site_name ?? "WP-wide"}
                      {t.due_date ? ` · due ${t.due_date}` : ""}
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <Select
                        value={t.status}
                        onValueChange={(v) => updateStatus.mutate({ id: t.id, status: v })}
                      >
                        <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s2) => (
                            <SelectItem key={s2} value={s2}>{STATUS_META[s2].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {t.percent_complete != null && (
                        <span className="text-xs text-muted-foreground tabular-nums">{Math.round(Number(t.percent_complete))}%</span>
                      )}
                    </div>
                  </Card>
                ))}
                {byStatus[s].length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-4">Empty</div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <NewTaskDialog wpId={wpId} open={newOpen} onOpenChange={setNewOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: ["wp-tasks-board", wpId] })} />
    </div>
  );
}

function NewTaskDialog({ wpId, open, onOpenChange, onCreated }: { wpId: string; open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [status, setStatus] = useState<string>("not_started");
  const [saving, setSaving] = useState(false);

  const reset = () => { setTitle(""); setDue(""); setStatus("not_started"); };

  const submit = async () => {
    if (!title.trim()) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase.from("wp_tasks").insert({
        work_package_id: wpId,
        title: title.trim(),
        due_date: due || null,
        status,
        created_by: user.user?.id ?? null,
      });
      if (error) throw error;
      toast.success("Task created");
      reset(); onOpenChange(false); onCreated();
    } catch (e: any) {
      toast.error(e.message ?? "Could not create");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Due date</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}