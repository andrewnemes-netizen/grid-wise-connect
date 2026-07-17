import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { FolderOpen, Search, Eye, Download, ArrowUpDown, BarChart3, X, Train, Droplets, TrafficCone, Crosshair, Trash2, ClipboardList, Upload } from "lucide-react";
import { Package } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { PortfolioAnalytics, extractOsmFlags } from "@/components/portfolio/PortfolioAnalytics";
import { estimateConnectionCost } from "@/lib/connectionCosts";
import { useUnitRates } from "@/hooks/useUnitRates";
import { SendSurveyDialog } from "@/components/portfolio/SendSurveyDialog";

const PORTFOLIO_SITE_SELECT = `
  id,
  site_name,
  postcode,
  site_type,
  proposed_kw,
  score,
  viability_index,
  reinforcement_probability,
  cost_band,
  grid_readiness,
  deployment_class,
  created_at,
  status,
  connection_options,
  route_constraints:raw_score_data->route_constraints,
  osm_coverage:raw_score_data->>osm_coverage,
  nearby_crossings:raw_score_data->>nearby_crossings,
  nearby_signals:raw_score_data->>nearby_signals,
  surface_split:raw_score_data->surface_split,
  constraints:raw_score_data->constraints,
  distances:raw_score_data->distances,
  raw_connection_options:raw_score_data->connection_options,
  persisted_total_estimate:raw_score_data->cost_estimate->>total_estimate,
  fallback_total_estimate:raw_score_data->>total_estimate
`;

const PORTFOLIO_LOAD_TIMEOUT_MS = 12000;

type PortfolioSiteRow = {
  id: string;
  site_name: string;
  postcode: string | null;
  site_type: string | null;
  proposed_kw: number | null;
  score: string | null;
  viability_index: number | null;
  reinforcement_probability: number | null;
  cost_band: string | null;
  grid_readiness: string | null;
  deployment_class: string | null;
  created_at: string;
  status: string;
  connection_options: Record<string, unknown> | null;
  route_constraints: string[] | null;
  osm_coverage: string | null;
  nearby_crossings: number | string | null;
  nearby_signals: number | string | null;
  surface_split: Record<string, unknown> | null;
  constraints: Record<string, unknown> | null;
  distances: Record<string, unknown> | null;
  raw_connection_options: Record<string, unknown> | null;
  persisted_total_estimate: number | string | null;
  fallback_total_estimate: number | string | null;
};

function withTimeout<T>(promise: PromiseLike<T> | T, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

function toFiniteNumber(value: number | string | null | undefined): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapPortfolioSite(row: PortfolioSiteRow) {
  const {
    route_constraints,
    osm_coverage,
    nearby_crossings,
    nearby_signals,
    surface_split,
    constraints,
    distances,
    raw_connection_options,
    persisted_total_estimate,
    fallback_total_estimate,
    ...site
  } = row;

  const persistedTotalEstimate = toFiniteNumber(persisted_total_estimate);
  const fallbackTotalEstimate = toFiniteNumber(fallback_total_estimate);

  return {
    ...site,
    raw_score_data: {
      route_constraints: Array.isArray(route_constraints) ? route_constraints : [],
      osm_coverage: osm_coverage ?? "none",
      nearby_crossings: toFiniteNumber(nearby_crossings) ?? 0,
      nearby_signals: toFiniteNumber(nearby_signals) ?? 0,
      surface_split: surface_split ?? null,
      constraints: constraints ?? null,
      distances: distances ?? null,
      connection_options: raw_connection_options ?? null,
      ...(persistedTotalEstimate != null
        ? {
            cost_estimate: { total_estimate: persistedTotalEstimate },
            costEstimate: { total_estimate: persistedTotalEstimate },
          }
        : {}),
      ...(fallbackTotalEstimate != null
        ? {
            total_estimate: fallbackTotalEstimate,
            totalEstimate: fallbackTotalEstimate,
          }
        : {}),
    },
  };
}

function formatGBP(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getSiteEstimatedCost(site: any, unitRates: any): number | null {
  const raw = (site?.raw_score_data || {}) as any;
  const persisted = Number(raw?.cost_estimate?.total_estimate ?? raw?.costEstimate?.total_estimate);
  if (Number.isFinite(persisted)) return persisted;

  const fallback = Number(raw?.total_estimate ?? raw?.totalEstimate);
  if (Number.isFinite(fallback)) return fallback;

  if (!site?.proposed_kw || site.proposed_kw <= 0) return null;
  const distanceSource = raw?.distances || site?.connection_options || raw?.connection_options;
  if (!distanceSource || typeof distanceSource !== "object") return null;

  const distances = {
    primary_m: Number(distanceSource.primary_m),
    feeder_m: Number(distanceSource.feeder_m),
    capacity_segment_m: Number(distanceSource.capacity_segment_m),
  };

  if (![distances.primary_m, distances.feeder_m, distances.capacity_segment_m].every((v) => Number.isFinite(v))) {
    return null;
  }

  const estimate = estimateConnectionCost(
    {
      proposed_kw: site.proposed_kw,
      distances,
      constraints: raw?.constraints || null,
    },
    unitRates
  );
  return estimate.total_estimate;
}

const scoreBadge: Record<string, string> = {
  GREEN: "bg-emerald-100 text-emerald-800 border-emerald-300",
  AMBER: "bg-amber-100 text-amber-800 border-amber-300",
  RED: "bg-red-100 text-red-800 border-red-300",
};

const gridBadge: Record<string, string> = {
  Strong: "bg-emerald-100 text-emerald-800",
  Moderate: "bg-amber-100 text-amber-800",
  Constrained: "bg-red-100 text-red-800",
};

type SortKey = "site_name" | "viability_index" | "cost_band" | "reinforcement_probability" | "created_at" | "proposed_kw" | "grid_readiness" | "deployment_class";
type SortDir = "asc" | "desc";

const COST_BAND_ORDER: Record<string, number> = { "£": 1, "££": 2, "£££": 3 };

const Portfolio = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: unitRates } = useUnitRates();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterScore, setFilterScore] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterGrid, setFilterGrid] = useState("all");
  const [filterCost, setFilterCost] = useState("all");
  const [filterDeploy, setFilterDeploy] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("viability_index");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [surveySiteIds, setSurveySiteIds] = useState<string[] | null>(null);
  const [filterWp, setFilterWp] = useState<string>("all"); // "all" | "unassigned" | "assigned" | <wpId>

  const { data: sites = [], isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["sites", user?.id],
    queryFn: async () => {
      const portfolioQuery = (supabase.from("sites") as any)
        .select(PORTFOLIO_SITE_SELECT)
        .order("created_at", { ascending: false });

      const response = await withTimeout<{ data: PortfolioSiteRow[] | null; error: { message: string } | null }>(
        portfolioQuery,
        PORTFOLIO_LOAD_TIMEOUT_MS,
        "Portfolio took too long to load. Please retry."
      );

      const { data, error } = response;

      if (error) throw error;

      return (data as PortfolioSiteRow[] | null)?.map(mapPortfolioSite) ?? [];
    },
    enabled: !!user,
    retry: 0,
    refetchOnWindowFocus: false,
  });

  // Site -> Work Package memberships (active only)
  const { data: wpMemberships = [] } = useQuery({
    queryKey: ["portfolio-wp-memberships", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("wp_sites")
        .select("site_id, work_package_id, work_packages:work_packages(id, name, code, status)");
      if (error) throw error;
      return (data ?? []).filter((r: any) => {
        const st = String(r.work_packages?.status ?? "").toUpperCase();
        return r.work_packages && st !== "ARCHIVED" && st !== "CANCELLED";
      });
    },
  });

  const wpsBySite = useMemo(() => {
    const m = new Map<string, { id: string; name: string; code?: string | null }[]>();
    for (const r of wpMemberships as any[]) {
      const arr = m.get(r.site_id) ?? [];
      arr.push(r.work_packages);
      m.set(r.site_id, arr);
    }
    return m;
  }, [wpMemberships]);

  const allWps = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; code?: string | null }>();
    for (const r of wpMemberships as any[]) {
      if (r.work_packages && !seen.has(r.work_packages.id)) seen.set(r.work_packages.id, r.work_packages);
    }
    return Array.from(seen.values()).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  }, [wpMemberships]);

  const filtered = useMemo(() => {
    let list = sites.filter((s: any) => {
      if (filterScore !== "all" && s.score !== filterScore) return false;
      if (filterStatus !== "all" && s.status !== filterStatus) return false;
      if (filterGrid !== "all" && s.grid_readiness !== filterGrid) return false;
      if (filterCost !== "all" && s.cost_band !== filterCost) return false;
      if (filterDeploy !== "all" && s.deployment_class !== filterDeploy) return false;
      if (search && !s.site_name?.toLowerCase().includes(search.toLowerCase()) && !s.postcode?.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterWp !== "all") {
        const wps = wpsBySite.get(s.id) ?? [];
        if (filterWp === "unassigned" && wps.length > 0) return false;
        if (filterWp === "assigned" && wps.length === 0) return false;
        if (filterWp !== "unassigned" && filterWp !== "assigned" && !wps.some((w) => w.id === filterWp)) return false;
      }
      return true;
    });

    list.sort((a: any, b: any) => {
      let av: any, bv: any;
      if (sortKey === "cost_band") {
        av = COST_BAND_ORDER[a.cost_band] ?? 99;
        bv = COST_BAND_ORDER[b.cost_band] ?? 99;
      } else if (sortKey === "created_at") {
        av = new Date(a.created_at).getTime();
        bv = new Date(b.created_at).getTime();
      } else {
        av = a[sortKey] ?? -1;
        bv = b[sortKey] ?? -1;
      }
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });

    return list;
  }, [sites, filterScore, filterStatus, filterGrid, filterCost, filterDeploy, filterWp, wpsBySite, search, sortKey, sortDir]);

  const wpCounts = useMemo(() => {
    let assigned = 0, unassigned = 0;
    for (const s of sites as any[]) {
      if ((wpsBySite.get(s.id) ?? []).length > 0) assigned++; else unassigned++;
    }
    return { assigned, unassigned };
  }, [sites, wpsBySite]);

  const compareSites = useMemo(() => sites.filter((s: any) => compareIds.has(s.id)), [sites, compareIds]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const toggleCompare = (id: string) => {
    setCompareIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
  };

  const handleDelete = async () => {
    if (deleteIds.length === 0) return;
    const { error } = await supabase.from("sites").delete().in("id", deleteIds);
    if (error) {
      toast.error("Failed to delete: " + error.message);
    } else {
      toast.success(`Deleted ${deleteIds.length} site(s)`);
      setCompareIds(prev => {
        const next = new Set(prev);
        deleteIds.forEach(id => next.delete(id));
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["sites", user?.id] });
    }
    setDeleteIds([]);
  };

  const exportCsv = () => {
    const headers = ["Name", "Postcode", "Type", "kW", "Score", "Viability", "Grid Readiness", "Deployment Class", "Cost Band", "Estimated Cost", "Reinforcement %", "Constraints", "OSM Coverage", "Status", "Created"];
    const rows = filtered.map((s: any) => {
      const osm = extractOsmFlags(s);
      return [
        s.site_name, s.postcode || "", s.site_type || "", s.proposed_kw || "", s.score || "",
        s.viability_index ?? "", s.grid_readiness || "", s.deployment_class || "",
        s.cost_band || "", getSiteEstimatedCost(s, unitRates) ?? "", s.reinforcement_probability ?? "",
        osm.constraints.join("; ") || "None", osm.osmCoverage,
        s.status, format(new Date(s.created_at), "yyyy-MM-dd"),
      ];
    });
    const csv = [headers, ...rows].map(r => r.map((c: any) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `portfolio-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
    <TableHead className="cursor-pointer select-none hover:bg-muted/50" onClick={() => toggleSort(k)}>
      <span className="flex items-center gap-1">
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "text-primary" : "text-muted-foreground/40"}`} />
      </span>
    </TableHead>
  );

  return (
    <div className="p-6 space-y-4 h-full overflow-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-bold text-foreground">Portfolio</h2>
          <Badge variant="secondary" className="ml-2">{filtered.length} sites</Badge>
        </div>
        <div className="flex gap-2">
          {compareIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setDeleteIds(Array.from(compareIds))}>
              <Trash2 className="mr-1 h-3 w-3" />Delete Selected ({compareIds.size})
            </Button>
          )}
          {compareIds.size > 0 && (
            <Button variant="default" size="sm" onClick={() => setSurveySiteIds(Array.from(compareIds))}>
              <ClipboardList className="mr-1 h-3 w-3" />Send Survey ({compareIds.size})
            </Button>
          )}
          {compareIds.size >= 2 && (
            <Button variant="outline" size="sm" onClick={() => setCompareIds(new Set())}>
              <X className="mr-1 h-3 w-3" />Clear Compare
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-1 h-3 w-3" />Export CSV
          </Button>
          <Button variant="default" size="sm" onClick={() => navigate("/import/wizard")}>
            <Upload className="mr-1 h-3 w-3" />Import sites
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search name or postcode…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
        </div>
        <Select value={filterScore} onValueChange={setFilterScore}>
          <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Score" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scores</SelectItem>
            <SelectItem value="GREEN">Green</SelectItem>
            <SelectItem value="AMBER">Amber</SelectItem>
            <SelectItem value="RED">Red</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterGrid} onValueChange={setFilterGrid}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Grid" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Grid</SelectItem>
            <SelectItem value="Strong">Strong</SelectItem>
            <SelectItem value="Moderate">Moderate</SelectItem>
            <SelectItem value="Constrained">Constrained</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterCost} onValueChange={setFilterCost}>
          <SelectTrigger className="w-32 h-9"><SelectValue placeholder="Cost" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Costs</SelectItem>
            <SelectItem value="£">£</SelectItem>
            <SelectItem value="££">££</SelectItem>
            <SelectItem value="£££">£££</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterDeploy} onValueChange={setFilterDeploy}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="Deploy" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Deploy</SelectItem>
            <SelectItem value="Fast Deploy">Fast Deploy</SelectItem>
            <SelectItem value="Needs Reinforcement">Needs Reinforcement</SelectItem>
            <SelectItem value="Complex">Complex</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="reviewing">Reviewing</SelectItem>
            <SelectItem value="viable">Viable</SelectItem>
            <SelectItem value="on_hold">On Hold</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterWp} onValueChange={setFilterWp}>
          <SelectTrigger className="w-56 h-9"><SelectValue placeholder="Work Package" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sites</SelectItem>
            <SelectItem value="unassigned">Loose — no WP ({wpCounts.unassigned})</SelectItem>
            <SelectItem value="assigned">Assigned to any WP ({wpCounts.assigned})</SelectItem>
            {allWps.length > 0 && (
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">By work package</div>
            )}
            {allWps.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.code ? `${w.code} · ` : ""}{w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Analytics Dashboard */}
      <PortfolioAnalytics sites={filtered} />

      {/* Comparison panel */}
      {compareSites.length >= 2 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Comparing {compareSites.length} Sites</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left py-1 pr-4">Metric</th>
                    {compareSites.map((s: any) => (
                      <th key={s.id} className="text-center py-1 px-2 min-w-[100px]">{s.site_name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { label: "Viability", key: "viability_index", fmt: (v: any) => v ?? "—" },
                    { label: "Score", key: "score", fmt: (v: any) => v || "—" },
                    { label: "Grid Readiness", key: "grid_readiness", fmt: (v: any) => v || "—" },
                    { label: "Deployment", key: "deployment_class", fmt: (v: any) => v || "—" },
                    { label: "Cost Band", key: "cost_band", fmt: (v: any) => v || "—" },
                    { label: "Estimated Cost", key: "id", fmt: (_: any, s?: any) => {
                      const total = s ? getSiteEstimatedCost(s, unitRates) : null;
                      return total != null ? formatGBP(total) : "—";
                    } },
                    { label: "Reinforcement %", key: "reinforcement_probability", fmt: (v: any) => v != null ? `${v}%` : "—" },
                    { label: "Proposed kW", key: "proposed_kw", fmt: (v: any) => v || "—" },
                  ].map(row => (
                    <tr key={row.label} className="border-t">
                      <td className="py-1.5 pr-4 text-muted-foreground">{row.label}</td>
                      {compareSites.map((s: any) => (
                        <td key={s.id} className="text-center py-1.5 px-2 font-medium">{row.fmt(s[row.key], s)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <span className="text-[9px] text-muted-foreground">CMP</span>
                </TableHead>
                <SortHeader label="Name" k="site_name" />
                <TableHead>Postcode</TableHead>
                <SortHeader label="kW" k="proposed_kw" />
                <TableHead>Score</TableHead>
                <SortHeader label="Viability" k="viability_index" />
                <SortHeader label="Grid" k="grid_readiness" />
                <SortHeader label="Deploy" k="deployment_class" />
                <SortHeader label="Cost Band" k="cost_band" />
                <TableHead>Est. Cost</TableHead>
                <SortHeader label="Reinforce %" k="reinforcement_probability" />
                <TableHead>Constraints</TableHead>
                <TableHead>OSM</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Work Package</TableHead>
                <SortHeader label="Created" k="created_at" />
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={17} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : isError ? (
                <TableRow>
                  <TableCell colSpan={17} className="py-8">
                    <div className="flex flex-col items-center gap-3 text-center">
                      <p className="text-sm font-medium text-destructive">Portfolio failed to load.</p>
                      <p className="text-xs text-muted-foreground">
                        {error instanceof Error ? error.message : "Something went wrong while loading your sites."}
                      </p>
                      <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                        Retry
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={17} className="text-center text-muted-foreground py-8">No sites found. Use the map to run a feasibility check and save a site.</TableCell></TableRow>
              ) : (
                filtered.map((site: any) => (
                  <TableRow key={site.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={compareIds.has(site.id)}
                        onCheckedChange={() => toggleCompare(site.id)}
                        disabled={!compareIds.has(site.id) && compareIds.size >= 5}
                      />
                    </TableCell>
                    <TableCell className="font-medium" onClick={() => navigate(`/site/${site.id}`)}>{site.site_name}</TableCell>
                    <TableCell className="text-muted-foreground" onClick={() => navigate(`/site/${site.id}`)}>{site.postcode || "—"}</TableCell>
                    <TableCell onClick={() => navigate(`/site/${site.id}`)}>{site.proposed_kw || "—"}</TableCell>
                    <TableCell onClick={() => navigate(`/site/${site.id}`)}>
                      {site.score ? (
                        <Badge variant="outline" className={scoreBadge[site.score] || ""}>{site.score}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell onClick={() => navigate(`/site/${site.id}`)}>
                      {site.viability_index != null ? (
                        <span className={`font-bold ${site.viability_index >= 65 ? "text-emerald-600" : site.viability_index >= 40 ? "text-amber-600" : "text-red-600"}`}>
                          {site.viability_index}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell onClick={() => navigate(`/site/${site.id}`)}>
                      {site.grid_readiness ? (
                        <Badge variant="outline" className={gridBadge[site.grid_readiness] || ""}>{site.grid_readiness}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground" onClick={() => navigate(`/site/${site.id}`)}>{site.deployment_class || "—"}</TableCell>
                    <TableCell onClick={() => navigate(`/site/${site.id}`)}>
                      {site.cost_band ? (
                        <Badge variant={site.cost_band === "£" ? "default" : site.cost_band === "££" ? "secondary" : "destructive"}>{site.cost_band}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs" onClick={() => navigate(`/site/${site.id}`)}>
                      {(() => {
                        const total = getSiteEstimatedCost(site, unitRates);
                        return total != null ? formatGBP(total) : "—";
                      })()}
                    </TableCell>
                    <TableCell onClick={() => navigate(`/site/${site.id}`)}>{site.reinforcement_probability != null ? `${site.reinforcement_probability}%` : "—"}</TableCell>
                    <TableCell onClick={() => navigate(`/site/${site.id}`)}>
                      {(() => {
                        const osm = extractOsmFlags(site);
                        if (osm.constraints.length === 0) return <span className="text-muted-foreground text-xs">—</span>;
                        return (
                          <TooltipProvider>
                            <div className="flex gap-0.5">
                              {osm.constraints.includes("RAILWAY_NEARBY") && (
                                <Tooltip><TooltipTrigger><Train className="h-3.5 w-3.5 text-red-500" /></TooltipTrigger><TooltipContent>Railway nearby</TooltipContent></Tooltip>
                              )}
                              {osm.constraints.includes("WATER_NEARBY") && (
                                <Tooltip><TooltipTrigger><Droplets className="h-3.5 w-3.5 text-blue-500" /></TooltipTrigger><TooltipContent>Water crossing nearby</TooltipContent></Tooltip>
                              )}
                              {osm.constraints.includes("SIGNAL_CONTROLLED") && (
                                <Tooltip><TooltipTrigger><TrafficCone className="h-3.5 w-3.5 text-amber-500" /></TooltipTrigger><TooltipContent>Signal-controlled junction</TooltipContent></Tooltip>
                              )}
                            </div>
                          </TooltipProvider>
                        );
                      })()}
                    </TableCell>
                    <TableCell onClick={() => navigate(`/site/${site.id}`)}>
                      {(() => {
                        const osm = extractOsmFlags(site);
                        return osm.osmCoverage === "cached"
                          ? <Crosshair className="h-3.5 w-3.5 text-emerald-500" />
                          : <span className="text-muted-foreground text-xs">—</span>;
                      })()}
                    </TableCell>
                    <TableCell onClick={() => navigate(`/site/${site.id}`)}><Badge variant="secondary" className="capitalize">{site.status}</Badge></TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {(() => {
                        const wps = wpsBySite.get(site.id) ?? [];
                        if (wps.length === 0) {
                          return <Badge variant="outline" className="text-[10px] text-muted-foreground">Loose</Badge>;
                        }
                        return (
                          <div className="flex flex-wrap gap-1">
                            {wps.slice(0, 2).map((w) => (
                              <Badge
                                key={w.id}
                                variant="secondary"
                                className="text-[10px] cursor-pointer hover:bg-secondary/80"
                                onClick={() => navigate(`/wp/${w.id}/sites/register`)}
                                title={`Open ${w.name}`}
                              >
                                <Package className="h-3 w-3 mr-1" />
                                {w.code ?? w.name}
                              </Badge>
                            ))}
                            {wps.length > 2 && (
                              <Badge variant="outline" className="text-[10px]">+{wps.length - 2}</Badge>
                            )}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs" onClick={() => navigate(`/site/${site.id}`)}>{format(new Date(site.created_at), "dd MMM yyyy")}</TableCell>
                    <TableCell className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/site/${site.id}`)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Send site survey" onClick={() => setSurveySiteIds([site.id])}>
                        <ClipboardList className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteIds([site.id])}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={deleteIds.length > 0} onOpenChange={(open) => { if (!open) setDeleteIds([]); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteIds.length} site{deleteIds.length > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone. The site data will be permanently removed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SendSurveyDialog
        open={!!surveySiteIds && surveySiteIds.length > 0}
        onOpenChange={(o) => { if (!o) setSurveySiteIds(null); }}
        siteIds={surveySiteIds ?? []}
      />
    </div>
  );
};

export default Portfolio;
