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
import { ArrowLeft, Plus, MapPin, ListTodo, Milestone as MilestoneIcon, Receipt, Pencil, Check, X, Upload, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import WpEstimatePanel from "@/components/delivery/WpEstimatePanel";
import SiteEstimatesPanel from "@/components/delivery/SiteEstimatesPanel";
import { EstimatesTab } from "@/components/delivery/estimate/EstimatesTab";
import { InteractiveGantt } from "@/components/delivery/gantt/InteractiveGantt";
import { TaskBoard } from "@/components/delivery/board/TaskBoard";
import { StatusOption } from "@/lib/board/types";
import { InlineEdit } from "@/components/InlineEdit";
import { DeliverySplitLayout } from "@/components/delivery/DeliverySplitLayout";
import { ProgrammeMapPane } from "@/components/delivery/ProgrammeMapPane";
import { useNavigate } from "react-router-dom";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";

const WP_LIFECYCLE = [
  { value: "planning", label: "planning" },
  { value: "active", label: "active" },
  { value: "on_hold", label: "on hold" },
  { value: "complete", label: "complete" },
  { value: "cancelled", label: "cancelled" },
];

const WP_STATUS_OPTIONS: StatusOption[] = [
  { value: "not_started", label: "Not started", color: "hsl(var(--status-todo))" },
  { value: "in_progress", label: "In progress", color: "hsl(var(--status-progress))" },
  { value: "review", label: "Review", color: "hsl(var(--status-review))" },
  { value: "blocked", label: "Blocked", color: "hsl(var(--status-blocked))" },
  { value: "done", label: "Done", color: "hsl(var(--status-done))" },
];

export default function DeliveryWorkPackage() {
  const { id } = useParams();
  const wpId = id!;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { enabled: gridwiseOsEnabled } = useFeatureFlag("gridwise_os_shell");
  const [editingName, setEditingName] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [codeDraft, setCodeDraft] = useState("");

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

  const updateWp = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const { error } = await supabase.from("work_packages").update(patch).eq("id", wpId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Work package updated");
      qc.invalidateQueries({ queryKey: ["wp", wpId] });
      qc.invalidateQueries({ queryKey: ["programme-wps"] });
      setEditingName(false);
      setEditingCode(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const { data: sites = [] } = useQuery({
    queryKey: ["wp-sites", wpId],
    queryFn: async () => {
      const { data, error } = await supabase.from("wp_sites")
        .select("id,site_id,sequence,local_ref,sites(id,site_name,postcode)")
        .eq("work_package_id", wpId)
        .order("sequence", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stageRows = [] } = useQuery({
    queryKey: ["wp-site-stage", wpId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("site_stage_status")
        .select("site_id, stage, workflow_status, blocked_reason")
        .eq("work_package_id", wpId);
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

  // Auto-computed "Approved value" = sum of subtotals across Site estimates (APPROVED),
  // Estimate v1 / work_package_estimates (APPROVED) and Estimates v2 (current).
  const { data: approvedValue } = useQuery({
    queryKey: ["wp-approved-value", wpId, sites.length],
    enabled: !!wpId,
    queryFn: async () => {
      const siteIds = (sites as any[]).map((s) => s.site_id).filter(Boolean);

      const [siteEstRes, wpEstRes, estV2Res] = await Promise.all([
        siteIds.length
          ? supabase
              .from("site_estimates")
              .select("total_price,site_id,version_number,status")
              .in("site_id", siteIds)
              .eq("status", "APPROVED")
          : Promise.resolve({ data: [], error: null } as any),
        supabase
          .from("work_package_estimates")
          .select("total_price,version_number,status")
          .eq("work_package_id", wpId)
          .eq("status", "APPROVED"),
        supabase
          .from("estimates" as any)
          .select("total_price,is_current,status")
          .eq("work_package_id", wpId)
          .eq("is_current", true),
      ]);

      // Site estimates: latest APPROVED version per site
      const latestBySite = new Map<string, any>();
      for (const r of (siteEstRes.data as any[]) ?? []) {
        const cur = latestBySite.get(r.site_id);
        if (!cur || Number(r.version_number ?? 0) > Number(cur.version_number ?? 0)) {
          latestBySite.set(r.site_id, r);
        }
      }
      const siteTotal = Array.from(latestBySite.values())
        .reduce((s, r) => s + Number(r.total_price ?? 0), 0);

      // WP estimate v1: latest APPROVED
      const wpArr = ((wpEstRes.data as any[]) ?? []).slice()
        .sort((a, b) => Number(b.version_number ?? 0) - Number(a.version_number ?? 0));
      const wpTotal = Number(wpArr[0]?.total_price ?? 0);

      // Estimates v2: sum current + approved/awarded/accepted
      const v2Total = ((estV2Res.data as any[]) ?? [])
        .filter((r) => ["approved", "awarded", "accepted"].includes(String(r.status ?? "").toLowerCase()))
        .reduce((s, r) => s + Number(r.total_price ?? 0), 0);

      return {
        total: siteTotal + wpTotal + v2Total,
        siteTotal,
        wpTotal,
        v2Total,
      };
    },
  });

  const percent = wpTasks.length === 0 ? 0 : Math.round(
    wpTasks.reduce((s: number, t: any) => s + Number(t.percent_complete || 0), 0) / wpTasks.length
  );

  return (
    <DeliverySplitLayout
      storageKey="delivery.split.ratio.wp"
      defaultRatio={0.32}
      left={
        <ProgrammeMapPane
          title={wp?.name ?? "Work package"}
          subtitle={[wp?.code, wp?.programmes?.name].filter(Boolean).join(" · ")}
          items={(sites as any[]).map((s: any) => ({
            id: s.id,
            label: s.local_ref ? `${s.local_ref} · ${s.sites?.site_name ?? "Site"}` : (s.sites?.site_name ?? "Site"),
            sub: s.sites?.postcode ?? undefined,
          }))}
          emptyLabel="No sites added yet"
          onOpenMap={() => navigate("/")}
        />
      }
      right={
        <div className="p-6 max-w-6xl mx-auto space-y-6">
          <div>
        {wp?.programmes && (
          <Link to={`/delivery/programme/${wp.programmes.id}`} className="text-sm text-muted-foreground flex items-center gap-1 mb-2 hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> {wp.programmes.name}
          </Link>
        )}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="text-2xl font-semibold h-10"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && nameDraft.trim()) updateWp.mutate({ name: nameDraft.trim() });
                    if (e.key === "Escape") setEditingName(false);
                  }}
                />
                <Button size="icon" variant="ghost" disabled={!nameDraft.trim() || updateWp.isPending} onClick={() => updateWp.mutate({ name: nameDraft.trim() })}><Check className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setEditingName(false)}><X className="h-4 w-4" /></Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h1 className="text-2xl font-semibold truncate">{wp?.name ?? "Work package"}</h1>
                <Button size="icon" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => { setNameDraft(wp?.name ?? ""); setEditingName(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
              {editingCode ? (
                <>
                  <Input
                    autoFocus
                    value={codeDraft}
                    onChange={(e) => setCodeDraft(e.target.value)}
                    className="h-7 w-32 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") updateWp.mutate({ code: codeDraft.trim() });
                      if (e.key === "Escape") setEditingCode(false);
                    }}
                  />
                  <Button size="icon" variant="ghost" className="h-6 w-6" disabled={updateWp.isPending} onClick={() => updateWp.mutate({ code: codeDraft.trim() })}><Check className="h-3 w-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingCode(false)}><X className="h-3 w-3" /></Button>
                </>
              ) : (
                <button className="hover:text-foreground inline-flex items-center gap-1" onClick={() => { setCodeDraft(wp?.code ?? ""); setEditingCode(true); }}>
                  {wp?.code ?? "add code"} <Pencil className="h-3 w-3 opacity-60" />
                </button>
              )}
              {wp?.programmes?.accounts?.name && <span>· {wp.programmes.accounts.name}</span>}
            </div>
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

      <div className="flex justify-end">
        {gridwiseOsEnabled && (
          <Button asChild variant="default" size="sm" className="mr-2">
            <Link to={`/wp/${wpId}`}>
              <Sparkles className="h-4 w-4 mr-2" /> Open in Gridwise OS
            </Link>
          </Button>
        )}
        <Button asChild variant="outline" size="sm">
          <Link to={`/import/wizard?wp=${wpId}${wp?.programme_id ? `&programme=${wp.programme_id}` : ""}`}>
            <Upload className="h-4 w-4 mr-2" /> Import sites
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="tasks">WP Tasks</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
          <TabsTrigger value="matrix">Matrix</TabsTrigger>
          <TabsTrigger value="gantt">Master Gantt</TabsTrigger>
          <TabsTrigger value="igantt">Interactive Gantt</TabsTrigger>
          <TabsTrigger value="site-estimates">Site estimates</TabsTrigger>
          <TabsTrigger value="estimate"><Receipt className="h-3.5 w-3.5 mr-1" />Estimate v1</TabsTrigger>
          <TabsTrigger value="estimates-v2"><Receipt className="h-3.5 w-3.5 mr-1" />Estimates</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="p-4 space-y-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Status</span>
                <div><InlineEdit value={wp?.status} options={WP_LIFECYCLE} onSave={(v) => updateWp.mutate({ status: v })} pending={updateWp.isPending} /></div>
              </div>
              <div>
                <span className="text-muted-foreground">Approved value</span>
                <div
                  className="font-medium tabular-nums"
                  title={
                    approvedValue
                      ? `Site estimates £${Math.round(approvedValue.siteTotal).toLocaleString()} + Estimate v1 £${Math.round(approvedValue.wpTotal).toLocaleString()} + Estimates £${Math.round(approvedValue.v2Total).toLocaleString()}`
                      : "Sum of subtotals from Site estimates, Estimate v1 and Estimates"
                  }
                >
                  £{Math.round(approvedValue?.total ?? 0).toLocaleString()}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">auto from estimates</div>
              </div>
              <div>
                <span className="text-muted-foreground">Start</span>
                <div><InlineEdit type="date" value={wp?.start_date} onSave={(v) => updateWp.mutate({ start_date: v })} pending={updateWp.isPending} inputClassName="w-40" /></div>
              </div>
              <div>
                <span className="text-muted-foreground">Target end</span>
                <div><InlineEdit type="date" value={wp?.target_end_date} onSave={(v) => updateWp.mutate({ target_end_date: v })} pending={updateWp.isPending} inputClassName="w-40" /></div>
              </div>
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

        <TabsContent value="igantt">
          <InteractiveGantt
            scope={{ table: "wp_tasks", depsTable: "wp_task_dependencies", scopeCol: "work_package_id", scopeId: wpId }}
            milestones={wpMilestones as any}
          />
        </TabsContent>

        <TabsContent value="site-estimates">
          <SiteEstimatesPanel wpId={wpId} />
        </TabsContent>

        <TabsContent value="estimate">
          <WpEstimatePanel wpId={wpId} />
        </TabsContent>

        <TabsContent value="estimates-v2">
          <EstimatesTab scope={{ work_package_id: wpId }} />
        </TabsContent>
      </Tabs>
        </div>
      }
    />
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
      const { data, error } = await supabase.from("sites").select("id,site_name,postcode").order("created_at", { ascending: false }).limit(500);
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
                    {(available as any[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.site_name ?? "Site"} {s.postcode ? `— ${s.postcode}` : ""}</SelectItem>)}
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
                  {s.local_ref ? `${s.local_ref} · ` : ""}{s.sites?.site_name ?? "Site"}
                </div>
                <div className="text-xs text-muted-foreground truncate">{s.sites?.postcode ?? ""}</div>
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
  return (
    <TaskBoard
      projectId={wpId}
      tasks={tasks}
      milestones={milestones}
      scope={{ table: "wp_tasks", scopeCol: "work_package_id", scopeId: wpId }}
      statusOptions={WP_STATUS_OPTIONS}
      invalidateKeys={[["wp-tasks", wpId]]}
    />
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
                    {s.local_ref ? `${s.local_ref} · ` : ""}{s.sites?.site_name}
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
          label: `▸ ${site?.local_ref ? site.local_ref + " · " : ""}${site?.sites?.site_name ?? sp.name}`,
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