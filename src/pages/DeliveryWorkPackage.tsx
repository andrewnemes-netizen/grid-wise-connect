import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, MapPin, ListTodo, Milestone as MilestoneIcon, Grid3x3 } from "lucide-react";
import { toast } from "sonner";

export default function DeliveryWorkPackage() {
  const { id } = useParams();
  const wpId = id!;

  const { data: wp } = useQuery({
    queryKey: ["wp", wpId],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_packages")
        .select("*, programmes(id,name,accounts(name))")
        .eq("id", wpId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: sites = [] } = useQuery({
    queryKey: ["wp-sites", wpId],
    queryFn: async () => {
      const { data, error } = await supabase.from("wp_sites")
        .select("id,site_id,sequence,local_ref,sites(id,name,address)")
        .eq("work_package_id", wpId)
        .order("sequence", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: wpTasks = [] } = useQuery({
    queryKey: ["wp-tasks", wpId],
    queryFn: async () => {
      const { data, error } = await supabase.from("wp_tasks")
        .select("*").eq("work_package_id", wpId).order("sort_index");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: wpMilestones = [] } = useQuery({
    queryKey: ["wp-milestones", wpId],
    queryFn: async () => {
      const { data, error } = await supabase.from("wp_milestones")
        .select("*").eq("work_package_id", wpId).order("sequence");
      if (error) throw error;
      return data ?? [];
    },
  });

  const percent = wpTasks.length === 0 ? 0 : Math.round(
    wpTasks.reduce((s: number, t: any) => s + Number(t.percent_complete || 0), 0) / wpTasks.length
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        {wp?.programmes && (
          <Link to={`/delivery/programme/${wp.programmes.id}`} className="text-sm text-muted-foreground flex items-center gap-1 mb-2 hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> {wp.programmes.name}
          </Link>
        )}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{wp?.name ?? "Work package"}</h1>
            <p className="text-sm text-muted-foreground">
              {wp?.code} {wp?.programmes?.accounts?.name ? `· ${wp.programmes.accounts.name}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Sites" value={sites.length} icon={<MapPin className="h-4 w-4" />} />
        <Kpi label="WP tasks" value={wpTasks.length} icon={<ListTodo className="h-4 w-4" />} />
        <Kpi label="Milestones" value={wpMilestones.length} icon={<MilestoneIcon className="h-4 w-4" />} />
        <Card className="p-4">
          <div className="text-xs text-muted-foreground mb-1">WP progress</div>
          <div className="text-2xl font-semibold mb-2">{percent}%</div>
          <Progress value={percent} className="h-1.5" />
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="tasks">WP Tasks</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="matrix">Matrix</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="p-4 space-y-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Status</span><div>{wp?.status ?? "—"}</div></div>
              <div><span className="text-muted-foreground">Approved value</span><div>{wp?.budget_amount ? `£${Number(wp.budget_amount).toLocaleString()}` : "—"}</div></div>
              <div><span className="text-muted-foreground">Start</span><div>{wp?.start_date ?? "—"}</div></div>
              <div><span className="text-muted-foreground">Target end</span><div>{wp?.target_end_date ?? "—"}</div></div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="sites">
          <SitesPanel wpId={wpId} sites={sites as any} />
        </TabsContent>

        <TabsContent value="tasks">
          <WpTasksPanel wpId={wpId} tasks={wpTasks as any} milestones={wpMilestones as any} />
        </TabsContent>

        <TabsContent value="milestones">
          <WpMilestonesPanel wpId={wpId} milestones={wpMilestones as any} />
        </TabsContent>

        <TabsContent value="matrix">
          <SiteMatrix sites={sites as any} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ label, value, icon }: { label: string; value: number | string; icon?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">{icon} {label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </Card>
  );
}

function SitesPanel({ wpId, sites }: { wpId: string; sites: any[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState("");
  const [ref, setRef] = useState("");

  const { data: available = [] } = useQuery({
    queryKey: ["sites-available", wpId],
    queryFn: async () => {
      const { data, error } = await supabase.from("sites").select("id,name,address").order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      const usedIds = new Set(sites.map((s: any) => s.site_id));
      return (data ?? []).filter((s: any) => !usedIds.has(s.id));
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("wp_sites").insert({
        work_package_id: wpId, site_id: siteId, local_ref: ref || null, sequence: sites.length + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Site added"); setOpen(false); setSiteId(""); setRef(""); qc.invalidateQueries({ queryKey: ["wp-sites", wpId] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add site</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add site to work package</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Site</Label>
                <Select value={siteId} onValueChange={setSiteId}>
                  <SelectTrigger><SelectValue placeholder="Pick a site" /></SelectTrigger>
                  <SelectContent>
                    {(available as any[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} {s.address ? `— ${s.address}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Local ref (optional)</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Site 01" /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={!siteId || add.isPending} onClick={() => add.mutate()}>{add.isPending ? "Adding…" : "Add"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {sites.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No sites yet. Add sites from your existing Gridwise site list.</Card>
      ) : (
        <div className="grid gap-2">
          {sites.map((s: any) => (
            <Card key={s.id} className="p-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {s.local_ref ? `${s.local_ref} · ` : ""}{s.sites?.name ?? "Site"}
                </div>
                <div className="text-xs text-muted-foreground truncate">{s.sites?.address ?? ""}</div>
              </div>
              <Link to={`/site/${s.site_id}`}><Button size="sm" variant="ghost">Open</Button></Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function WpTasksPanel({ wpId, tasks, milestones }: { wpId: string; tasks: any[]; milestones: any[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [milestoneId, setMilestoneId] = useState("none");
  const [due, setDue] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("wp_tasks").insert({
        work_package_id: wpId, title, due_date: due || null,
        milestone_id: milestoneId === "none" ? null : milestoneId,
        sort_index: tasks.length, created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Task added"); setOpen(false); setTitle(""); setDue(""); qc.invalidateQueries({ queryKey: ["wp-tasks", wpId] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status, percent }: { id: string; status: string; percent: number }) => {
      const { error } = await supabase.from("wp_tasks").update({ status: status as any, percent_complete: percent }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wp-tasks", wpId] }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> New WP task</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New work-package task</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Release construction batch 1" /></div>
              <div><Label>Milestone</Label>
                <Select value={milestoneId} onValueChange={setMilestoneId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {milestones.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Due date</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Creating…" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {tasks.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No WP tasks yet. Add the first work-package-level task.</Card>
      ) : (
        <div className="grid gap-2">
          {tasks.map((t: any) => (
            <Card key={t.id} className="p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{t.title}</div>
                <div className="text-xs text-muted-foreground">{t.due_date ? `due ${new Date(t.due_date).toLocaleDateString()}` : ""}</div>
              </div>
              <Select value={t.status}
                onValueChange={(v) => setStatus.mutate({ id: t.id, status: v, percent: v === "done" ? 100 : v === "in_progress" ? Math.max(10, Number(t.percent_complete) || 10) : Number(t.percent_complete) || 0 })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_started">Not started</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="outline">{Math.round(Number(t.percent_complete))}%</Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function WpMilestonesPanel({ wpId, milestones }: { wpId: string; milestones: any[] }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phase, setPhase] = useState("mobilisation");
  const [planned, setPlanned] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("wp_milestones").insert({
        work_package_id: wpId, name, phase: phase as any,
        planned_date: planned || null, sequence: milestones.length + 1, created_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Milestone added"); setOpen(false); setName(""); setPlanned(""); qc.invalidateQueries({ queryKey: ["wp-milestones", wpId] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" /> New milestone</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New WP milestone</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Release construction" /></div>
              <div><Label>Phase</Label>
                <Select value={phase} onValueChange={setPhase}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["mobilisation","design_batch","procurement","construction","commissioning","handover","commercial","custom"].map((p) =>
                      <SelectItem key={p} value={p}>{p.replace("_"," ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Planned date</Label><Input type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>{create.isPending ? "Creating…" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {milestones.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">No milestones. Add the delivery gates for this work package.</Card>
      ) : (
        <div className="grid gap-2">
          {milestones.map((m: any) => (
            <Card key={m.id} className="p-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{m.name}</div>
                <div className="text-xs text-muted-foreground">{m.phase.replace("_"," ")} {m.planned_date ? `· ${new Date(m.planned_date).toLocaleDateString()}` : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-28"><Progress value={Number(m.percent_complete)} className="h-1.5" /></div>
                <Badge variant="outline">{Math.round(Number(m.percent_complete))}%</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const STAGES = ["survey","design","dno","permit","civils","electrical","meter","handover"] as const;
function SiteMatrix({ sites }: { sites: any[] }) {
  if (sites.length === 0) return <Card className="p-8 text-center text-sm text-muted-foreground">Add sites to see the readiness matrix.</Card>;
  return (
    <Card className="p-0 overflow-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-left p-2 sticky left-0 bg-muted/40">Site</th>
            {STAGES.map((s) => <th key={s} className="p-2 text-left capitalize">{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {sites.map((s: any) => (
            <tr key={s.id} className="border-t">
              <td className="p-2 sticky left-0 bg-background font-medium">
                {s.local_ref ? `${s.local_ref} · ` : ""}{s.sites?.name}
              </td>
              {STAGES.map((st) => (
                <td key={st} className="p-2">
                  <Badge variant="outline" className="text-[10px]">Not started</Badge>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-2 text-[11px] text-muted-foreground">Stage tracking wired up in Phase 2b (site_stage_status table).</div>
    </Card>
  );
}