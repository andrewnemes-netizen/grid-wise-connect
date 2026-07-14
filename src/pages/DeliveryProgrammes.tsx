import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Layers, Briefcase } from "lucide-react";
import { toast } from "sonner";

type Programme = {
  id: string;
  name: string;
  code: string | null;
  status: string;
  account_id: string;
  target_site_count: number | null;
  start_date: string | null;
  end_date: string | null;
};

export default function DeliveryProgrammes() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: programmes = [], isLoading } = useQuery({
    queryKey: ["delivery-programmes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programmes")
        .select("id,name,code,status,account_id,target_site_count,start_date,end_date")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Programme[];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["delivery-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: wpCounts = {} } = useQuery({
    queryKey: ["delivery-programme-wp-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_packages").select("id,programme_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { counts[r.programme_id] = (counts[r.programme_id] || 0) + 1; });
      return counts;
    },
  });

  const create = useMutation({
    mutationFn: async (v: { name: string; code: string; account_id: string; target_site_count: number | null }) => {
      const { data, error } = await supabase.from("programmes").insert({
        name: v.name, code: v.code || null, account_id: v.account_id,
        target_site_count: v.target_site_count, status: "planning",
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("Programme created"); setOpen(false); qc.invalidateQueries({ queryKey: ["delivery-programmes"] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const accountName = (id: string) => (accounts as any[]).find((a) => a.id === id)?.name ?? "—";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Layers className="h-6 w-6" /> Delivery Programmes</h1>
          <p className="text-sm text-muted-foreground">Client programmes group work packages. Each work package delivers 1–100 sites.</p>
        </div>
        <NewProgrammeDialog open={open} setOpen={setOpen} accounts={accounts as any} onCreate={(v) => create.mutate(v)} pending={create.isPending} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading programmes…</p>
      ) : programmes.length === 0 ? (
        <Card className="p-12 text-center">
          <Layers className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium mb-1">No programmes yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create a programme for a client to start grouping work packages.</p>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> New programme</Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {programmes.map((p) => (
            <Link key={p.id} to={`/delivery/programme/${p.id}`}>
              <Card className="p-4 hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium truncate">{p.name}</h3>
                      {p.code && <span className="text-xs text-muted-foreground">{p.code}</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                      <Badge variant="outline">{p.status}</Badge>
                      <span>{accountName(p.account_id)}</span>
                      {p.target_site_count != null && <span>· target {p.target_site_count} sites</span>}
                      {p.start_date && <span>· {new Date(p.start_date).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-sm"><Briefcase className="h-4 w-4" /> {wpCounts[p.id] ?? 0}</div>
                    <div className="text-xs text-muted-foreground">work packages</div>
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

function NewProgrammeDialog({ open, setOpen, accounts, onCreate, pending }: any) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [accountId, setAccountId] = useState("");
  const [target, setTarget] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-1" /> New programme</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New programme</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Client account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger><SelectValue placeholder="Pick a client" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Programme name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Connected Kerb Programme" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CK-2026" /></div>
            <div><Label>Target sites</Label><Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!name.trim() || !accountId || pending}
            onClick={() => onCreate({ name: name.trim(), code, account_id: accountId, target_site_count: target ? Number(target) : null })}>
            {pending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}