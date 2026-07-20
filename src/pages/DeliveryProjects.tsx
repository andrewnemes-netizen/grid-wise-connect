import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Plus, Briefcase } from "lucide-react";

type Project = {
  id: string;
  name: string;
  code: string | null;
  status: string;
  priority: string;
  health: string;
  percent_complete: number;
  target_end_date: string | null;
  study_id: string | null;
  created_at: string;
};

const statusColor: Record<string, string> = {
  planning: "bg-muted text-muted-foreground",
  active: "bg-primary/10 text-primary",
  on_hold: "bg-amber-500/10 text-amber-700",
  completed: "bg-emerald-500/10 text-emerald-700",
  cancelled: "bg-destructive/10 text-destructive",
};
const healthColor: Record<string, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-destructive",
};

export default function DeliveryProjects() {
  const { user, orgId } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["delivery-projects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,code,status,priority,health,percent_complete,target_end_date,study_id,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Project[];
    },
  });

  const { data: studies = [] } = useQuery({
    queryKey: ["delivery-studies-picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("studies")
        .select("id,study_name,site_id,dno,voltage_level,proposed_kw")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async (payload: { name: string; description: string; study_id: string | null; priority: string; target_end_date: string | null }) => {
      if (!user) throw new Error("Not signed in");
      // If a study is selected, inherit site/account/study — no re-entry
      let site_id: string | null = null;
      let study_id: string | null = payload.study_id;
      if (study_id) {
        const { data: s } = await supabase.from("studies").select("site_id").eq("id", study_id).single();
        site_id = s?.site_id ?? null;
      }
      const { data, error } = await supabase
        .from("projects")
        .insert({
          name: payload.name,
          description: payload.description || null,
          study_id,
          site_id,
          org_id: orgId,
          priority: payload.priority as any,
          target_end_date: payload.target_end_date,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Project created");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["delivery-projects"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to create project"),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Briefcase className="h-6 w-6" /> Delivery
          </h1>
          <p className="text-sm text-muted-foreground">
            Programme, milestone and task management for accepted proposals and active connections.
          </p>
        </div>
        <NewProjectDialog open={open} setOpen={setOpen} studies={studies as any} onCreate={(v) => create.mutate(v)} pending={create.isPending} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading projects…</p>
      ) : projects.length === 0 ? (
        <Card className="p-12 text-center">
          <Briefcase className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium mb-1">No delivery projects yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create a project from an accepted study or start a blank one.</p>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> New project</Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {projects.map((p) => (
            <Link key={p.id} to={`/delivery/project/${p.id}`}>
              <Card className="p-4 hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`h-2 w-2 rounded-full ${healthColor[p.health] ?? "bg-muted"}`} />
                      <h3 className="font-medium truncate">{p.name}</h3>
                      {p.code && <span className="text-xs text-muted-foreground">{p.code}</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className={statusColor[p.status]}>{p.status.replace("_", " ")}</Badge>
                      <Badge variant="outline">{p.priority}</Badge>
                      {p.target_end_date && (
                        <span className="text-xs text-muted-foreground">
                          due {new Date(p.target_end_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="w-40 shrink-0">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Progress</span><span>{Math.round(p.percent_complete)}%</span>
                    </div>
                    <Progress value={Number(p.percent_complete)} className="h-2" />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewProjectDialog({
  open,
  setOpen,
  studies,
  onCreate,
  pending,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  studies: { id: string; study_name: string; dno: string | null; voltage_level: string | null; proposed_kw: number | null }[];
  onCreate: (v: { name: string; description: string; study_id: string | null; priority: string; target_end_date: string | null }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [studyId, setStudyId] = useState<string>("none");
  const [priority, setPriority] = useState("medium");
  const [due, setDue] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1" /> New project</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New delivery project</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="EV Hub — Site A delivery" />
          </div>
          <div>
            <Label>Link to Gridwise study (optional — inherits site, DNO, BOQ)</Label>
            <Select value={studyId} onValueChange={setStudyId}>
              <SelectTrigger><SelectValue placeholder="No study" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No study (blank project)</SelectItem>
                {studies.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.study_name} {s.dno ? `· ${s.dno}` : ""} {s.proposed_kw ? `· ${s.proposed_kw}kW` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Priority</Label>
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
            <div>
              <Label>Target end date</Label>
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={!name.trim() || pending}
            onClick={() =>
              onCreate({
                name: name.trim(),
                description,
                study_id: studyId === "none" ? null : studyId,
                priority,
                target_end_date: due || null,
              })
            }
          >
            {pending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}