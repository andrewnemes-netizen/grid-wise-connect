import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Briefcase, Building2, Layers, Search, ArrowRight } from "lucide-react";

type Client = { id: string; name: string; tenant_org_id: string | null };
type Account = { id: string; client_id: string | null };
type Programme = { id: string; account_id: string | null; status: string | null };
type Wp = { id: string; programme_id: string; status: string | null };

export default function ClientsDashboard() {
  const [q, setQ] = useState("");

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients-dashboard-clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id,name,tenant_org_id").order("name");
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["clients-dashboard-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("accounts").select("id,client_id");
      if (error) throw error;
      return (data ?? []) as Account[];
    },
  });
  const { data: programmes = [] } = useQuery({
    queryKey: ["clients-dashboard-programmes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("programmes").select("id,account_id,status");
      if (error) throw error;
      return (data ?? []) as Programme[];
    },
  });
  const { data: wps = [] } = useQuery({
    queryKey: ["clients-dashboard-wps"],
    queryFn: async () => {
      const { data, error } = await supabase.from("work_packages").select("id,programme_id,status");
      if (error) throw error;
      return (data ?? []) as Wp[];
    },
  });

  const rows = useMemo(() => {
    const accountToClient = new Map(accounts.map((a) => [a.id, a.client_id]));
    const programmesByClient = new Map<string, Programme[]>();
    const wpsByProgramme = new Map<string, Wp[]>();
    for (const w of wps) {
      const arr = wpsByProgramme.get(w.programme_id) ?? [];
      arr.push(w); wpsByProgramme.set(w.programme_id, arr);
    }
    let unassigned: Programme[] = [];
    for (const p of programmes) {
      const clientId = p.account_id ? accountToClient.get(p.account_id) ?? null : null;
      if (!clientId) { unassigned.push(p); continue; }
      const arr = programmesByClient.get(clientId) ?? [];
      arr.push(p); programmesByClient.set(clientId, arr);
    }
    const clientRows = clients.map((c) => {
      const ps = programmesByClient.get(c.id) ?? [];
      const wpCount = ps.reduce((n, p) => n + (wpsByProgramme.get(p.id)?.length ?? 0), 0);
      const activeWps = ps.reduce((n, p) => n + (wpsByProgramme.get(p.id)?.filter((w) => w.status !== "closed" && w.status !== "cancelled").length ?? 0), 0);
      return { id: c.id, name: c.name, programmeCount: ps.length, wpCount, activeWps };
    });
    return { clientRows, unassignedCount: unassigned.length };
  }, [clients, accounts, programmes, wps]);

  const filtered = rows.clientRows.filter((c) => !q.trim() || c.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-accent-foreground/70 mb-1">
          <span className="h-1 w-1 rounded-full bg-accent" /> Delivery
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Building2 className="h-6 w-6 text-primary" /> Programmes by client
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Select a client to view their programmes and work packages.</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search clients…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading clients…</p>
      ) : filtered.length === 0 && rows.unassignedCount === 0 ? (
        <Card className="p-12 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium mb-1">No clients yet</h3>
          <p className="text-sm text-muted-foreground">Create a programme for a client from the all-programmes view.</p>
          <Link to="/delivery" className="text-sm text-primary underline mt-3 inline-block">Go to all programmes →</Link>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((c) => (
            <Link
              key={c.id}
              to={`/programmes/client/${c.id}`}
              className="group block w-full"
            >
              <Card className="p-5 hover:border-primary/60 hover:shadow-panel transition-all cursor-pointer flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
                <div className="flex items-start justify-between gap-2 md:flex-1 md:min-w-0">
                  <div className="min-w-0">
                    <div className="font-display font-semibold text-lg tracking-tight truncate">{c.name}</div>
                    <Badge variant="outline" className="mt-1 text-[10px]">Client</Badge>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0 md:hidden" />
                </div>
                <div className="grid grid-cols-3 gap-3 md:gap-4 md:shrink-0">
                  <Stat icon={<Layers className="h-4 w-4" />} label="Programmes" value={c.programmeCount} />
                  <Stat icon={<Briefcase className="h-4 w-4" />} label="Work packages" value={c.wpCount} />
                  <Stat icon={<Briefcase className="h-4 w-4 text-accent" />} label="Active WPs" value={c.activeWps} />
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 hidden md:block" />
              </Card>
            </Link>
          ))}
          {rows.unassignedCount > 0 && (
            <Link to="/delivery" className="group block w-full">
              <Card className="p-5 hover:border-primary/60 hover:shadow-panel transition-all cursor-pointer flex flex-col md:flex-row md:items-center gap-4 md:gap-6 border-dashed">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-display font-semibold text-lg tracking-tight truncate">Unassigned</div>
                    <Badge variant="outline" className="mt-1 text-[10px]">No client</Badge>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground md:flex-1">
                  {rows.unassignedCount} programme{rows.unassignedCount === 1 ? "" : "s"} not linked to a client.
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </Card>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/60 bg-muted/20 px-4 py-3 md:min-w-[150px]">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground leading-tight whitespace-nowrap">
        <span className="shrink-0">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="font-display text-2xl font-semibold tabular-nums mt-1.5">{value}</div>
    </div>
  );
}