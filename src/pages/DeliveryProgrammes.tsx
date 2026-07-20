import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Layers, Briefcase, FileText, ChevronRight, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { InlineEdit } from "@/components/InlineEdit";

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

type WpRow = {
  id: string;
  programme_id: string;
  name: string | null;
  code: string | null;
  status: string | null;
  start_date: string | null;
  target_end_date: string | null;
};

export default function DeliveryProgrammes() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newWpFor, setNewWpFor] = useState<string | null>(null);

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

  // Clients are surfaced from organisations (single source of truth for tenants).
  const { data: orgs = [] } = useQuery({
    queryKey: ["delivery-client-orgs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organisations").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Existing account labels for programmes already created (fallback display).
  const { data: accounts = [] } = useQuery({
    queryKey: ["delivery-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("id,name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allWps = [] } = useQuery({
    queryKey: ["delivery-programme-wps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_packages")
        .select("id,programme_id,name,code,status,start_date,target_end_date")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as WpRow[];
    },
  });

  const wpsByProgramme: Record<string, WpRow[]> = {};
  for (const w of allWps) {
    (wpsByProgramme[w.programme_id] ??= []).push(w);
  }

  const updateProgramme = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, any> }) => {
      const { error } = await supabase.from("programmes").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["delivery-programmes"] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const createWp = useMutation({
    mutationFn: async (v: { programme_id: string; name: string; code: string; budget: string; start: string; end: string }) => {
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase.from("work_packages").insert({
        programme_id: v.programme_id, name: v.name, code: v.code, status: "planning",
        budget_amount: v.budget ? Number(v.budget) : null,
        start_date: v.start || null, target_end_date: v.end || null,
        pm_user_id: user.id, created_by: user.id,
      }).select("id").single();
      if (error) throw error;
      return data as { id: string };
    },
    onSuccess: (data) => {
      toast.success("Work package created");
      setNewWpFor(null);
      qc.invalidateQueries({ queryKey: ["delivery-programme-wps"] });
      if (data?.id) navigate(`/wp/${data.id}`);
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const create = useMutation({
    mutationFn: async (v: { name: string; code: string; org_id: string; org_name: string; target_site_count: number | null }) => {
      // Find-or-create client bound to the chosen organisation.
      let clientId: string | null = null;
      const { data: existingClient } = await supabase
        .from("clients")
        .select("id")
        .eq("tenant_org_id", v.org_id)
        .maybeSingle();
      if (existingClient) {
        clientId = existingClient.id;
      } else {
        const { data: newClient, error: clientErr } = await supabase
          .from("clients")
          .insert({ name: v.org_name, tenant_org_id: v.org_id })
          .select("id").single();
        if (clientErr) throw clientErr;
        clientId = newClient.id;
      }

      // Find-or-create default account for the client.
      let accountId: string | null = null;
      const { data: existingAccount } = await supabase
        .from("accounts")
        .select("id")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (existingAccount) {
        accountId = existingAccount.id;
      } else {
        const { data: newAccount, error: accountErr } = await supabase
          .from("accounts")
          .insert({ name: v.org_name, client_id: clientId })
          .select("id").single();
        if (accountErr) throw accountErr;
        accountId = newAccount.id;
      }

      const { data, error } = await supabase.from("programmes").insert({
        name: v.name, code: v.code || null, account_id: accountId,
        target_site_count: v.target_site_count, status: "planning",
      }).select("id").single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => { toast.success("Programme created"); setOpen(false); qc.invalidateQueries({ queryKey: ["delivery-programmes"] }); },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  const accountName = (id: string) => (accounts as any[]).find((a) => a.id === id)?.name ?? "—";

  const handleProgrammeRowClick = (p: Programme) => {
    const wps = wpsByProgramme[p.id] ?? [];
    if (wps.length === 1) {
      navigate(`/wp/${wps[0].id}`);
      return;
    }
    setExpanded((prev) => ({ ...prev, [p.id]: !prev[p.id] }));
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-foreground/70 mb-1">
            <span className="h-1 w-1 rounded-full bg-accent" /> Delivery
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight flex items-center gap-2"><Layers className="h-6 w-6 text-primary" /> Programmes</h1>
          <p className="text-sm text-muted-foreground mt-1">Client programmes group work packages. Each work package delivers 1–100 sites.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/delivery/proposals">
            <Button variant="outline"><FileText className="h-4 w-4 mr-1" /> Proposals</Button>
          </Link>
          <NewProgrammeDialog open={open} setOpen={setOpen} orgs={orgs as any} onCreate={(v) => create.mutate(v)} pending={create.isPending} />
        </div>
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
        <div className="rounded-lg border border-border/60 bg-card shadow-panel overflow-hidden divide-y divide-border/50">
          {programmes.map((p) => {
            const wps = wpsByProgramme[p.id] ?? [];
            const isOpen = !!expanded[p.id];
            const hasMulti = wps.length !== 1;
            return (
              <div key={p.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => handleProgrammeRowClick(p)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleProgrammeRowClick(p); } }}
                  className="flex items-stretch gap-3 p-4 hover:bg-muted/40 transition-colors relative cursor-pointer group"
                >
                  <div className="w-1 rounded-full bg-primary/60 group-hover:bg-accent transition-colors" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <InlineEdit
                          value={p.name}
                          onSave={(v) => updateProgramme.mutate({ id: p.id, patch: { name: v } })}
                          displayClassName="font-display font-semibold tracking-tight truncate"
                          inputClassName="h-7 min-w-64 font-display font-semibold"
                          placeholder="Programme name"
                          pending={updateProgramme.isPending}
                        />
                      </div>
                      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <InlineEdit
                          value={p.code}
                          onSave={(v) => updateProgramme.mutate({ id: p.id, patch: { code: v } })}
                          displayClassName="text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-muted/60 rounded px-1.5 py-0.5"
                          inputClassName="h-6 w-24 text-xs"
                          placeholder="add code"
                          pending={updateProgramme.isPending}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {p.status}
                      </span>
                      <span>{accountName(p.account_id)}</span>
                      <span>·</span>
                      <span>target</span>
                      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        <InlineEdit
                          type="number"
                          value={p.target_site_count}
                          onSave={(v) => updateProgramme.mutate({ id: p.id, patch: { target_site_count: v } })}
                          placeholder="—"
                          inputClassName="h-6 w-16 text-xs"
                          pending={updateProgramme.isPending}
                        />
                      </div>
                      <span>sites</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-1 font-display text-lg font-semibold tabular-nums">
                        <Briefcase className="h-4 w-4 text-accent" /> {wps.length}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">work packages</div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); setNewWpFor(p.id); }}
                      title="Add work package"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    {hasMulti ? (
                      <ChevronRight className={"h-4 w-4 text-muted-foreground transition-transform " + (isOpen ? "rotate-90" : "")} />
                    ) : wps.length === 1 ? (
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    ) : null}
                  </div>
                </div>
                {isOpen && hasMulti && (
                  <div className="border-t border-border/40 bg-muted/20 px-4 py-2 space-y-1">
                    {wps.length === 0 ? (
                      <div className="flex items-center justify-between py-2 text-sm text-muted-foreground">
                        <span>No work packages yet.</span>
                        <Button size="sm" variant="outline" onClick={() => setNewWpFor(p.id)}>
                          <Plus className="h-3.5 w-3.5 mr-1" /> New work package
                        </Button>
                      </div>
                    ) : (
                      wps.map((w) => (
                        <Link
                          key={w.id}
                          to={`/wp/${w.id}`}
                          className="flex items-center gap-3 rounded px-2 py-1.5 hover:bg-muted/60 transition-colors"
                        >
                          <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium truncate">{w.name || "Untitled"}</span>
                          {w.code && <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{w.code}</span>}
                          <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">{w.status ?? "—"}</span>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </Link>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <NewWpDialog
        programmeId={newWpFor}
        onClose={() => setNewWpFor(null)}
        onCreate={(v) => createWp.mutate(v)}
        pending={createWp.isPending}
      />
    </div>
  );
}

function NewWpDialog({
  programmeId, onClose, onCreate, pending,
}: {
  programmeId: string | null;
  onClose: () => void;
  onCreate: (v: { programme_id: string; name: string; code: string; budget: string; start: string; end: string }) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [budget, setBudget] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const open = !!programmeId;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setName(""); setCode(""); setBudget(""); setStart(""); setEnd(""); } }}>
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
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!name.trim() || !code.trim() || pending || !programmeId}
            onClick={() => programmeId && onCreate({ programme_id: programmeId, name: name.trim(), code: code.trim(), budget, start, end })}
          >
            {pending ? "Creating…" : "Create & open"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
        <Button><Plus className="h-4 w-4 mr-1" /> New programme</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New programme</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Client account</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger>
                <SelectValue placeholder={orgs?.length ? "Pick a client organisation" : "No organisations available"} />
              </SelectTrigger>
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