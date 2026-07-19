import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Layers, Briefcase } from "lucide-react";
import { toast } from "sonner";

type Programme = {
  id: string; name: string; code: string | null; status: string;
  account_id: string; target_site_count: number | null;
  start_date: string | null; end_date: string | null;
};

export default function ProgrammesList() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: programmes = [], isLoading } = useQuery({
    queryKey: ["gw-programmes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("programmes")
        .select("id,name,code,status,account_id,target_site_count,start_date,end_date")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Programme[];
    },
  });

  const { data: orgs = [] } = useQuery({
    queryKey: ["gw-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organisations").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["gw-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: wpCounts = {} } = useQuery({
    queryKey: ["gw-programme-wp-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_packages").select("id,programme_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { counts[r.programme_id] = (counts[r.programme_id] || 0) + 1; });
      return counts;
    },
  });

  const create = useMutation({
    mutationFn: async (v: { name: string; code: string; org_id: string; org_name: string; target_site_count: number | null }) => {
      let clientId: string | null = null;
      const { data: existingClient } = await supabase.from("clients").select("id").eq("tenant_org_id", v.org_id).maybeSingle();
      if (existingClient) clientId = existingClient.id;
      else {
        const { data: newClient, error } = await supabase.from("clients").insert({ name: v.org_name, tenant_org_id: v.org_id }).select("id").single();
        if (error) throw error; clientId = newClient.id;
      }
      let accountId: string | null = null;
      const { data: existingAccount } = await supabase.from("accounts").select("id").eq("client_id", clientId).order("created_at", { ascending: true }).limit(1).maybeSingle();
      if (existingAccount) accountId = existingAccount.id;
      else {
        const { data: newAccount, error } = await supabase.from("accounts").insert({ name: v.org_name, client_id: clientId }).select("id").single();
        if (error) throw error; accountId = newAccount.id;
      }
      const { data, error } = await supabase.from("programmes").insert({
        name: v.name, code: v.code || null, account_id: accountId,
        target_site_count: v.target_site_count, status: "planning",
      }).select("id").single();
      if (error) throw error; return data;
    },
    onSuccess: () => { toast.success("Programme created"); setOpen(false); qc.invalidateQueries({ queryKey: ["gw-programmes"] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const accountName = (id: string) => (accounts as any[]).find((a) => a.id === id)?.name ?? "—";

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between border-b border-border/60 pb-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-1">Gridwise OS · Delivery</div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Layers className="h-5 w-5 text-primary" /> Programmes</h1>
          <p className="text-sm text-muted-foreground mt-1">Programmes group work packages. Each work package delivers 1–100 sites.</p>
        </div>
        <NewProgrammeDialog open={open} setOpen={setOpen} orgs={orgs as any} onCreate={(v) => create.mutate(v)} pending={create.isPending} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading programmes…</p>
      ) : programmes.length === 0 ? (
        <Card className="p-10 text-center">
          <Layers className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium mb-1">No programmes yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create a programme for a client to start grouping work packages.</p>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> New programme</Button>
        </Card>
      ) : (
        <div className="rounded-md border divide-y">
          {programmes.map((p) => (
            <Link key={p.id} to={`/programme/${p.id}`} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/40 transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium truncate">{p.name}</h3>
                  {p.code && <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-muted rounded px-1.5 py-0.5">{p.code}</span>}
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground border rounded-full px-2 py-0.5">{p.status}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {accountName(p.account_id)}
                  {p.target_site_count != null && <> · target {p.target_site_count} sites</>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="flex items-center justify-end gap-1 text-lg font-semibold tabular-nums"><Briefcase className="h-4 w-4 text-muted-foreground" /> {wpCounts[p.id] ?? 0}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">work packages</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function NewProgrammeDialog({ open, setOpen, orgs, onCreate, pending }: any) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [orgId, setOrgId] = useState("");
  const [target, setTarget] = useState("");
  const chosenOrg = (orgs ?? []).find((o: any) => o.id === orgId);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4 mr-1" /> New programme</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New programme</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Client account</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger><SelectValue placeholder={orgs?.length ? "Pick a client organisation" : "No organisations available"} /></SelectTrigger>
              <SelectContent>
                {orgs.map((o: any) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
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
          <Button disabled={!name.trim() || !orgId || pending}
            onClick={() => onCreate({ name: name.trim(), code, org_id: orgId, org_name: chosenOrg?.name ?? "", target_site_count: target ? Number(target) : null })}>
            {pending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}