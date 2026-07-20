import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Plus, Flag, ListChecks, Users, LayoutGrid, GanttChart, MessageSquare, Paperclip, History } from "lucide-react";
import { TaskKanban } from "@/components/delivery/TaskKanban";
import { TaskGantt } from "@/components/delivery/TaskGantt";
import { TaskBoard } from "@/components/delivery/board/TaskBoard";
import { ProjectComments } from "@/components/delivery/ProjectComments";
import { ProjectFiles } from "@/components/delivery/ProjectFiles";
import { ProjectActivity } from "@/components/delivery/ProjectActivity";
import { ApplyTemplateDialog } from "@/components/delivery/ApplyTemplateDialog";

export default function DeliveryProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const projectId = id!;
  const qc = useQueryClient();

  const { data: project, isLoading } = useQuery({
    queryKey: ["delivery-project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects" as any).select("*").eq("id", projectId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: study } = useQuery({
    enabled: !!project?.study_id,
    queryKey: ["delivery-project-study", project?.study_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("studies")
        .select("id,study_name,dno,voltage_level,proposed_kw,cost_estimate_json,bom_json")
        .eq("id", project!.study_id!)
        .single();
      return data;
    },
  });

  const { data: milestones = [] } = useQuery({
    queryKey: ["delivery-milestones", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_milestones" as any)
        .select("*")
        .eq("project_id", projectId)
        .order("sequence", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["delivery-tasks", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_tasks" as any)
        .select("*")
        .eq("project_id", projectId)
        .order("sort_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: deps = [] } = useQuery({
    queryKey: ["delivery-deps", projectId],
    queryFn: async () => {
      const ids = tasks.map((t: any) => t.id);
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("project_task_dependencies" as any)
        .select("*")
        .in("task_id", ids);
      return (data ?? []) as any[];
    },
    enabled: tasks.length > 0,
  });

  const updateTask = useMutation({
    mutationFn: async ({ taskId, patch }: { taskId: string; patch: any }) => {
      const { error } = await supabase.from("project_tasks" as any).update(patch).eq("id", taskId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["delivery-tasks", projectId] });
      qc.invalidateQueries({ queryKey: ["delivery-milestones", projectId] });
      qc.invalidateQueries({ queryKey: ["delivery-project", projectId] });
    },
  });

  if (isLoading || !project) return <div className="p-6 text-muted-foreground">Loading…</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <Link to="/delivery" className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> All projects
        </Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{project.name}</h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Badge>{project.status}</Badge>
              <Badge variant="outline">{project.priority}</Badge>
              {project.target_end_date && (
                <span className="text-xs text-muted-foreground">
                  due {new Date(project.target_end_date).toLocaleDateString()}
                </span>
              )}
              {study && (
                <Link to={`/study/${study.id}`} className="text-xs text-primary underline">
                  Linked study: {study.study_name}
                </Link>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 w-56">
            <ApplyTemplateDialog projectId={projectId} hasContent={milestones.length > 0 || tasks.length > 0} />
            <div className="w-full">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Overall progress</span><span>{Math.round(project.percent_complete)}%</span>
              </div>
              <Progress value={Number(project.percent_complete)} />
            </div>
          </div>
        </div>
      </div>

      {study && (
        <Card className="p-4 bg-muted/30">
          <div className="text-xs font-medium text-muted-foreground mb-2">INHERITED FROM STUDY (read-only)</div>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <Stat label="DNO" value={study.dno ?? "—"} />
            <Stat label="Voltage" value={study.voltage_level ?? "—"} />
            <Stat label="Proposed" value={study.proposed_kw ? `${study.proposed_kw} kW` : "—"} />
            <Stat
              label="Estimate"
              value={(() => {
                const total = (study.cost_estimate_json as any)?.total ?? (study.cost_estimate_json as any)?.totalCost;
                return typeof total === "number" ? `£${total.toLocaleString()}` : "—";
              })()}
            />
          </div>
        </Card>
      )}

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list"><ListChecks className="h-4 w-4 mr-1" /> List</TabsTrigger>
          <TabsTrigger value="kanban"><LayoutGrid className="h-4 w-4 mr-1" /> Kanban</TabsTrigger>
          <TabsTrigger value="gantt"><GanttChart className="h-4 w-4 mr-1" /> Gantt</TabsTrigger>
          <TabsTrigger value="milestones"><Flag className="h-4 w-4 mr-1" /> Milestones</TabsTrigger>
          <TabsTrigger value="comments"><MessageSquare className="h-4 w-4 mr-1" /> Comments</TabsTrigger>
          <TabsTrigger value="files"><Paperclip className="h-4 w-4 mr-1" /> Files</TabsTrigger>
          <TabsTrigger value="activity"><History className="h-4 w-4 mr-1" /> Activity</TabsTrigger>
          <TabsTrigger value="members"><Users className="h-4 w-4 mr-1" /> Members</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-3">
          <TaskBoard
            projectId={projectId}
            tasks={tasks as any[]}
            milestones={milestones as any[]}
          />
        </TabsContent>

        <TabsContent value="kanban">
          <TaskKanban projectId={projectId} tasks={tasks as any[]} />
        </TabsContent>

        <TabsContent value="gantt">
          <TaskGantt tasks={tasks as any[]} deps={deps as any[]} />
        </TabsContent>

        <TabsContent value="milestones" className="space-y-3">
          <div className="flex justify-end">
            <NewMilestoneDialog projectId={projectId} nextSeq={milestones.length} />
          </div>
          {milestones.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No milestones yet.</Card>
          ) : (
            <div className="space-y-2">
              {milestones.map((m: any) => (
                <Card key={m.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{m.name}</div>
                      <div className="text-xs text-muted-foreground capitalize">{m.phase} · {m.status.replace("_", " ")}</div>
                    </div>
                    <div className="w-40">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>{m.planned_date ? new Date(m.planned_date).toLocaleDateString() : "no date"}</span>
                        <span>{Math.round(m.percent_complete)}%</span>
                      </div>
                      <Progress value={Number(m.percent_complete)} className="h-2" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="comments">
          <ProjectComments projectId={projectId} />
        </TabsContent>

        <TabsContent value="files">
          <ProjectFiles projectId={projectId} />
        </TabsContent>

        <TabsContent value="activity">
          <ProjectActivity projectId={projectId} />
        </TabsContent>

        <TabsContent value="members">
          <ProjectMembersPanel projectId={projectId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function NewTaskDialog({ projectId, milestones }: { projectId: string; milestones: { id: string; name: string }[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [milestone, setMilestone] = useState("none");
  const [priority, setPriority] = useState("medium");
  const [due, setDue] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("project_tasks" as any).insert({
        project_id: projectId,
        milestone_id: milestone === "none" ? null : milestone,
        title,
        priority: priority as any,
        due_date: due || null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task added");
      setOpen(false); setTitle(""); setMilestone("none"); setDue("");
      qc.invalidateQueries({ queryKey: ["delivery-tasks", projectId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add task</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div>
            <Label>Milestone</Label>
            <Select value={milestone} onValueChange={setMilestone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {milestones.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Due date</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewMilestoneDialog({ projectId, nextSeq }: { projectId: string; nextSeq: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState("delivery");
  const [planned, setPlanned] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("project_milestones" as any).insert({
        project_id: projectId,
        name,
        phase: phase as any,
        sequence: nextSeq,
        planned_date: planned || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Milestone added");
      setOpen(false); setName(""); setPlanned("");
      qc.invalidateQueries({ queryKey: ["delivery-milestones", projectId] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Add milestone</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New milestone</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phase</Label>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="procurement">Procurement</SelectItem>
                  <SelectItem value="delivery">Delivery</SelectItem>
                  <SelectItem value="commissioning">Commissioning</SelectItem>
                  <SelectItem value="handover">Handover</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Planned date</Label><Input type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProjectMembersPanel({ projectId }: { projectId: string }) {
  const { data: members = [] } = useQuery({
    queryKey: ["delivery-members", projectId],
    queryFn: async () => {
      const { data } = await supabase.from("project_members" as any).select("*").eq("project_id", projectId);
      return data ?? [];
    },
  });
  return (
    <Card className="p-4">
      <p className="text-sm text-muted-foreground mb-3">
        Members inherit access from your organisation automatically. Add users here to grant per-project access to external collaborators.
      </p>
      {members.length === 0 ? (
        <p className="text-xs text-muted-foreground">No explicit members. Org-level access is in effect.</p>
      ) : (
        <div className="space-y-1 text-sm">
          {members.map((m: any) => (
            <div key={m.id} className="flex justify-between border-b py-1">
              <span className="font-mono text-xs">{m.user_id}</span>
              <Badge variant="outline">{m.role}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}