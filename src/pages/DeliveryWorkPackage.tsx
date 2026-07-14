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
import { ArrowLeft, Plus, MapPin, ListTodo, Milestone as MilestoneIcon } from "lucide-react";
import { useMemo } from "react";
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

  const { data: stageRows = [] } = useQuery({
    queryKey: ["wp-site-stage", wpId],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_stage_status")
        .select("*").eq("work_package_id", wpId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sitePrograms = [] } = useQuery({
    queryKey: ["wp-site-programmes", wpId],
    queryFn: async () => {
      const { data, error } = await supabase.from("site_programmes")
        .select("id,name,site_id,start_date,target_end_date,percent_complete,status")
        .eq("work_package_id", wpId);
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
          <TabsTrigger value="gantt">Master Gantt</TabsTrigger>
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
          <SiteMatrix wpId={wpId} sites={sites as any} stageRows={stageRows as any} />
        </TabsContent>

        <TabsContent value="gantt">
          <MasterGantt
            sites={sites as any}
            sitePrograms={sitePrograms as any}
            milestones={wpMilestones as any}
            wpStart={wp?.start_date}
            wpEnd={wp?.target_end_date}
          />
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
const STAGE_COLORS: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground",
  in_progress: "bg-primary/15 text-primary border-primary/30",
  review: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  blocked: "bg-destructive/15 text-destructive border-destructive/30",
  done: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
};
const STAGE_LABEL: Record<string, string> = {
  not_started: "—", in_progress: "In progress", review: "Review", blocked: "Blocked", done: "Done",
};

function SiteMatrix({ wpId, sites, stageRows }: { wpId: string; sites: any[]; stageRows: any[] }) {
  const qc = useQueryClient();
  const stageBySite = useMemo(() => {
    const m: Record<string, any> = {};
    stageRows.forEach((r) => { m[r.site_id] = r; });
    return m;
  }, [stageRows]);

  // Rollup counts
  const counts = useMemo(() => {
    const c: Record<string, Record<string, number>> = {};
    STAGES.forEach((s) => { c[s] = { not_started: 0, in_progress: 0, review: 0, blocked: 0, done: 0 }; });
    sites.forEach((s: any) => {
      const row = stageBySite[s.site_id];
      STAGES.forEach((st) => {
        const v = row?.[st] ?? "not_started";
        c[st][v] = (c[st][v] ?? 0) + 1;
      });
    });
    return c;
  }, [sites, stageBySite]);

  const setStage = useMutation({
    mutationFn: async ({ site_id, stage, value }: { site_id: string; stage: string; value: string }) => {
      const existing = stageBySite[site_id];
      if (existing) {
        const { error } = await supabase.from("site_stage_status").update({ [stage]: value as any }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("site_stage_status").insert({
          work_package_id: wpId, site_id, [stage]: value as any,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wp-site-stage", wpId] }),
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  if (sites.length === 0) return <Card className="p-8 text-center text-sm text-muted-foreground">Add sites to see the readiness matrix.</Card>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
        {STAGES.map((st) => (
          <Card key={st} className="p-2">
            <div className="text-[11px] text-muted-foreground capitalize">{st}</div>
            <div className="text-lg font-semibold">{counts[st].done}<span className="text-xs text-muted-foreground">/{sites.length}</span></div>
            <div className="text-[10px] text-muted-foreground">
              {counts[st].in_progress} live · {counts[st].blocked} blocked
            </div>
          </Card>
        ))}
      </div>
      <Card className="p-0 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              <th className="text-left p-2 sticky left-0 bg-muted/40 z-10">Site</th>
              {STAGES.map((s) => <th key={s} className="p-2 text-left capitalize">{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {sites.map((s: any) => {
              const row = stageBySite[s.site_id];
              return (
                <tr key={s.id} className="border-t">
                  <td className="p-2 sticky left-0 bg-background font-medium whitespace-nowrap">
                    {s.local_ref ? `${s.local_ref} · ` : ""}{s.sites?.name}
                  </td>
                  {STAGES.map((st) => {
                    const v = row?.[st] ?? "not_started";
                    return (
                      <td key={st} className="p-1">
                        <Select value={v} onValueChange={(nv) => setStage.mutate({ site_id: s.site_id, stage: st, value: nv })}>
                          <SelectTrigger className={`h-7 text-[10px] px-2 border ${STAGE_COLORS[v]}`}>
                            <SelectValue>{STAGE_LABEL[v]}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {Object.keys(STAGE_LABEL).map((k) => <SelectItem key={k} value={k}>{STAGE_LABEL[k]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <p className="text-[11px] text-muted-foreground">
        Stages auto-update from site tasks tagged with a <code>stage</code> in metadata (blocked &gt; in progress/review &gt; done). Manual overrides here take effect immediately.
      </p>
    </div>
  );
}

function MasterGantt({
  sites, sitePrograms, milestones, wpStart, wpEnd,
}: {
  sites: any[];
  sitePrograms: any[];
  milestones: any[];
  wpStart?: string | null;
  wpEnd?: string | null;
}) {
  const parse = (d: any) => (d ? new Date(d) : null);
  const items = useMemo(() => {
    const rows: { key: string; label: string; kind: "wp" | "milestone" | "site"; start: Date; end: Date; percent: number }[] = [];
    const wpS = parse(wpStart);
    const wpE = parse(wpEnd);
    if (wpS && wpE) rows.push({ key: "wp-bar", label: "Work package", kind: "wp", start: wpS, end: wpE, percent: 0 });
    milestones.forEach((m: any) => {
      const d = parse(m.planned_date) ?? parse(m.actual_date);
      if (d) rows.push({ key: `m-${m.id}`, label: `◆ ${m.name}`, kind: "milestone", start: d, end: d, percent: Number(m.percent_complete) });
    });
    const siteById: Record<string, any> = {};
    sites.forEach((s: any) => { siteById[s.site_id] = s; });
    sitePrograms.forEach((sp: any) => {
      const s = parse(sp.start_date);
      const e = parse(sp.target_end_date);
      if (s && e) {
        const site = siteById[sp.site_id];
        rows.push({
          key: `sp-${sp.id}`,
          label: `▸ ${site?.local_ref ? site.local_ref + " · " : ""}${site?.sites?.name ?? sp.name}`,
          kind: "site", start: s, end: e, percent: Number(sp.percent_complete),
        });
      }
    });
    return rows;
  }, [sites, sitePrograms, milestones, wpStart, wpEnd]);

  if (items.length === 0) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Add start/end dates to the work package, milestones or site programmes to see the master Gantt.</Card>;
  }

  const min = new Date(Math.min(...items.map((i) => i.start.getTime())));
  const max = new Date(Math.max(...items.map((i) => i.end.getTime())));
  const days = Math.max(1, Math.round((max.getTime() - min.getTime()) / 86400000) + 1);
  const dayW = 20;
  const width = days * dayW;
  const daysFrom = (d: Date) => Math.round((d.getTime() - min.getTime()) / 86400000);

  return (
    <Card className="p-0 overflow-auto">
      <div className="grid" style={{ gridTemplateColumns: `260px ${width}px` }}>
        <div className="p-2 border-b border-r bg-muted/40 text-xs font-medium sticky left-0 z-10">Item</div>
        <div className="border-b bg-muted/40 flex text-[10px] text-muted-foreground">
          {Array.from({ length: days }).map((_, i) => {
            const d = new Date(min.getTime() + i * 86400000);
            const label = d.getDate() === 1 || i === 0;
            return (
              <div key={i} className="border-r text-center py-1" style={{ width: dayW }}>
                {label ? d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : d.getDate()}
              </div>
            );
          })}
        </div>
        {items.map((it) => {
          const off = daysFrom(it.start);
          const span = Math.max(1, daysFrom(it.end) - off + 1);
          const barColor = it.kind === "wp" ? "bg-primary" : it.kind === "milestone" ? "bg-amber-500" : "bg-emerald-500/80";
          return (
            <div key={it.key} className="contents">
              <div className={`p-2 border-b border-r text-xs sticky left-0 bg-background z-10 truncate ${it.kind === "wp" ? "font-semibold" : ""}`}>
                {it.label}
              </div>
              <div className="border-b relative h-8">
                <div
                  className={`absolute top-1 h-6 rounded ${barColor} text-white text-[10px] flex items-center px-2 overflow-hidden`}
                  style={{ left: off * dayW, width: span * dayW - 2 }}
                  title={`${it.label} · ${it.start.toLocaleDateString()} → ${it.end.toLocaleDateString()}`}
                >
                  {it.kind === "site" ? `${Math.round(it.percent)}%` : ""}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}