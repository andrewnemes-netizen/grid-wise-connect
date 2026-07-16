import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, ChevronDown, ChevronRight, FileText, CheckCircle2, XCircle, Banknote, Mail } from "lucide-react";
import { toast } from "sonner";
import { SendInvoiceDialog } from "@/components/delivery/SendInvoiceDialog";
import { XeroInvoiceButton } from "@/components/delivery/XeroInvoiceButton";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";

// ---- constants ----
const EV_MILESTONES = [
  { label: "Not Started", pct: 0 },
  { label: "5-Site Milestone (25%)", pct: 25 },
  { label: "10-Site Milestone (50%)", pct: 50 },
  { label: "Commissioned + EIC Issued (100%)", pct: 100 },
];
const ICP_MILESTONES = [
  { label: "Not Started", pct: 0 },
  { label: "Upfront Invoiced (40%)", pct: 40 },
  { label: "Completion Pack Issued (100%)", pct: 100 },
];
const PROGRAMMES = ["Connected Kerb", "Westmorland & Furness Council", "Plymouth Programme", "Other"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type Stream = "EV" | "ICP";
type Project = {
  id: string; org_id: string; stream: Stream;
  project_code: string | null; client_id: string | null; site_id: string | null; wp_id: string | null;
  package_id: string | null; site_location: string | null; programme: string | null;
  start_date: string | null; completion_date: string | null;
  app_date: string | null; energisation_date: string | null;
  po_number: string | null; contract_value: number | null;
  civils_contractor: string | null; elec_contractor: string | null;
  notes: string | null;
};
type Milestone = {
  id: string; project_id: string; milestone_status: string; invoice_pct: number | null;
  invoice_month: string | null;
  forecast_revenue: number | null; actual_revenue: number | null;
  forecast_civils: number | null; actual_civils: number | null;
  forecast_elec: number | null; actual_elec: number | null;
  baseline_revenue: number | null;
  invoice_ref: string | null; notes: string | null;
};

const gbp = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(Number(n ?? 0));
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export default function DeliveryRevenue() {
  const { orgId } = useAuth();
  const [tab, setTab] = useState("ev");
  const [year, setYear] = useState(new Date().getFullYear());

  if (!orgId) {
    return <div className="p-6 text-muted-foreground">Loading organisation…</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Revenue Tracker</h1>
          <p className="text-sm text-muted-foreground">EV Charging &amp; ICP Connections — programme revenue and margin.</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Year</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2024,2025,2026,2027,2028].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="ev">EV Log</TabsTrigger>
          <TabsTrigger value="icp">ICP Log</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="forecast">Forecast</TabsTrigger>
          <TabsTrigger value="dash-ev">Dashboard — EV</TabsTrigger>
          <TabsTrigger value="dash-icp">Dashboard — ICP</TabsTrigger>
          <TabsTrigger value="dash-combined">Combined</TabsTrigger>
        </TabsList>
        <TabsContent value="ev" className="mt-4"><ProjectLog stream="EV" orgId={orgId} /></TabsContent>
        <TabsContent value="icp" className="mt-4"><ProjectLog stream="ICP" orgId={orgId} /></TabsContent>
        <TabsContent value="invoices" className="mt-4"><InvoicesTab orgId={orgId} /></TabsContent>
        <TabsContent value="forecast" className="mt-4"><ForecastGrid orgId={orgId} year={year} /></TabsContent>
        <TabsContent value="dash-ev" className="mt-4"><StreamDashboard stream="EV" orgId={orgId} year={year} /></TabsContent>
        <TabsContent value="dash-icp" className="mt-4"><StreamDashboard stream="ICP" orgId={orgId} year={year} /></TabsContent>
        <TabsContent value="dash-combined" className="mt-4"><CombinedDashboard orgId={orgId} year={year} /></TabsContent>
      </Tabs>
    </div>
  );
}

// =========================================================================
// PROJECT LOG (EV or ICP)
// =========================================================================
function ProjectLog({ stream, orgId }: { stream: Stream; orgId: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newOpen, setNewOpen] = useState(false);

  const { data: projects = [] } = useQuery({
    queryKey: ["revenue-projects", orgId, stream],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue_projects").select("*")
        .eq("org_id", orgId).eq("stream", stream)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Project[];
    },
  });

  const projectIds = projects.map((p) => p.id);
  const { data: milestones = [] } = useQuery({
    queryKey: ["revenue-milestones", projectIds],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue_milestones").select("*")
        .in("project_id", projectIds)
        .order("invoice_month", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Milestone[];
    },
  });

  const byProject = useMemo(() => {
    const m: Record<string, Milestone[]> = {};
    milestones.forEach((x) => { (m[x.project_id] ||= []).push(x); });
    return m;
  }, [milestones]);

  const totals = (pid: string) => {
    const ms = byProject[pid] ?? [];
    const rev = ms.reduce((s, x) => s + Number(x.actual_revenue ?? 0), 0);
    const civ = ms.reduce((s, x) => s + Number(x.actual_civils ?? 0), 0);
    const el = ms.reduce((s, x) => s + Number(x.actual_elec ?? 0), 0);
    const gp = rev - civ - el;
    return { rev, civ, el, gp, gpPct: rev > 0 ? gp / rev : 0 };
  };

  const delProject = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("revenue_projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["revenue-projects"] }); toast.success("Project removed"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">{stream === "EV" ? "EV Charging Installations" : "ICP Connections"}</h3>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" /> New project</Button>
          </DialogTrigger>
          <NewProjectDialog stream={stream} orgId={orgId} onDone={() => setNewOpen(false)} />
        </Dialog>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Project</TableHead>
              <TableHead>Client / Site</TableHead>
              <TableHead>Programme</TableHead>
              {stream === "EV" ? (
                <><TableHead>Start</TableHead><TableHead>Completion</TableHead></>
              ) : (
                <><TableHead>App date</TableHead><TableHead>Energisation</TableHead></>
              )}
              <TableHead className="text-right">Contract</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">GP</TableHead>
              <TableHead className="text-right">GP%</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.length === 0 && (
              <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">No projects yet</TableCell></TableRow>
            )}
            {projects.map((p) => {
              const t = totals(p.id);
              const open = expanded[p.id];
              return (
                <>
                  <TableRow key={p.id}>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-6 w-6"
                        onClick={() => setExpanded((e) => ({ ...e, [p.id]: !e[p.id] }))}>
                        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </Button>
                    </TableCell>
                    <TableCell className="font-medium">{p.project_code || "—"}<div className="text-xs text-muted-foreground">{p.package_id}</div></TableCell>
                    <TableCell>{p.site_location || "—"}</TableCell>
                    <TableCell><Badge variant="outline">{p.programme || "—"}</Badge></TableCell>
                    <TableCell>{stream === "EV" ? (p.start_date ?? "—") : (p.app_date ?? "—")}</TableCell>
                    <TableCell>{stream === "EV" ? (p.completion_date ?? "—") : (p.energisation_date ?? "—")}</TableCell>
                    <TableCell className="text-right">{gbp(p.contract_value)}</TableCell>
                    <TableCell className="text-right">{gbp(t.rev)}</TableCell>
                    <TableCell className="text-right">{gbp(t.gp)}</TableCell>
                    <TableCell className="text-right">{pct(t.gpPct)}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => confirm("Delete project?") && delProject.mutate(p.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {open && (
                    <TableRow key={p.id + "-m"}>
                      <TableCell colSpan={11} className="bg-muted/30">
                        <MilestoneEditor project={p} milestones={byProject[p.id] ?? []} />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// =========================================================================
// NEW PROJECT DIALOG
// =========================================================================
function NewProjectDialog({ stream, orgId, onDone }: { stream: Stream; orgId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    project_code: "", package_id: "", site_location: "", programme: "Connected Kerb",
    start_date: "", completion_date: "", app_date: "", energisation_date: "",
    po_number: "", contract_value: 0, civils_contractor: "", elec_contractor: "", notes: "",
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("revenue_projects").insert({
        org_id: orgId, stream, ...form,
        contract_value: Number(form.contract_value) || 0,
        start_date: form.start_date || null,
        completion_date: form.completion_date || null,
        app_date: form.app_date || null,
        energisation_date: form.energisation_date || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenue-projects"] });
      toast.success("Project created");
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>New {stream} project</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Project code"><Input value={form.project_code} onChange={(e) => setForm({ ...form, project_code: e.target.value })} /></Field>
        <Field label="Package ID"><Input value={form.package_id} onChange={(e) => setForm({ ...form, package_id: e.target.value })} /></Field>
        <Field label="Site / Location" className="col-span-2"><Input value={form.site_location} onChange={(e) => setForm({ ...form, site_location: e.target.value })} /></Field>
        <Field label="Programme">
          <Select value={form.programme} onValueChange={(v) => setForm({ ...form, programme: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PROGRAMMES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="PO number"><Input value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} /></Field>
        {stream === "EV" ? (
          <>
            <Field label="Start date"><Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></Field>
            <Field label="Completion date"><Input type="date" value={form.completion_date} onChange={(e) => setForm({ ...form, completion_date: e.target.value })} /></Field>
          </>
        ) : (
          <>
            <Field label="App date"><Input type="date" value={form.app_date} onChange={(e) => setForm({ ...form, app_date: e.target.value })} /></Field>
            <Field label="Energisation date"><Input type="date" value={form.energisation_date} onChange={(e) => setForm({ ...form, energisation_date: e.target.value })} /></Field>
          </>
        )}
        <Field label="Contract value (£)"><Input type="number" value={form.contract_value} onChange={(e) => setForm({ ...form, contract_value: Number(e.target.value) })} /></Field>
        <Field label="Civils contractor"><Input value={form.civils_contractor} onChange={(e) => setForm({ ...form, civils_contractor: e.target.value })} /></Field>
        <Field label="Electrical contractor"><Input value={form.elec_contractor} onChange={(e) => setForm({ ...form, elec_contractor: e.target.value })} /></Field>
        <Field label="Notes" className="col-span-2"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
      <DialogFooter>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>Create project</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={className}><Label className="text-xs">{label}</Label>{children}</div>;
}

// =========================================================================
// MILESTONE EDITOR (inline)
// =========================================================================
function MilestoneEditor({ project, milestones }: { project: Project; milestones: Milestone[] }) {
  const qc = useQueryClient();
  const defs = project.stream === "EV" ? EV_MILESTONES : ICP_MILESTONES;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["revenue-milestones"] });
    qc.invalidateQueries({ queryKey: ["revenue-rollup"] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const first = defs[1] ?? defs[0];
      const cv = Number(project.contract_value ?? 0);
      const forecast = cv * (first.pct / 100);
      const { error } = await supabase.from("revenue_milestones").insert({
        project_id: project.id,
        milestone_status: first.label,
        invoice_pct: first.pct,
        invoice_month: new Date().toISOString().slice(0, 8) + "01",
        forecast_revenue: forecast,
        baseline_revenue: forecast,
      } as any);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: async (row: Partial<Milestone> & { id: string }) => {
      const { error } = await supabase.from("revenue_milestones").update(row).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("revenue_milestones").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return (
    <div className="p-2 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Milestones &amp; invoices</div>
        <Button size="sm" variant="outline" onClick={() => add.mutate()}><Plus className="w-3 h-3 mr-1" /> Add milestone</Button>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Invoice month</TableHead>
              <TableHead>%</TableHead>
              <TableHead className="text-right">Forecast Rev</TableHead>
              <TableHead className="text-right">Actual Rev</TableHead>
              <TableHead className="text-right">Fc Civils</TableHead>
              <TableHead className="text-right">Act Civils</TableHead>
              <TableHead className="text-right">Fc Elec</TableHead>
              <TableHead className="text-right">Act Elec</TableHead>
              <TableHead>Ref</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {milestones.length === 0 && (
              <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-4">No milestones yet</TableCell></TableRow>
            )}
            {milestones.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <Select value={m.milestone_status} onValueChange={(v) => {
                    const def = defs.find((d) => d.label === v);
                    update.mutate({ id: m.id, milestone_status: v, invoice_pct: def?.pct ?? m.invoice_pct ?? 0 });
                  }}>
                    <SelectTrigger className="w-56 h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{defs.map((d) => <SelectItem key={d.label} value={d.label}>{d.label}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input type="month" className="h-8 w-32"
                    value={m.invoice_month ? m.invoice_month.slice(0, 7) : ""}
                    onChange={(e) => update.mutate({ id: m.id, invoice_month: e.target.value ? e.target.value + "-01" : null })} />
                </TableCell>
                <TableCell>
                  <Input type="number" className="h-8 w-16" value={Number(m.invoice_pct ?? 0)}
                    onChange={(e) => update.mutate({ id: m.id, invoice_pct: Number(e.target.value) })} />
                </TableCell>
                {(["forecast_revenue","actual_revenue","forecast_civils","actual_civils","forecast_elec","actual_elec"] as const).map((f) => (
                  <TableCell key={f} className="text-right">
                    <Input type="number" className="h-8 w-24 text-right" value={Number((m as any)[f] ?? 0)}
                      onChange={(e) => update.mutate({ id: m.id, [f]: Number(e.target.value) } as any)} />
                  </TableCell>
                ))}
                <TableCell>
                  <Input className="h-8 w-24" value={m.invoice_ref ?? ""}
                    onChange={(e) => update.mutate({ id: m.id, invoice_ref: e.target.value })} />
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => remove.mutate(m.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// =========================================================================
// FORECAST GRID
// =========================================================================
type RollupRow = {
  stream: string; month: number;
  forecast_revenue: number; baseline_revenue: number; actual_revenue: number;
  forecast_civils: number; actual_civils: number;
  forecast_elec: number; actual_elec: number;
  forecast_gp: number; actual_gp: number;
};

function useRollup(orgId: string, year: number) {
  return useQuery({
    queryKey: ["revenue-rollup", orgId, year],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("revenue_monthly_rollup", { _org_id: orgId, _year: year });
      if (error) throw error;
      return (data ?? []) as RollupRow[];
    },
  });
}

function pickMonth(rows: RollupRow[], stream: string, month: number, field: keyof RollupRow) {
  const r = rows.find((x) => x.stream === stream && x.month === month);
  return r ? Number(r[field] as any) : 0;
}
function sumRow(rows: RollupRow[], stream: string, field: keyof RollupRow) {
  return rows.filter((r) => r.stream === stream).reduce((s, r) => s + Number(r[field] as any), 0);
}

function ForecastGrid({ orgId, year }: { orgId: string; year: number }) {
  const { data: rows = [] } = useRollup(orgId, year);

  const rowDefs: { label: string; stream: Stream | "COMBINED"; field: keyof RollupRow; header?: boolean }[] = [
    { label: "EV CHARGING", stream: "EV", field: "forecast_revenue", header: true },
    { label: "  Forecast Revenue", stream: "EV", field: "forecast_revenue" },
    { label: "  Pipeline Baseline", stream: "EV", field: "baseline_revenue" },
    { label: "  Actual Revenue", stream: "EV", field: "actual_revenue" },
    { label: "  Forecast Civils", stream: "EV", field: "forecast_civils" },
    { label: "  Actual Civils", stream: "EV", field: "actual_civils" },
    { label: "  Forecast Elec", stream: "EV", field: "forecast_elec" },
    { label: "  Actual Elec", stream: "EV", field: "actual_elec" },
    { label: "  Forecast GP", stream: "EV", field: "forecast_gp" },
    { label: "  Actual GP", stream: "EV", field: "actual_gp" },
    { label: "ICP CONNECTIONS", stream: "ICP", field: "forecast_revenue", header: true },
    { label: "  Forecast Revenue", stream: "ICP", field: "forecast_revenue" },
    { label: "  Pipeline Baseline", stream: "ICP", field: "baseline_revenue" },
    { label: "  Actual Revenue", stream: "ICP", field: "actual_revenue" },
    { label: "  Forecast Civils", stream: "ICP", field: "forecast_civils" },
    { label: "  Actual Civils", stream: "ICP", field: "actual_civils" },
    { label: "  Forecast Elec", stream: "ICP", field: "forecast_elec" },
    { label: "  Actual Elec", stream: "ICP", field: "actual_elec" },
    { label: "  Forecast GP", stream: "ICP", field: "forecast_gp" },
    { label: "  Actual GP", stream: "ICP", field: "actual_gp" },
  ];

  return (
    <Card className="p-4">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-64">Category</TableHead>
              {MONTHS.map((m) => <TableHead key={m} className="text-right">{m}</TableHead>)}
              <TableHead className="text-right">FY Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rowDefs.map((rd, i) => rd.header ? (
              <TableRow key={i}><TableCell colSpan={14} className="font-semibold bg-muted/40">{rd.label}</TableCell></TableRow>
            ) : (
              <TableRow key={i}>
                <TableCell className="whitespace-pre">{rd.label}</TableCell>
                {MONTHS.map((_, mi) => (
                  <TableCell key={mi} className="text-right tabular-nums">
                    {gbp(pickMonth(rows, rd.stream, mi + 1, rd.field))}
                  </TableCell>
                ))}
                <TableCell className="text-right tabular-nums font-medium">
                  {gbp(sumRow(rows, rd.stream, rd.field))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

// =========================================================================
// DASHBOARDS
// =========================================================================
function StreamDashboard({ stream, orgId, year }: { stream: Stream; orgId: string; year: number }) {
  const { data: rows = [] } = useRollup(orgId, year);
  const { data: projects = [] } = useQuery({
    queryKey: ["revenue-projects", orgId, stream],
    queryFn: async () => {
      const { data, error } = await supabase.from("revenue_projects").select("id, contract_value").eq("org_id", orgId).eq("stream", stream);
      if (error) throw error;
      return data ?? [];
    },
  });

  const totalRev = sumRow(rows, stream, "actual_revenue");
  const totalFcRev = sumRow(rows, stream, "forecast_revenue");
  const totalCiv = sumRow(rows, stream, "actual_civils");
  const totalEl = sumRow(rows, stream, "actual_elec");
  const totalGp = totalRev - totalCiv - totalEl;
  const contract = projects.reduce((s: number, p: any) => s + Number(p.contract_value ?? 0), 0);

  const chart = MONTHS.map((m, i) => ({
    month: m,
    Forecast: pickMonth(rows, stream, i + 1, "forecast_revenue"),
    Actual: pickMonth(rows, stream, i + 1, "actual_revenue"),
  }));

  const kpis = [
    { label: "Projects", value: projects.length },
    { label: "Contract value", value: gbp(contract) },
    { label: "Revenue (actual)", value: gbp(totalRev) },
    { label: "Civils", value: gbp(totalCiv) },
    { label: "Electrical", value: gbp(totalEl) },
    { label: "Gross profit", value: gbp(totalGp) },
    { label: "GP %", value: totalRev > 0 ? pct(totalGp / totalRev) : "—" },
    { label: "FY Forecast", value: gbp(totalFcRev) },
    { label: "FY Variance", value: gbp(totalRev - totalFcRev) },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="p-3">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="text-lg font-semibold tabular-nums">{k.value}</div>
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <div className="text-sm font-medium mb-3">Monthly revenue — forecast vs actual</div>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(v: any) => gbp(Number(v))} />
              <Legend />
              <Bar dataKey="Forecast" fill="hsl(var(--muted-foreground))" />
              <Bar dataKey="Actual" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function CombinedDashboard({ orgId, year }: { orgId: string; year: number }) {
  const { data: rows = [] } = useRollup(orgId, year);
  const chart = MONTHS.map((m, i) => ({
    month: m,
    "EV Actual": pickMonth(rows, "EV", i + 1, "actual_revenue"),
    "ICP Actual": pickMonth(rows, "ICP", i + 1, "actual_revenue"),
    "EV Forecast": pickMonth(rows, "EV", i + 1, "forecast_revenue"),
    "ICP Forecast": pickMonth(rows, "ICP", i + 1, "forecast_revenue"),
  }));
  const evRev = sumRow(rows, "EV", "actual_revenue");
  const icpRev = sumRow(rows, "ICP", "actual_revenue");
  const evGp = sumRow(rows, "EV", "actual_gp");
  const icpGp = sumRow(rows, "ICP", "actual_gp");
  const combRev = evRev + icpRev;
  const combGp = evGp + icpGp;

  const kpis = [
    { label: "EV Revenue", value: gbp(evRev) },
    { label: "ICP Revenue", value: gbp(icpRev) },
    { label: "Combined Revenue", value: gbp(combRev) },
    { label: "EV GP", value: gbp(evGp) },
    { label: "ICP GP", value: gbp(icpGp) },
    { label: "Combined GP", value: gbp(combGp) },
    { label: "Combined GP %", value: combRev > 0 ? pct(combGp / combRev) : "—" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="p-3">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className="text-lg font-semibold tabular-nums">{k.value}</div>
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <div className="text-sm font-medium mb-3">Combined monthly revenue</div>
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(v: any) => gbp(Number(v))} />
              <Legend />
              <Bar dataKey="EV Actual" stackId="a" fill="hsl(var(--primary))" />
              <Bar dataKey="ICP Actual" stackId="a" fill="hsl(var(--accent))" />
              <Bar dataKey="EV Forecast" fill="hsl(var(--muted-foreground))" fillOpacity={0.4} />
              <Bar dataKey="ICP Forecast" fill="hsl(var(--muted-foreground))" fillOpacity={0.7} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
// =========================================================================
// INVOICES TAB
// =========================================================================
type Invoice = {
  id: string; org_id: string; project_id: string; milestone_id: string | null;
  invoice_number: string; doc_type: "invoice" | "payment_application";
  status: "draft" | "submitted" | "certified" | "paid" | "rejected";
  issue_date: string | null; due_date: string | null; period_from: string | null; period_to: string | null;
  po_number: string | null;
  net_amount: number; vat_rate: number; vat_amount: number; gross_amount: number;
  certified_amount: number | null; certified_date: string | null;
  paid_amount: number | null; paid_date: string | null;
  rejection_reason: string | null; notes: string | null;
  xero_invoice_id?: string | null; xero_status?: string | null;
  xero_amount_paid?: number | null; xero_amount_due?: number | null;
};

const STATUS_TONE: Record<Invoice["status"], string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  certified: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  paid: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-destructive/15 text-destructive",
};

function InvoicesTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [newOpen, setNewOpen] = useState(false);

  const { data: invoices = [] } = useQuery({
    queryKey: ["revenue-invoices", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("revenue_invoices")
        .select("*")
        .eq("org_id", orgId)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["revenue-projects-all", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("revenue_projects")
        .select("id, project_code, site_location, stream, contract_value")
        .eq("org_id", orgId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const projectMap = useMemo(
    () => Object.fromEntries((projects ?? []).map((p: any) => [p.id, p])),
    [projects],
  );

  const filtered = invoices.filter((i) => statusFilter === "all" || i.status === statusFilter);

  // KPIs
  const outstanding = (i: Invoice) =>
    (Number(i.certified_amount ?? i.net_amount) || 0) - (Number(i.paid_amount) || 0);
  const kpis = useMemo(() => {
    const draft = invoices.filter((i) => i.status === "draft");
    const submitted = invoices.filter((i) => i.status === "submitted");
    const certified = invoices.filter((i) => i.status === "certified");
    const overdue = invoices.filter(
      (i) => i.status === "certified" && i.due_date && new Date(i.due_date) < new Date(),
    );
    const paidYTD = invoices
      .filter((i) => i.status === "paid" && i.paid_date && new Date(i.paid_date).getFullYear() === new Date().getFullYear())
      .reduce((s, i) => s + Number(i.paid_amount ?? 0), 0);
    const outstandingTotal = certified.reduce((s, i) => s + outstanding(i), 0);
    return { draft: draft.length, submitted: submitted.length, certifiedCount: certified.length, overdue: overdue.length, paidYTD, outstandingTotal };
  }, [invoices]);

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("revenue_invoices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["revenue-invoices"] }); toast.success("Invoice removed"); },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: "Draft", value: kpis.draft, icon: FileText },
          { label: "Submitted", value: kpis.submitted, icon: FileText },
          { label: "Certified", value: kpis.certifiedCount, icon: CheckCircle2 },
          { label: "Overdue", value: kpis.overdue, icon: XCircle },
          { label: "Outstanding", value: gbp(kpis.outstandingTotal), icon: Banknote },
          { label: "Paid YTD", value: gbp(kpis.paidYTD), icon: Banknote },
        ].map((k) => (
          <Card key={k.label} className="p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">{k.label}</div>
              <k.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="text-lg font-semibold tabular-nums mt-1">{k.value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-medium">Invoices &amp; payment applications</h3>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="certified">Certified</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Dialog open={newOpen} onOpenChange={setNewOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-4 h-4 mr-1" /> New invoice</Button>
            </DialogTrigger>
            <NewInvoiceDialog orgId={orgId} onDone={() => setNewOpen(false)} />
          </Dialog>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Certified</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-8">No invoices</TableCell></TableRow>
              )}
              {filtered.map((i) => {
                const p: any = projectMap[i.project_id];
                const overdue = i.status === "certified" && i.due_date && new Date(i.due_date) < new Date();
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.invoice_number}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {i.doc_type === "payment_application" ? "Payment App" : "Invoice"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {p ? (<><div>{p.project_code || "—"}</div><div className="text-muted-foreground">{p.site_location}</div></>) : "—"}
                    </TableCell>
                    <TableCell>{i.issue_date ?? "—"}</TableCell>
                    <TableCell className={overdue ? "text-destructive font-medium" : ""}>{i.due_date ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{gbp(i.net_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{gbp(i.gross_amount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{i.certified_amount != null ? gbp(i.certified_amount) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{gbp(outstanding(i))}</TableCell>
                    <TableCell>
                      <span className={`inline-block rounded px-2 py-0.5 text-xs capitalize ${STATUS_TONE[i.status]}`}>
                        {i.status}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 justify-end">
                        <InvoiceActions invoice={i} project={projectMap[i.project_id]} />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => confirm("Delete invoice?") && del.mutate(i.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function InvoiceActions({ invoice, project }: { invoice: Invoice; project?: any }) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["revenue-invoices"] });
    qc.invalidateQueries({ queryKey: ["revenue-milestones"] });
    qc.invalidateQueries({ queryKey: ["revenue-rollup"] });
  };
  const setStatus = useMutation({
    mutationFn: async (status: Invoice["status"]) => {
      const { error } = await supabase.from("revenue_invoices").update({ status }).eq("id", invoice.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message),
  });
  const certify = useMutation({
    mutationFn: async ({ amount, date }: { amount: number; date: string }) => {
      const { error } = await supabase.rpc("certify_invoice", {
        _id: invoice.id, _certified_amount: amount, _certified_date: date,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e.message),
  });
  const pay = useMutation({
    mutationFn: async ({ amount, date }: { amount: number; date: string }) => {
      const { error } = await supabase.rpc("mark_invoice_paid", {
        _id: invoice.id, _paid_amount: amount, _paid_date: date,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("Marked as paid"); },
    onError: (e: any) => toast.error(e.message),
  });
  const reject = useMutation({
    mutationFn: async (reason: string) => {
      const { error } = await supabase.rpc("reject_invoice", { _id: invoice.id, _reason: reason });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const [certifyOpen, setCertifyOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [certAmt, setCertAmt] = useState(invoice.net_amount);
  const [certDate, setCertDate] = useState(new Date().toISOString().slice(0, 10));
  const [payAmt, setPayAmt] = useState(Number(invoice.certified_amount ?? invoice.net_amount));
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));

  return (
    <>
      <Button size="sm" variant="ghost" className="h-7" title="Send by email" onClick={() => setSendOpen(true)}>
        <Mail className="w-4 h-4" />
      </Button>
      <SendInvoiceDialog open={sendOpen} onOpenChange={setSendOpen} invoice={invoice} project={project} />
      <XeroInvoiceButton invoice={invoice} onDone={invalidate} />
      {invoice.status === "draft" && (
        <Button size="sm" variant="outline" className="h-7" onClick={() => setStatus.mutate("submitted")}>Submit</Button>
      )}
      {invoice.status === "submitted" && (
        <>
          <Dialog open={certifyOpen} onOpenChange={setCertifyOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-7">Certify</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Certify {invoice.invoice_number}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Certified amount (£)"><Input type="number" value={certAmt} onChange={(e) => setCertAmt(Number(e.target.value))} /></Field>
                <Field label="Certified date"><Input type="date" value={certDate} onChange={(e) => setCertDate(e.target.value)} /></Field>
              </div>
              <DialogFooter>
                <Button onClick={() => { certify.mutate({ amount: certAmt, date: certDate }); setCertifyOpen(false); }}>Certify</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button size="sm" variant="ghost" className="h-7 text-destructive"
            onClick={() => { const r = prompt("Rejection reason?"); if (r) reject.mutate(r); }}>Reject</Button>
        </>
      )}
      {invoice.status === "certified" && (
        <Dialog open={payOpen} onOpenChange={setPayOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-7">Mark paid</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Mark {invoice.invoice_number} paid</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Paid amount (£)"><Input type="number" value={payAmt} onChange={(e) => setPayAmt(Number(e.target.value))} /></Field>
              <Field label="Paid date"><Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></Field>
            </div>
            <DialogFooter>
              <Button onClick={() => { pay.mutate({ amount: payAmt, date: payDate }); setPayOpen(false); }}>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function NewInvoiceDialog({ orgId, onDone }: { orgId: string; onDone: () => void }) {
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState<string>("");
  const [milestoneId, setMilestoneId] = useState<string>("");
  const [form, setForm] = useState({
    doc_type: "invoice" as "invoice" | "payment_application",
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    period_from: "",
    period_to: "",
    po_number: "",
    net_amount: 0,
    vat_rate: 20,
    notes: "",
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["revenue-projects-all", orgId],
    queryFn: async () => {
      const { data, error } = await supabase.from("revenue_projects")
        .select("id, project_code, site_location, stream, contract_value").eq("org_id", orgId);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: milestones = [] } = useQuery({
    queryKey: ["milestones-for-project", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase.from("revenue_milestones")
        .select("id, milestone_status, invoice_pct, forecast_revenue")
        .eq("project_id", projectId).order("invoice_month");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Pick a project");
      const { error } = await supabase.from("revenue_invoices").insert({
        org_id: orgId,
        project_id: projectId,
        milestone_id: milestoneId || null,
        doc_type: form.doc_type,
        issue_date: form.issue_date || null,
        due_date: form.due_date || null,
        period_from: form.period_from || null,
        period_to: form.period_to || null,
        po_number: form.po_number || null,
        net_amount: Number(form.net_amount) || 0,
        vat_rate: Number(form.vat_rate) || 0,
        notes: form.notes || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["revenue-invoices"] });
      toast.success("Invoice created");
      onDone();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>New invoice / payment application</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={form.doc_type} onValueChange={(v: any) => setForm({ ...form, doc_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="invoice">Invoice</SelectItem>
              <SelectItem value="payment_application">Payment application</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="PO number"><Input value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} /></Field>
        <Field label="Project" className="col-span-2">
          <Select value={projectId} onValueChange={(v) => { setProjectId(v); setMilestoneId(""); }}>
            <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
            <SelectContent>
              {(projects as any[]).map((p) => (
                <SelectItem key={p.id} value={p.id}>[{p.stream}] {p.project_code || "—"} — {p.site_location}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {projectId && (milestones as any[]).length > 0 && (
          <Field label="Milestone (optional)" className="col-span-2">
            <Select value={milestoneId} onValueChange={(v) => {
              setMilestoneId(v);
              const m: any = (milestones as any[]).find((x) => x.id === v);
              if (m) setForm((f) => ({ ...f, net_amount: Number(m.forecast_revenue ?? 0) }));
            }}>
              <SelectTrigger><SelectValue placeholder="Link to milestone" /></SelectTrigger>
              <SelectContent>
                {(milestones as any[]).map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.milestone_status} · {gbp(m.forecast_revenue)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field label="Issue date"><Input type="date" value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></Field>
        <Field label="Due date"><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
        {form.doc_type === "payment_application" && (
          <>
            <Field label="Period from"><Input type="date" value={form.period_from} onChange={(e) => setForm({ ...form, period_from: e.target.value })} /></Field>
            <Field label="Period to"><Input type="date" value={form.period_to} onChange={(e) => setForm({ ...form, period_to: e.target.value })} /></Field>
          </>
        )}
        <Field label="Net amount (£)"><Input type="number" value={form.net_amount} onChange={(e) => setForm({ ...form, net_amount: Number(e.target.value) })} /></Field>
        <Field label="VAT %"><Input type="number" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: Number(e.target.value) })} /></Field>
        <Field label="Notes" className="col-span-2"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
      <DialogFooter>
        <Button onClick={() => create.mutate()} disabled={create.isPending || !projectId}>Create</Button>
      </DialogFooter>
    </DialogContent>
  );
}
