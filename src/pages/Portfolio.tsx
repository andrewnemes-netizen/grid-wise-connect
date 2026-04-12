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
import { FolderOpen, Search, Eye, Download, ArrowUpDown, BarChart3, X, Train, Droplets, TrafficCone, Crosshair, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { PortfolioAnalytics, extractOsmFlags } from "@/components/portfolio/PortfolioAnalytics";
import { estimateConnectionCost } from "@/lib/connectionCosts";
import { useUnitRates } from "@/hooks/useUnitRates";

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

  const { data: sites = [], isLoading } = useQuery({
    queryKey: ["sites", user?.id],
    queryFn: async () => {
      // RLS handles org-scoped filtering server-side
      const { data, error } = await supabase
        .from("sites")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    let list = sites.filter((s: any) => {
      if (filterScore !== "all" && s.score !== filterScore) return false;
      if (filterStatus !== "all" && s.status !== filterStatus) return false;
      if (filterGrid !== "all" && s.grid_readiness !== filterGrid) return false;
      if (filterCost !== "all" && s.cost_band !== filterCost) return false;
      if (filterDeploy !== "all" && s.deployment_class !== filterDeploy) return false;
      if (search && !s.site_name?.toLowerCase().includes(search.toLowerCase()) && !s.postcode?.toLowerCase().includes(search.toLowerCase())) return false;
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
  }, [sites, filterScore, filterStatus, filterGrid, filterCost, filterDeploy, search, sortKey, sortDir]);

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
      queryClient.invalidateQueries({ queryKey: ["sites"] });
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
          {compareIds.size >= 2 && (
            <Button variant="outline" size="sm" onClick={() => setCompareIds(new Set())}>
              <X className="mr-1 h-3 w-3" />Clear Compare
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="mr-1 h-3 w-3" />Export CSV
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
                <SortHeader label="Created" k="created_at" />
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={16} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={16} className="text-center text-muted-foreground py-8">No sites found. Use the map to run a feasibility check and save a site.</TableCell></TableRow>
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
                    <TableCell className="text-muted-foreground text-xs" onClick={() => navigate(`/site/${site.id}`)}>{format(new Date(site.created_at), "dd MMM yyyy")}</TableCell>
                    <TableCell className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/site/${site.id}`)}>
                        <Eye className="h-3.5 w-3.5" />
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
    </div>
  );
};

export default Portfolio;
