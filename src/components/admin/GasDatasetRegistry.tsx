import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  RefreshCw, CheckCircle, XCircle, Loader2, Database, Globe, Search,
  Download, MapPin, FileSpreadsheet, Clock, AlertTriangle, Radar,
  ChevronDown, ChevronUp, Eye, Layers, Info, Flame, Upload,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { format } from "date-fns";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface DatasetEntry {
  id: string;
  dno: string;
  dataset_id: string;
  title: string;
  description: string | null;
  portal_url: string | null;
  is_geospatial: boolean;
  geometry_type: string | null;
  record_count: number;
  endpoint_export_csv: string | null;
  endpoint_export_geojson: string | null;
  endpoint_export_parquet: string | null;
  export_formats: string[];
  active: boolean;
  linked_layer_id: string | null;
  storage_table: string | null;
  last_sync_at: string | null;
  last_sync_status: string | null;
  last_sync_rows: number;
  last_sync_error: string | null;
  schema_hash: string | null;
  fields_json?: any[];
  refresh_strategy: string;
  updated_at_source: string | null;
  created_at: string;
}

type GdnKey = "CADENT" | "NGN" | "SGN" | "WWU";

const LIGHT_COLUMNS = "id,dno,dataset_id,title,description,portal_url,is_geospatial,geometry_type,record_count,endpoint_export_csv,endpoint_export_geojson,endpoint_export_parquet,export_formats,active,linked_layer_id,storage_table,last_sync_at,last_sync_status,last_sync_rows,last_sync_error,schema_hash,refresh_strategy,updated_at_source,created_at";
const PAGE_SIZE = 50;

const gdnConfig: Record<GdnKey, { label: string; crawler: string | null; portalUrl: string; available: boolean }> = {
  CADENT: { label: "Cadent Gas", crawler: "cadent-catalog-crawler", portalUrl: "cadentgas.opendatasoft.com", available: true },
  NGN: { label: "Northern Gas Networks", crawler: null, portalUrl: "northerngasopendataportal.co.uk", available: false },
  SGN: { label: "Scotia Gas Networks", crawler: null, portalUrl: "sgn.co.uk/open-data-sharing-portal", available: false },
  WWU: { label: "Wales & West Utilities", crawler: null, portalUrl: "wwutilities.co.uk", available: false },
};

export function GasDatasetRegistry() {
  const queryClient = useQueryClient();
  const [crawling, setCrawling] = useState(false);
  const [syncAllRunning, setSyncAllRunning] = useState(false);
  const [search, setSearch] = useState("");
  const [filterGeo, setFilterGeo] = useState<"all" | "geo" | "tabular">("all");
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedGdn, setSelectedGdn] = useState<GdnKey>("CADENT");
  const [autoLinking, setAutoLinking] = useState(false);
  const [autoLinkResult, setAutoLinkResult] = useState<any>(null);
  const [page, setPage] = useState(0);
  const batchPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpkgInputRef = useRef<HTMLInputElement>(null);
  const [gpkgUploading, setGpkgUploading] = useState(false);

  const currentConfig = gdnConfig[selectedGdn];

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [selectedGdn, search, filterGeo]);

  // Cleanup batch poll on unmount
  useEffect(() => () => { if (batchPollRef.current) clearInterval(batchPollRef.current); }, []);

  // Server-side paginated query with lightweight columns
  const { data: queryResult, isLoading } = useQuery({
    queryKey: ["gdn-dataset-registry", selectedGdn, page, search, filterGeo],
    queryFn: async () => {
      let query = supabase
        .from("gas_dataset_registry")
        .select(LIGHT_COLUMNS, { count: "exact" })
        .eq("dno", selectedGdn)
        .order("title");

      if (search) {
        query = query.or(`title.ilike.%${search}%,dataset_id.ilike.%${search}%`);
      }
      if (filterGeo === "geo") query = query.eq("is_geospatial", true);
      if (filterGeo === "tabular") query = query.eq("is_geospatial", false);

      const from = page * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      return { datasets: (data ?? []) as DatasetEntry[], totalCount: count ?? 0 };
    },
    refetchOnMount: "always",
  });

  const datasets = queryResult?.datasets ?? [];
  const totalCount = queryResult?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Stats query (lightweight aggregate - counts only)
  const { data: stats } = useQuery({
    queryKey: ["gdn-stats", selectedGdn],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gas_dataset_registry")
        .select("is_geospatial,active,last_sync_status,last_sync_rows", { count: "exact" })
        .eq("dno", selectedGdn);
      if (error) throw error;
      const all = data ?? [];
      return {
        total: all.length,
        geo: all.filter(d => d.is_geospatial).length,
        active: all.filter(d => d.active).length,
        synced: all.filter(d => d.last_sync_status === "success").length,
        failed: all.filter(d => d.last_sync_status === "error").length,
        totalRows: all.reduce((s, d) => s + (d.last_sync_rows || 0), 0),
      };
    },
    refetchOnMount: "always",
  });

  const { data: layers = [] } = useQuery({
    queryKey: ["admin-layers-for-linking"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("layer_registry")
        .select("id, display_name, slug, storage_table, dno, feature_count")
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });

  // Count active+linked for Sync All (separate lightweight query)
  const { data: activeLinkedCount = 0 } = useQuery({
    queryKey: ["gdn-active-linked-count", selectedGdn],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("gas_dataset_registry")
        .select("id", { count: "exact", head: true })
        .eq("dno", selectedGdn)
        .eq("active", true)
        .not("linked_layer_id", "is", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const unlinkdGeoCount = (stats?.geo ?? 0) - datasets.filter(d => d.is_geospatial && d.linked_layer_id).length;

  const handleCrawl = async () => {
    if (!currentConfig.crawler) {
      toast.error(`${currentConfig.label} crawler not yet available`);
      return;
    }
    setCrawling(true);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/${currentConfig.crawler}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || `HTTP ${resp.status}`);

      toast.success(`Discovered ${result.total_discovered} ${currentConfig.label} datasets, upserted ${result.inserted}`);
      invalidateAll();
    } catch (err: any) {
      toast.error(`Crawl failed: ${err.message}`);
    } finally {
      setCrawling(false);
    }
  };

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["gdn-dataset-registry"] });
    queryClient.invalidateQueries({ queryKey: ["gdn-stats"] });
    queryClient.invalidateQueries({ queryKey: ["gdn-active-linked-count"] });
  }, [queryClient]);

  // Fire-and-forget ingest — no per-row polling
  const handleIngest = async (entry: DatasetEntry) => {
    setSyncingIds(prev => new Set(prev).add(entry.id));
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/npg-dataset-ingest`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ registry_id: entry.id, mode: "export" }),
        }
      );
      let result: any = null;
      try { result = await resp.json(); } catch { result = null; }

      if (result?.already_running) {
        invalidateAll();
        toast.info(result?.detail || `${entry.title} is already processing`);
        return;
      }

      if (resp.status === 409) {
        invalidateAll();
        toast.info(result?.detail || `${entry.title} is already processing`);
        return;
      }
      if (!resp.ok) throw new Error(result?.error || `HTTP ${resp.status}`);
      invalidateAll();
      // No per-row polling — batch poll handles status updates
    } catch (err: any) {
      toast.error(`Ingest failed for ${entry.title}: ${err.message}`);
    } finally {
      setSyncingIds(prev => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };

  const handleLinkLayer = async (entryId: string, layerId: string) => {
    const { error } = await supabase
      .from("gas_dataset_registry")
      .update({ linked_layer_id: layerId, updated_at: new Date().toISOString() })
      .eq("id", entryId);

    if (error) {
      toast.error(`Failed to link: ${error.message}`);
    } else {
      toast.success("Layer linked");
      invalidateAll();
    }
  };

  const handleToggleActive = async (entryId: string, active: boolean) => {
    await supabase
      .from("gas_dataset_registry")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("id", entryId);
    invalidateAll();
  };

  const handleAutoLink = async () => {
    setAutoLinking(true);
    setAutoLinkResult(null);
    try {
      const { data, error } = await supabase.rpc('auto_create_dno_layers', {
        p_dno: selectedGdn,
        p_force: false,
      });
      if (error) throw error;

      const result = data as any;
      if (result.error) {
        toast.error(result.error);
        return;
      }

      setAutoLinkResult(result);
      const unmatchedCount = result.unmatched?.length || 0;
      toast.success(
        `${result.layers_created} layers created, ${result.layers_reused} reused, ${result.datasets_linked} datasets linked` +
        (unmatchedCount > 0 ? ` — ${unmatchedCount} unmatched` : '')
      );
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ["admin-layers-for-linking"] });
    } catch (err: any) {
      toast.error(`Auto-link failed: ${err.message}`);
    } finally {
      setAutoLinking(false);
    }
  };

  // Batch Sync All — fire all ingests, then start a single global poll
  const handleSyncAll = async () => {
    setSyncAllRunning(true);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Get all active+linked+geospatial datasets with endpoints
      const { data: syncable } = await supabase
        .from("gas_dataset_registry")
        .select("id,title,is_geospatial,endpoint_export_csv,endpoint_export_geojson,endpoint_records")
        .eq("dno", selectedGdn)
        .eq("active", true)
        .not("linked_layer_id", "is", null)
        .eq("is_geospatial", true);

      const toSync = (syncable ?? []).filter(ds =>
        ds.endpoint_export_csv || ds.endpoint_export_geojson || (ds as any).endpoint_records
      );

      if (toSync.length === 0) {
        toast.info("No syncable datasets found");
        setSyncAllRunning(false);
        return;
      }

      toast.info(`Starting ingestion for ${toSync.length} datasets…`);

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      // Fire all ingests sequentially with small delay (no per-row poll)
      for (const ds of toSync) {
        try {
          await fetch(
            `https://${projectId}.supabase.co/functions/v1/npg-dataset-ingest`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ registry_id: ds.id, mode: "export" }),
            }
          );
        } catch { /* fire and forget */ }
        await new Promise(r => setTimeout(r, 1500));
      }

      // Start a single global batch poll
      startBatchPoll();
    } catch (err: any) {
      toast.error(`Sync All failed: ${err.message}`);
      setSyncAllRunning(false);
    }
  };

  const startBatchPoll = () => {
    if (batchPollRef.current) clearInterval(batchPollRef.current);
    let pollCount = 0;
    batchPollRef.current = setInterval(async () => {
      pollCount++;
      // Refresh the current page data
      invalidateAll();

      // Check if any are still processing
      const { count } = await supabase
        .from("gas_dataset_registry")
        .select("id", { count: "exact", head: true })
        .eq("dno", selectedGdn)
        .eq("last_sync_status", "processing");

      if ((count ?? 0) === 0 || pollCount > 120) {
        if (batchPollRef.current) clearInterval(batchPollRef.current);
        batchPollRef.current = null;
        setSyncAllRunning(false);
        toast.success("Sync All complete — check statuses for results");
        invalidateAll();
      }
    }, 5000);
  };

  return (
    <div className="space-y-4">
      {/* Summary Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard icon={<Database className="h-4 w-4" />} label="Total Datasets" value={stats?.total ?? 0} />
        <StatCard icon={<MapPin className="h-4 w-4" />} label="Geospatial" value={stats?.geo ?? 0} />
        <StatCard icon={<Radar className="h-4 w-4" />} label="Active" value={stats?.active ?? 0} />
        <StatCard icon={<CheckCircle className="h-4 w-4" />} label="Synced" value={stats?.synced ?? 0} />
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Failed" value={stats?.failed ?? 0} variant="destructive" />
        <StatCard icon={<FileSpreadsheet className="h-4 w-4" />} label="Total Rows" value={(stats?.totalRows ?? 0).toLocaleString()} />
      </div>

      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Flame className="h-5 w-5 text-orange-500" />
                  Gas Network Registry — {currentConfig.label}
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  {currentConfig.available
                    ? `Auto-discovered from ${currentConfig.portalUrl}`
                    : `Portal: ${currentConfig.portalUrl} — crawler not yet available`}
                </CardDescription>
              </div>
              <Select value={selectedGdn} onValueChange={(v: any) => setSelectedGdn(v)}>
                <SelectTrigger className="w-[200px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(gdnConfig).map(([key, cfg]) => (
                    <SelectItem key={key} value={key} className="text-xs">
                      {cfg.label}
                      {!cfg.available && " (coming soon)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button onClick={handleCrawl} disabled={crawling || !currentConfig.available} size="sm">
                {crawling ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Radar className="h-4 w-4 mr-1" />}
                {crawling ? "Crawling…" : "Discover All Datasets"}
              </Button>
              <Button
                onClick={handleAutoLink}
                disabled={autoLinking}
                size="sm"
                variant="secondary"
              >
                {autoLinking ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Layers className="h-4 w-4 mr-1" />}
                {autoLinking ? "Linking…" : "Auto-Create & Link Layers"}
              </Button>
              <Button
                onClick={handleSyncAll}
                disabled={syncAllRunning || activeLinkedCount === 0}
                size="sm"
                variant="outline"
              >
                {syncAllRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                {syncAllRunning ? "Syncing…" : `Sync All Active (${activeLinkedCount})`}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search datasets…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Select value={filterGeo} onValueChange={(v: any) => setFilterGeo(v)}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All types</SelectItem>
                <SelectItem value="geo" className="text-xs">Geospatial</SelectItem>
                <SelectItem value="tabular" className="text-xs">Tabular</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {datasets.length} of {totalCount} datasets
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Auto-Link Results */}
      {autoLinkResult && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Layers className="h-4 w-4 text-primary" />
              Auto-Link Summary — {autoLinkResult.dno}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              <div><span className="text-muted-foreground">Layers Created:</span> <strong>{autoLinkResult.layers_created}</strong></div>
              <div><span className="text-muted-foreground">Layers Reused:</span> <strong>{autoLinkResult.layers_reused}</strong></div>
              <div><span className="text-muted-foreground">Datasets Linked:</span> <strong>{autoLinkResult.datasets_linked}</strong></div>
              <div><span className="text-muted-foreground">Skipped:</span> <strong>{autoLinkResult.datasets_skipped}</strong></div>
              <div>
                <span className="text-muted-foreground">Unmatched:</span>{' '}
                <strong className={autoLinkResult.unmatched?.length > 0 ? "text-amber-600" : ""}>
                  {autoLinkResult.unmatched?.length || 0}
                </strong>
              </div>
            </div>
            {autoLinkResult.unmatched?.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 text-xs gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-600" />
                    Show unmatched datasets
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {autoLinkResult.unmatched.map((u: any, i: number) => (
                      <div key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                        <Info className="h-3 w-3 shrink-0" />
                        <span className="font-mono">{u.dataset_id}</span>
                        <span>— {u.title}</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dataset Table */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Loading registry…
          </CardContent>
        </Card>
      ) : !currentConfig.available ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Flame className="h-8 w-8 mx-auto mb-2 opacity-50 text-orange-400" />
            <p className="text-sm font-medium">{currentConfig.label}</p>
            <p className="text-xs mt-1">Crawler not yet built. Portal: {currentConfig.portalUrl}</p>
          </CardContent>
        </Card>
      ) : totalCount === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Flame className="h-8 w-8 mx-auto mb-2 opacity-50 text-orange-400" />
            <p className="text-sm">No datasets discovered yet.</p>
            <p className="text-xs mt-1">Click "Discover All Datasets" to crawl the {currentConfig.label} portal.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">On</TableHead>
                  <TableHead>Dataset</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Records</TableHead>
                  <TableHead>Exports</TableHead>
                  <TableHead>Target Layer</TableHead>
                  <TableHead>Last Sync</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datasets.map(ds => {
                  const isSyncing = syncingIds.has(ds.id);
                  const isExpanded = expandedId === ds.id;

                  return (
                    <Collapsible key={ds.id} asChild open={isExpanded} onOpenChange={() => setExpandedId(isExpanded ? null : ds.id)}>
                      <>
                        <TableRow className="cursor-pointer hover:bg-muted/50">
                          <TableCell>
                            <Switch
                              checked={ds.active}
                              onCheckedChange={v => handleToggleActive(ds.id, v)}
                              className="scale-75"
                            />
                          </TableCell>
                          <TableCell>
                            <CollapsibleTrigger asChild>
                              <div className="flex items-start gap-1">
                                {isExpanded ? <ChevronUp className="h-3 w-3 mt-1 shrink-0" /> : <ChevronDown className="h-3 w-3 mt-1 shrink-0" />}
                                <div>
                                  <span className="font-medium text-xs leading-tight block">{ds.title}</span>
                                  <span className="text-[10px] text-muted-foreground font-mono block">{ds.dataset_id}</span>
                                </div>
                              </div>
                            </CollapsibleTrigger>
                          </TableCell>
                          <TableCell>
                            {ds.is_geospatial ? (
                              <Badge variant="default" className="text-[10px]">
                                <MapPin className="h-2.5 w-2.5 mr-0.5" />
                                {ds.geometry_type || "Geo"}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px]">Tabular</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs font-mono">{(ds.record_count || 0).toLocaleString()}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-0.5">
                              {ds.endpoint_export_csv && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <a href={ds.endpoint_export_csv} target="_blank" rel="noopener" className="text-muted-foreground hover:text-foreground">
                                      <FileSpreadsheet className="h-3 w-3" />
                                    </a>
                                  </TooltipTrigger>
                                  <TooltipContent>CSV Export</TooltipContent>
                                </Tooltip>
                              )}
                              {ds.endpoint_export_geojson && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <a href={ds.endpoint_export_geojson} target="_blank" rel="noopener" className="text-muted-foreground hover:text-foreground">
                                      <MapPin className="h-3 w-3" />
                                    </a>
                                  </TooltipTrigger>
                                  <TooltipContent>GeoJSON Export</TooltipContent>
                                </Tooltip>
                              )}
                              {ds.endpoint_export_parquet && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <a href={ds.endpoint_export_parquet} target="_blank" rel="noopener" className="text-muted-foreground hover:text-foreground">
                                      <Download className="h-3 w-3" />
                                    </a>
                                  </TooltipTrigger>
                                  <TooltipContent>Parquet Export</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={ds.linked_layer_id || ""}
                              onValueChange={v => handleLinkLayer(ds.id, v)}
                            >
                              <SelectTrigger className="w-[160px] h-7 text-[10px]">
                                <SelectValue placeholder="Link layer…" />
                              </SelectTrigger>
                              <SelectContent>
                                {layers.map(l => (
                                  <SelectItem key={l.id} value={l.id} className="text-xs">
                                    {l.display_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <SyncStatus ds={ds} />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {ds.portal_url && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <a href={ds.portal_url} target="_blank" rel="noopener">
                                      <Button variant="ghost" size="icon" className="h-7 w-7">
                                        <Eye className="h-3 w-3" />
                                      </Button>
                                    </a>
                                  </TooltipTrigger>
                                  <TooltipContent>View on {currentConfig.label} Portal</TooltipContent>
                                </Tooltip>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px]"
                                disabled={isSyncing || !ds.linked_layer_id}
                                onClick={() => handleIngest(ds)}
                              >
                                {isSyncing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
                                {isSyncing ? "Syncing…" : "Ingest"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        <CollapsibleContent asChild>
                          <TableRow className="bg-muted/30">
                            <TableCell colSpan={8} className="p-3">
                              <DatasetDetail ds={ds} onIngest={(d) => handleIngest(d)} isSyncing={isSyncing} />
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  );
                })}
              </TableBody>
            </Table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-xs text-muted-foreground">
                  Page {page + 1} of {totalPages}
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline" size="sm" className="h-7 text-xs"
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="h-3 w-3 mr-1" /> Previous
                  </Button>
                  <Button
                    variant="outline" size="sm" className="h-7 text-xs"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Next <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, variant }: { icon: React.ReactNode; label: string; value: string | number; variant?: string }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-2">
        <div className={`${variant === "destructive" ? "text-destructive" : "text-primary"}`}>{icon}</div>
        <div>
          <div className="text-lg font-bold leading-tight">{value}</div>
          <div className="text-[10px] text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function SyncStatus({ ds }: { ds: DatasetEntry }) {
  if (!ds.last_sync_at || ds.last_sync_status === "never") {
    return <span className="text-[10px] text-muted-foreground">Never</span>;
  }
  if (ds.last_sync_status === "processing") {
    return (
      <span className="text-[10px] text-primary flex items-center gap-0.5">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        Processing…
      </span>
    );
  }
  if (ds.last_sync_status === "success") {
    return (
      <div className="text-[10px]">
        <span className="text-primary flex items-center gap-0.5">
          <CheckCircle className="h-2.5 w-2.5" />
          {ds.last_sync_rows.toLocaleString()} rows
        </span>
        <span className="text-muted-foreground block">
          {format(new Date(ds.last_sync_at), "dd MMM HH:mm")}
        </span>
      </div>
    );
  }
  if (ds.last_sync_status === "skipped") {
    return (
      <Tooltip>
        <TooltipTrigger>
          <span className="text-[10px] text-amber-500 flex items-center gap-0.5">
            <AlertTriangle className="h-2.5 w-2.5" />
            No API
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{ds.last_sync_error || "Manual download only"}</TooltipContent>
      </Tooltip>
    );
  }
  if (ds.last_sync_status === "error") {
    return (
      <Tooltip>
        <TooltipTrigger>
          <span className="text-[10px] text-destructive flex items-center gap-0.5">
            <XCircle className="h-2.5 w-2.5" />
            Error
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{ds.last_sync_error}</TooltipContent>
      </Tooltip>
    );
  }
  return <span className="text-[10px] text-muted-foreground">{ds.last_sync_status}</span>;
}

function DatasetDetail({ ds, onIngest, isSyncing }: { ds: DatasetEntry; onIngest: (ds: DatasetEntry) => void; isSyncing: boolean }) {
  // Fetch fields_json on demand only when expanded
  const { data: detailData } = useQuery({
    queryKey: ["gdn-dataset-detail", ds.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gas_dataset_registry")
        .select("fields_json")
        .eq("id", ds.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const fields = Array.isArray(detailData?.fields_json) ? detailData.fields_json : [];

  return (
    <div className="space-y-3">
      {ds.description && (
        <p className="text-xs text-muted-foreground">{ds.description}</p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Schema Hash:</span>
          <span className="ml-1 font-mono">{ds.schema_hash || "—"}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Refresh:</span>
          <span className="ml-1">{ds.refresh_strategy}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Source Updated:</span>
          <span className="ml-1">{ds.updated_at_source ? format(new Date(ds.updated_at_source), "dd MMM yyyy") : "—"}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Storage Table:</span>
          <span className="ml-1 font-mono">{ds.storage_table || "—"}</span>
        </div>
      </div>
      {fields.length > 0 && (
        <div>
          <span className="text-xs font-medium mb-1 block">Fields ({fields.length})</span>
          <div className="flex flex-wrap gap-1">
            {fields.slice(0, 20).map((f: any, i: number) => (
              <Badge key={i} variant="outline" className="text-[10px] font-mono">
                {f.name}
                <span className="text-muted-foreground ml-1">:{f.type}</span>
              </Badge>
            ))}
            {fields.length > 20 && (
              <Badge variant="outline" className="text-[10px]">+{fields.length - 20} more</Badge>
            )}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          size="sm" variant="outline" className="h-7 text-xs"
          disabled={isSyncing || !ds.linked_layer_id}
          onClick={() => onIngest(ds)}
        >
          <Download className="h-3 w-3 mr-1" />
          Ingest
        </Button>
      </div>
    </div>
  );
}
