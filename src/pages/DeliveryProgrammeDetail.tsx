import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Briefcase } from "lucide-react";
import { toast } from "sonner";
import { InlineEdit } from "@/components/InlineEdit";
import { TaskBoard } from "@/components/delivery/board/TaskBoard";
import { WP_LIFECYCLE_OPTIONS } from "@/lib/board/types";
import { useNavigate } from "react-router-dom";
import { DeliverySplitLayout } from "@/components/delivery/DeliverySplitLayout";
import { ProgrammeMapPane } from "@/components/delivery/ProgrammeMapPane";

const WP_STATUSES = [
  { value: "planning", label: "planning" },
  { value: "active", label: "active" },
  { value: "on_hold", label: "on hold" },
  { value: "complete", label: "complete" },
  { value: "cancelled", label: "cancelled" },
];

export default function DeliveryProgrammeDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { data: programme } = useQuery({
    queryKey: ["programme", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("programmes").select("*, accounts(name)").eq("id", id!).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  const updateProgramme = useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const { error } = await supabase.from("programmes").update(patch).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["programme", id] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const updateWp = useMutation({
    mutationFn: async ({ wpId, patch }: { wpId: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from("work_packages").update(patch).eq("id", wpId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["programme-wps", id] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const { data: wps = [] } = useQuery({
    queryKey: ["programme-wps", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_packages")
        .select("id,name,code,status,budget_amount,start_date,target_end_date")
        .eq("programme_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: siteCounts = {} } = useQuery({
    queryKey: ["programme-wp-site-counts", id, wps.map((w: any) => w.id).join(",")],
    queryFn: async () => {
      if (wps.length === 0) return {};
      const { data, error } = await supabase.from("wp_sites")
        .select("work_package_id")
        .in("work_package_id", wps.map((w: any) => w.id));
      if (error) throw error;
      const c: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { c[r.work_package_id] = (c[r.work_package_id] || 0) + 1; });
      return c;
    },
    enabled: wps.length > 0,
  });

  const create = useMutation({
    mutationFn: async (v: { name: string; code: string; budget: string; start: string; end: string }) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase.from("work_packages").insert({
        programme_id: id!, name: v.name, code: v.code, status: "planning",
        budget_amount: v.budget ? Number(v.budget) : null,
        start_date: v.start || null, target_end_date: v.end || null,
        pm_user_id: user.id, created_by: user.id,
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("Work package created"); setOpen(false); qc.invalidateQueries({ queryKey: ["programme-wps", id] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <DeliverySplitLayout
      left={
        <ProgrammeMapPane
          title={programme?.name ?? "Programme"}
          subtitle={[programme?.accounts?.name, programme?.code].filter(Boolean).join(" · ")}
          items={(wps as any[]).map((w) => ({
            id: w.id,
            label: w.name || "Work package",
            sub: [w.code, siteCounts[w.id] ? `${siteCounts[w.id]} sites` : null].filter(Boolean).join(" · "),
            badge: w.status,
          }))}
          emptyLabel="No work packages yet"
          onOpenMap={() => navigate("/")}
        />
      }
      right={
        <div className="p-6 max-w-6xl mx-auto space-y-6">
          <div>
        <Link to="/delivery" className="text-sm text-muted-foreground flex items-center gap-1 mb-2 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Programmes
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <InlineEdit
              value={programme?.name}
              onSave={(v) => updateProgramme.mutate({ name: v })}
              placeholder="Programme name"
              displayClassName="font-display text-2xl font-semibold tracking-tight"
              inputClassName="font-display text-2xl font-semibold h-10 min-w-64"
              pending={updateProgramme.isPending}
            />
            <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap mt-1">
              <span>{programme?.accounts?.name}</span>
              <span>·</span>
              <InlineEdit
                value={programme?.code}
                onSave={(v) => updateProgramme.mutate({ code: v })}
                placeholder="add code"
                inputClassName="h-7 w-32"
                pending={updateProgramme.isPending}
              />
              <span>·</span>
              <span>target</span>
              <InlineEdit
                type="number"
                value={programme?.target_site_count}
                onSave={(v) => updateProgramme.mutate({ target_site_count: v })}
                placeholder="—"
                inputClassName="h-7 w-20"
                pending={updateProgramme.isPending}
              />
              <span>sites</span>
            </div>
          </div>
          <NewWpDialog open={open} setOpen={setOpen} onCreate={(v) => create.mutate(v)} pending={create.isPending} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-border/60" />
        <h2 className="font-display text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Work packages</h2>
        <div className="h-px flex-1 bg-border/60" />
      </div>
      {wps.length === 0 ? (
        <Card className="p-10 text-center">
          <Briefcase className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">No work packages yet. A work package delivers a batch of sites for this programme.</p>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> New work package</Button>
        </Card>
      ) : (
        <>
          <TaskBoard
            projectId={id!}
            tasks={wps as any[]}
            milestones={[]}
            statusOptions={WP_LIFECYCLE_OPTIONS}
            scope={{ table: "work_packages", scopeCol: "programme_id", scopeId: id!, builtinSet: "work_packages" }}
            invalidateKeys={[["programme-wps", id!]]}
            addRowPlaceholder="+ Add work package"
          />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Tip: click a work package below to open its full delivery board.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {(wps as any[]).map((w) => (
              <Button key={w.id} size="sm" variant="outline" onClick={() => navigate(`/delivery/wp/${w.id}`)}>
                Open {w.code || w.name} →
              </Button>
            ))}
          </div>
        </>
      )}
        </div>
      }
    />
  );
}

function NewWpDialog({ open, setOpen, onCreate, pending }: any) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [budget, setBudget] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1" /> New work package</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New work package</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="West Yorkshire WP-04" /></div>
          <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="WY-04" /></div>
          <div><Label>Approved value (£)</Label><Input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Start</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label>Target end</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!name.trim() || !code.trim() || pending} onClick={() => onCreate({ name: name.trim(), code: code.trim(), budget, start, end })}>
            {pending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}