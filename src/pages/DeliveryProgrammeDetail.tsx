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

export default function DeliveryProgrammeDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: programme } = useQuery({
    queryKey: ["programme", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("programmes").select("*, accounts(name)").eq("id", id!).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
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
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <Link to="/delivery" className="text-sm text-muted-foreground flex items-center gap-1 mb-2 hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Programmes
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{programme?.name ?? "Programme"}</h1>
            <p className="text-sm text-muted-foreground">
              {programme?.accounts?.name} {programme?.code ? `· ${programme.code}` : ""}
              {programme?.target_site_count ? ` · target ${programme.target_site_count} sites` : ""}
            </p>
          </div>
          <NewWpDialog open={open} setOpen={setOpen} onCreate={(v) => create.mutate(v)} pending={create.isPending} />
        </div>
      </div>

      <h2 className="text-lg font-medium">Work packages</h2>
      {wps.length === 0 ? (
        <Card className="p-10 text-center">
          <Briefcase className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">No work packages yet. A work package delivers a batch of sites for this programme.</p>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> New work package</Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {wps.map((w: any) => (
            <Link key={w.id} to={`/delivery/wp/${w.id}`}>
              <Card className="p-4 hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium truncate">{w.name}</h3>
                      <span className="text-xs text-muted-foreground">{w.code}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                      <Badge variant="outline">{w.status}</Badge>
                      <span>{siteCounts[w.id] ?? 0} sites</span>
                      {w.budget_amount && <span>· £{Number(w.budget_amount).toLocaleString()}</span>}
                      {w.target_end_date && <span>· due {new Date(w.target_end_date).toLocaleDateString()}</span>}
                    </div>
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