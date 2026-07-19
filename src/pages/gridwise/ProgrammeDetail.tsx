import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, Briefcase } from "lucide-react";
import { toast } from "sonner";

export default function ProgrammeDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const { data: programme } = useQuery({
    queryKey: ["gw-programme", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("programmes").select("*, accounts(name)").eq("id", id!).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  const { data: wps = [] } = useQuery({
    queryKey: ["gw-programme-wps", id],
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
    queryKey: ["gw-programme-wp-sites", id, (wps as any[]).map((w) => w.id).join(",")],
    queryFn: async () => {
      if (wps.length === 0) return {};
      const { data, error } = await supabase.from("wp_sites").select("work_package_id").in("work_package_id", (wps as any[]).map((w) => w.id));
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
    onSuccess: (data: any) => {
      toast.success("Work package created");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["gw-programme-wps", id] });
      if (data?.id) navigate(`/wp/${data.id}/overview`);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <Link to="/programmes" className="text-xs text-muted-foreground flex items-center gap-1 mb-2 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Programmes
        </Link>
        <div className="flex items-start justify-between gap-4 border-b border-border/60 pb-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{programme?.name ?? "Loading…"}</h1>
            <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              <span>{programme?.accounts?.name}</span>
              {programme?.code && <><span>·</span><span className="font-mono text-xs">{programme.code}</span></>}
              {programme?.target_site_count != null && <><span>·</span><span>target {programme.target_site_count} sites</span></>}
            </div>
          </div>
          <NewWpDialog open={open} setOpen={setOpen} onCreate={(v) => create.mutate(v)} pending={create.isPending} />
        </div>
      </div>

      <div>
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground mb-2">Work packages</h2>
        {wps.length === 0 ? (
          <Card className="p-10 text-center">
            <Briefcase className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">No work packages yet.</p>
            <Button onClick={() => setOpen(true)} size="sm"><Plus className="h-4 w-4 mr-1" /> New work package</Button>
          </Card>
        ) : (
          <div className="rounded-md border divide-y">
            {(wps as any[]).map((w) => (
              <Link key={w.id} to={`/wp/${w.id}/overview`} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{w.name || "Work package"}</span>
                    {w.code && <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-muted rounded px-1.5 py-0.5">{w.code}</span>}
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground border rounded-full px-2 py-0.5">{w.status}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {siteCounts[w.id] ? `${siteCounts[w.id]} sites` : "no sites"}
                    {w.budget_amount != null && <> · £{Number(w.budget_amount).toLocaleString()}</>}
                    {w.target_end_date && <> · target {new Date(w.target_end_date).toLocaleDateString()}</>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
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
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New work package</Button>
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