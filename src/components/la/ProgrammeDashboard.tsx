import { useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Download, AlertTriangle, Zap, Wrench, Building2, ArrowUpDown, Save, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface ScoredRow {
  site_name: string;
  postcode: string;
  proposed_kw: number;
  site_type: string;
  lng?: number;
  lat?: number;
  viability_index: number;
  band: string;
  grid_readiness: string;
  deployment_class: string;
  reinforcement_probability: number;
  cost_band: string;
  total_estimate: number;
  confidence: string;
  best_poc: string;
  headroom_kw: number | null;
  utilisation_pct: number | null;
  distance_primary_m: number;
  distance_feeder_m: number;
  distance_capacity_m: number;
  phase: number;
  phase_rationale: string;
  traffic_aadf?: number;
  nearby_bus_stops?: number;
  nearby_rail_stations?: number;
  accident_count?: number;
  master_score?: number;
  error?: string;
}

interface Summary {
  total: number;
  errors: number;
  phase_1: number;
  phase_2: number;
  phase_3: number;
  total_kw: number;
  total_estimate: number;
}

interface Props {
  results: ScoredRow[];
  summary: Summary;
  isInternal: boolean;
}

const scoreBadge: Record<string, string> = {
  GREEN: "bg-emerald-100 text-emerald-800",
  AMBER: "bg-amber-100 text-amber-800",
  RED: "bg-red-100 text-red-800",
};

const phaseConfig = [
  { phase: 1, label: "Phase 1 — Quick Wins", icon: Zap, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  { phase: 2, label: "Phase 2 — Moderate Works", icon: Wrench, color: "text-amber-600", bg: "bg-amber-50 border-amber-200" },
  { phase: 3, label: "Phase 3 — Strategic", icon: Building2, color: "text-red-600", bg: "bg-red-50 border-red-200" },
];

type SortKey = "viability_index" | "total_estimate" | "proposed_kw" | "site_name" | "phase";

export function ProgrammeDashboard({ results, summary, isInternal }: Props) {
  const { user } = useAuth();
  const [filterPhase, setFilterPhase] = useState("all");
  const [filterBand, setFilterBand] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("viability_index");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [isSaving, setIsSaving] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggleSelect = useCallback((idx: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }, []);

  const selectAllReady = useCallback(() => {
    const readyIndices = new Set<number>();
    filtered.forEach((r, i) => {
      if (!r.error && r.lng && r.lat) readyIndices.add(i);
    });
    setSelected(readyIndices);
  }, [filtered]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const filtered = useMemo(() => {
    let list = results.filter(r => {
      if (filterPhase !== "all" && r.phase !== Number(filterPhase)) return false;
      if (filterBand !== "all" && r.band !== filterBand) return false;
      return true;
    });
    list.sort((a, b) => {
      const av = a[sortKey] ?? -1;
      const bv = b[sortKey] ?? -1;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return list;
  }, [results, filterPhase, filterBand, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const exportCsv = () => {
    const headers = [
      "Site Name", "Postcode", "Proposed kW", "Site Type", "Phase", "Phase Rationale",
      "Viability Index", "Band", "Grid Readiness", "Deployment Class",
      "Cost Band", "Total Estimate (£)", "Confidence", "Reinforcement %",
      "Best POC", "Traffic AADF", "Bus Stops", "Rail Stations", "Accidents",
      ...(isInternal ? ["Headroom (kW)", "Utilisation %", "Distance Primary (m)", "Distance Feeder (m)", "Distance Capacity (m)"] : []),
      "Error",
    ];
    const rows = filtered.map(r => [
      r.site_name, r.postcode, r.proposed_kw, r.site_type, r.phase, r.phase_rationale,
      r.viability_index, r.band, r.grid_readiness, r.deployment_class,
      r.cost_band, r.total_estimate, r.confidence, r.reinforcement_probability,
      r.best_poc, r.traffic_aadf ?? 0, r.nearby_bus_stops ?? 0, r.nearby_rail_stations ?? 0, r.accident_count ?? 0,
      ...(isInternal ? [r.headroom_kw ?? "", r.utilisation_pct ?? "", r.distance_primary_m, r.distance_feeder_m, r.distance_capacity_m] : []),
      r.error || "",
    ]);
    const csv = [headers, ...rows].map(r => r.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `la-programme-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveToPortfolio = async () => {
    if (!user) { toast.error("Please log in"); return; }

    const validRows = filtered.filter(r => !r.error && r.lng && r.lat);
    if (validRows.length === 0) { toast.error("No valid sites to save"); return; }

    setIsSaving(true);
    try {
      const siteInserts = validRows.map(r => ({
        site_name: r.site_name,
        postcode: r.postcode,
        proposed_kw: r.proposed_kw,
        site_type: r.site_type,
        created_by: user.id,
        viability_index: r.viability_index,
        score: r.band,
        grid_readiness: r.grid_readiness,
        deployment_class: r.deployment_class,
        cost_band: r.cost_band,
        reinforcement_probability: r.reinforcement_probability,
        status: "scored",
        score_reasons: [r.phase_rationale],
        next_steps: r.deployment_class === "Fast Deploy"
          ? ["Submit G99 application", "Arrange point of connection meeting"]
          : ["Commission detailed feasibility study", "Submit connection application"],
        raw_score_data: {
          lng: r.lng,
          lat: r.lat,
          master_score: r.master_score ?? r.viability_index,
          viability_index: r.viability_index,
          band: r.band,
          grid_readiness: r.grid_readiness,
          deployment_class: r.deployment_class,
          cost_band: r.cost_band,
          total_estimate: r.total_estimate,
          confidence: r.confidence,
          reinforcement_probability: r.reinforcement_probability,
          best_poc: r.best_poc,
          headroom_kw: r.headroom_kw,
          utilisation_pct: r.utilisation_pct,
          traffic_aadf: r.traffic_aadf ?? 0,
          nearby_bus_stops: r.nearby_bus_stops ?? 0,
          nearby_rail_stations: r.nearby_rail_stations ?? 0,
          accident_count: r.accident_count ?? 0,
          distances: {
            primary_m: r.distance_primary_m,
            feeder_m: r.distance_feeder_m,
            capacity_segment_m: r.distance_capacity_m,
          },
          phase: r.phase,
          phase_rationale: r.phase_rationale,
          source: "la_programme_batch",
        },
      }));

      // Insert in batches of 50
      let saved = 0;
      for (let i = 0; i < siteInserts.length; i += 50) {
        const batch = siteInserts.slice(i, i + 50);
        const { error } = await supabase.from("sites").insert(batch as any);
        if (error) {
          console.error("Portfolio save error:", error);
          toast.error(`Save error at batch ${Math.floor(i / 50) + 1}: ${error.message}`);
          break;
        }
        saved += batch.length;
      }

      toast.success(`Saved ${saved} sites to portfolio`);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const errorRows = results.filter(r => r.error);
  const portfolioReady = filtered.filter(r => !r.error && r.lng && r.lat);
  const portfolioFail = filtered.filter(r => r.error || !r.lng || !r.lat);

  const getPortfolioStatus = (r: ScoredRow) => {
    if (r.error) return { ready: false, reason: `Error: ${r.error}` };
    if (!r.lng || !r.lat) return { ready: false, reason: "Missing coordinates" };
    return { ready: true, reason: "Ready" };
  };

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <TableHead className="cursor-pointer select-none hover:bg-muted/50 text-xs" onClick={() => toggleSort(k)}>
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "text-primary" : "text-muted-foreground/40"}`} />
      </span>
    </TableHead>
  );

  return (
    <div className="space-y-4">
      {/* Phase summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {phaseConfig.map(pc => {
          const phaseRows = results.filter(r => r.phase === pc.phase);
          const totalKw = phaseRows.reduce((s, r) => s + r.proposed_kw, 0);
          const totalCost = phaseRows.reduce((s, r) => s + r.total_estimate, 0);
          const avgViability = phaseRows.length ? Math.round(phaseRows.reduce((s, r) => s + r.viability_index, 0) / phaseRows.length) : 0;
          return (
            <Card key={pc.phase} className={`border ${pc.bg}`}>
              <CardHeader className="pb-2">
                <CardTitle className={`flex items-center gap-2 text-sm ${pc.color}`}>
                  <pc.icon className="h-4 w-4" />
                  {pc.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Sites:</span> <strong>{phaseRows.length}</strong></div>
                  <div><span className="text-muted-foreground">Total kW:</span> <strong>{totalKw.toLocaleString()}</strong></div>
                  <div><span className="text-muted-foreground">Est. Cost:</span> <strong>£{totalCost.toLocaleString()}</strong></div>
                  <div><span className="text-muted-foreground">Avg Viability:</span> <strong>{avgViability}</strong></div>
                </div>
                <Progress value={avgViability} className="h-1.5" />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Overall summary */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex gap-4 text-xs flex-wrap">
              <span><strong>{summary.total}</strong> sites scored</span>
              <span><strong>{summary.total_kw.toLocaleString()}</strong> kW total</span>
              <span><strong>£{summary.total_estimate.toLocaleString()}</strong> estimated</span>
              <span className="text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> <strong>{portfolioReady.length}</strong> portfolio ready
              </span>
              {portfolioFail.length > 0 && (
                <span className="text-destructive flex items-center gap-1">
                  <XCircle className="h-3 w-3" /> <strong>{portfolioFail.length}</strong> not saveable
                </span>
              )}
              {summary.errors > 0 && (
                <span className="text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {summary.errors} errors
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={exportCsv}>
                <Download className="mr-1 h-3 w-3" /> Export CSV
              </Button>
              <Button size="sm" onClick={saveToPortfolio} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
                Save to Portfolio
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Errors panel */}
      {errorRows.length > 0 && (
        <Card className="border-destructive/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-destructive flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> {errorRows.length} sites with errors
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-40 overflow-auto text-xs space-y-1">
              {errorRows.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <span className="font-medium">{r.site_name}</span>
                  <span className="text-muted-foreground">{r.postcode}</span>
                  <span className="text-destructive">{r.error}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={filterPhase} onValueChange={setFilterPhase}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Phase" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Phases</SelectItem>
            <SelectItem value="1">Phase 1</SelectItem>
            <SelectItem value="2">Phase 2</SelectItem>
            <SelectItem value="3">Phase 3</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterBand} onValueChange={setFilterBand}>
          <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Band" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Bands</SelectItem>
            <SelectItem value="GREEN">Green</SelectItem>
            <SelectItem value="AMBER">Amber</SelectItem>
            <SelectItem value="RED">Red</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                 <TableHead className="text-xs">Status</TableHead>
                  <SortHeader label="Phase" k="phase" />
                  <SortHeader label="Name" k="site_name" />
                  <TableHead className="text-xs">Postcode</TableHead>
                  <SortHeader label="kW" k="proposed_kw" />
                  <SortHeader label="Score" k="viability_index" />
                  <TableHead className="text-xs">Band</TableHead>
                  <TableHead className="text-xs">Traffic</TableHead>
                  <TableHead className="text-xs">Access</TableHead>
                  <TableHead className="text-xs">Safety</TableHead>
                  <TableHead className="text-xs">Grid</TableHead>
                  <TableHead className="text-xs">Deploy</TableHead>
                  <TableHead className="text-xs">Cost</TableHead>
                  <SortHeader label="Est. (£)" k="total_estimate" />
                  <TableHead className="text-xs">Best POC</TableHead>
                  {isInternal && (
                    <>
                      <TableHead className="text-xs">Headroom</TableHead>
                      <TableHead className="text-xs">Util %</TableHead>
                    </>
                  )}
                  <TableHead className="text-xs">Rationale</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r, i) => {
                  const status = getPortfolioStatus(r);
                  return (
                  <TableRow key={i} className={r.error ? "bg-destructive/5" : !status.ready ? "bg-muted/30" : ""}>
                    <TableCell>
                      <span title={status.reason} className="flex items-center gap-1">
                        {status.ready
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          : <XCircle className="h-3.5 w-3.5 text-destructive" />}
                        <span className={`text-[10px] ${status.ready ? "text-emerald-700" : "text-destructive"}`}>
                          {status.ready ? "Ready" : "Fail"}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${r.phase === 1 ? "border-emerald-300 text-emerald-700" : r.phase === 2 ? "border-amber-300 text-amber-700" : "border-red-300 text-red-700"}`}>
                        P{r.phase}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-medium">{r.site_name}</TableCell>
                    <TableCell className="text-xs font-mono">{r.postcode}</TableCell>
                    <TableCell className="text-xs">{r.proposed_kw}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-bold ${r.viability_index >= 65 ? "text-emerald-600" : r.viability_index >= 40 ? "text-amber-600" : "text-red-600"}`}>
                        {r.viability_index}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${scoreBadge[r.band] || ""}`}>{r.band}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{(r.traffic_aadf ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{r.nearby_bus_stops ?? 0}b/{r.nearby_rail_stations ?? 0}r</TableCell>
                    <TableCell className="text-xs">{r.accident_count ?? 0}</TableCell>
                    <TableCell className="text-xs">{r.grid_readiness}</TableCell>
                    <TableCell className="text-xs">{r.deployment_class}</TableCell>
                    <TableCell className="text-xs">{r.cost_band}</TableCell>
                    <TableCell className="text-xs">£{r.total_estimate.toLocaleString()}</TableCell>
                    <TableCell className="text-xs max-w-[120px] truncate" title={r.best_poc}>{r.best_poc}</TableCell>
                    {isInternal && (
                      <>
                        <TableCell className="text-xs">{r.headroom_kw != null ? `${r.headroom_kw}kW` : "—"}</TableCell>
                        <TableCell className="text-xs">{r.utilisation_pct != null ? `${r.utilisation_pct}%` : "—"}</TableCell>
                      </>
                    )}
                    <TableCell className="text-xs max-w-[160px] truncate" title={r.phase_rationale}>{r.phase_rationale}</TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
