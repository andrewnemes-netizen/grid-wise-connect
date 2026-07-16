import { useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, Circle, MinusCircle, Search, ShieldCheck, Filter } from "lucide-react";
import { SitePreconGatesDialog } from "@/components/wp/SitePreconGatesDialog";

type GateKey = "poc" | "commercial" | "design_ev" | "design_icp" | "rams" | "final_review";
type GateState = "open" | "passed" | "waived";

const GATES: { key: GateKey; label: string; short: string }[] = [
  { key: "poc",          label: "POC",          short: "POC" },
  { key: "commercial",   label: "Commercial",   short: "COM" },
  { key: "design_ev",    label: "EV Design",    short: "EV" },
  { key: "design_icp",   label: "ICP Design",   short: "ICP" },
  { key: "rams",         label: "RAMS",         short: "RAMS" },
  { key: "final_review", label: "Final Review", short: "REL" },
];

function gateIcon(state: GateState) {
  if (state === "passed")
    return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Passed" />;
  if (state === "waived")
    return <MinusCircle className="h-4 w-4 text-amber-600" aria-label="Waived" />;
  return <Circle className="h-4 w-4 text-muted-foreground" aria-label="Open" />;
}

function progressPct(gateMap: Record<GateKey, GateState>) {
  const count = GATES.reduce(
    (acc, g) => acc + (gateMap[g.key] === "passed" || gateMap[g.key] === "waived" ? 1 : 0),
    0,
  );
  return Math.round((count / GATES.length) * 100);
}

export default function WpReadinessTab() {
  const { id: wpId } = useParams<{ id: string }>();
  const [search, setSearch] = useState("");
  const [onlyBlocked, setOnlyBlocked] = useState(false);
  const [selected, setSelected] = useState<{ siteId: string; siteName?: string } | null>(null);

  const statusQ = useQuery({
    queryKey: ["wp-site-precon-status", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_wp_site_precon_status")
        .select("*")
        .eq("work_package_id", wpId!)
        .order("sequence", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const gatesQ = useQuery({
    queryKey: ["wp-precon-gates-all", wpId],
    enabled: !!wpId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("site_precon_gates")
        .select("site_id,gate_key,state")
        .eq("work_package_id", wpId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const gateBySite = useMemo(() => {
    const map = new Map<string, Record<GateKey, GateState>>();
    for (const g of gatesQ.data ?? []) {
      const cur = map.get(g.site_id) ?? ({} as Record<GateKey, GateState>);
      cur[g.gate_key as GateKey] = g.state as GateState;
      map.set(g.site_id, cur);
    }
    return map;
  }, [gatesQ.data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (statusQ.data ?? [])
      .map((r) => {
        const gm = gateBySite.get(r.site_id) ?? ({} as Record<GateKey, GateState>);
        const filled = GATES.reduce<Record<GateKey, GateState>>((acc, g) => {
          acc[g.key] = gm[g.key] ?? "open";
          return acc;
        }, {} as any);
        return { ...r, gateMap: filled, pct: progressPct(filled) };
      })
      .filter((r) => {
        if (onlyBlocked && !r.blocker_reason) return false;
        if (!q) return true;
        return (
          (r.site_name ?? "").toLowerCase().includes(q) ||
          (r.postcode ?? "").toLowerCase().includes(q) ||
          (r.local_ref ?? "").toLowerCase().includes(q)
        );
      });
  }, [statusQ.data, gateBySite, search, onlyBlocked]);

  const totals = useMemo(() => {
    const t = { sites: rows.length, ready: 0, blocked: 0, avgPct: 0 };
    for (const r of rows) {
      if (r.gateMap.final_review === "passed") t.ready += 1;
      if (r.blocker_reason) t.blocked += 1;
      t.avgPct += r.pct;
    }
    t.avgPct = rows.length ? Math.round(t.avgPct / rows.length) : 0;
    return t;
  }, [rows]);

  const loading = statusQ.isLoading || gatesQ.isLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Site Readiness</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Live gate matrix — POC, commercial, design, RAMS and final release — across every site in this
            work package. Green = passed automatically or manually, amber = waived, hollow = open.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0">Readiness</Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Sites</div>
          <div className="text-2xl font-semibold tabular-nums">{totals.sites}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Ready to release</div>
          <div className="text-2xl font-semibold tabular-nums text-emerald-600">{totals.ready}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Blocked</div>
          <div className="text-2xl font-semibold tabular-nums text-rose-600">{totals.blocked}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Avg gates passed</div>
          <div className="text-2xl font-semibold tabular-nums">{totals.avgPct}%</div>
        </Card>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search site, postcode, ref"
            className="pl-7 h-9"
          />
        </div>
        <Button
          variant={onlyBlocked ? "default" : "outline"}
          size="sm"
          onClick={() => setOnlyBlocked((v) => !v)}
        >
          <Filter className="h-3.5 w-3.5 mr-1" />
          Blocked only
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>Site</TableHead>
              <TableHead>Stage</TableHead>
              {GATES.map((g) => (
                <TableHead key={g.key} className="text-center text-[11px] uppercase tracking-wide">
                  {g.short}
                </TableHead>
              ))}
              <TableHead className="text-right">Progress</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5 + GATES.length} className="text-center text-sm text-muted-foreground py-8">
                  Loading readiness…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5 + GATES.length} className="text-center text-sm text-muted-foreground py-8">
                  No sites match the current filter.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.wp_site_id}>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {r.sequence ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{r.site_name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {[r.local_ref, r.postcode].filter(Boolean).join(" · ") || "—"}
                    </div>
                    {r.blocker_reason && (
                      <div className="mt-1 text-[11px] text-rose-600 line-clamp-1">
                        ⚠ {r.blocker_reason}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.current_stage_label ?? "—"}
                  </TableCell>
                  {GATES.map((g) => (
                    <TableCell key={g.key} className="text-center">
                      <div className="inline-flex justify-center">{gateIcon(r.gateMap[g.key])}</div>
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                        <div
                          className={
                            r.pct === 100
                              ? "h-full bg-emerald-500"
                              : r.pct >= 60
                              ? "h-full bg-sky-500"
                              : "h-full bg-amber-500"
                          }
                          style={{ width: `${r.pct}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums w-9 text-right">{r.pct}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelected({ siteId: r.site_id, siteName: r.site_name })}
                    >
                      <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                      Gates
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {selected && wpId && (
        <SitePreconGatesDialog
          open={!!selected}
          onOpenChange={(v) => !v && setSelected(null)}
          workPackageId={wpId}
          siteId={selected.siteId}
          siteName={selected.siteName}
        />
      )}
    </div>
  );
}