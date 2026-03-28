import { useState } from "react";
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
  ChevronDown, ChevronUp, Eye
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
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
  fields_json: any[];
  refresh_strategy: string;
  updated_at_source: string | null;
  created_at: string;
}

export function NpgDatasetRegistry() {
  const queryClient = useQueryClient();
  const [crawling, setCrawling] = useState(false);
  const [syncAllRunning, setSyncAllRunning] = useState(false);
  const [search, setSearch] = useState("");
  const [filterGeo, setFilterGeo] = useState<"all" | "geo" | "tabular">("all");
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedDno, setSelectedDno] = useState<"NPG" | "ENWL">("NPG");

  const dnoConfig: Record<string, { label: string; crawler: string; portalUrl: string }> = {
    NPG: { label: "Northern Powergrid", crawler: "npg-catalog-crawler", portalUrl: "northernpowergrid.opendatasoft.com" },
    ENWL: { label: "Electricity North West", crawler: "enwl-catalog-crawler", portalUrl: "electricitynorthwest.opendatasoft.com" },
  };

  // Fetch all datasets from registry for selected DNO
  const { data: datasets = [], isLoading } = useQuery({
    queryKey: ["dno-dataset-registry", selectedDno],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dno_dataset_registry")
        .select("*")
        .eq("dno", selectedDno)
        .order("title");
      if (error) throw error;
      return data as DatasetEntry[];
    },
  });

  // Fetch layers for linking
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

  // ── Crawl catalog ──
  const handleCrawl = async () => {
    setCrawling(true);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const crawlerFn = dnoConfig[selectedDno].crawler;
      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/${crawlerFn}`,
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

      toast.success(`Discovered ${result.total_discovered} ${selectedDno} datasets, upserted ${result.inserted}`);
      queryClient.invalidateQueries({ queryKey: ["dno-dataset-registry", selectedDno] });
    } catch (err: any) {
      toast.error(`Crawl failed: ${err.message}`);
    } finally {
      setCrawling(false);
    }
  };

  // ── Ingest a single dataset ──
  const handleIngest = async (entry: DatasetEntry, mode: "export" | "records" = "export") => {
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
          body: JSON.stringify({ registry_id: entry.id, mode }),
        }
      );
      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || `HTTP ${resp.status}`);

      if (result.accepted) {
        toast.info(`Ingestion started for ${entry.title} — processing in background`);
        // Poll for completion
        pollSyncStatus(entry.id, entry.title);
      } else {
        toast.success(`Ingested ${result.inserted} features from ${entry.title}`);
        queryClient.invalidateQueries({ queryKey: ["dno-dataset-registry", selectedDno] });
      }
    } catch (err: any) {
      toast.error(`Ingest failed: ${err.message}`);
    } finally {
      setSyncingIds(prev => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };

  // Poll registry for background ingest completion
  const pollSyncStatus = async (entryId: string, title: string) => {
    const maxPolls = 60; // 2 minutes max
    for (let i = 0; i < maxPolls; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const { data } = await supabase
        .from("dno_dataset_registry")
        .select("last_sync_status, last_sync_rows, last_sync_error")
        .eq("id", entryId)
        .single();

      if (!data || data.last_sync_status === "processing") continue;

      if (data.last_sync_status === "success") {
        toast.success(`✅ ${title}: ${data.last_sync_rows} features ingested`);
      } else if (data.last_sync_status === "error") {
        toast.error(`❌ ${title}: ${data.last_sync_error}`);
      }
      queryClient.invalidateQueries({ queryKey: ["dno-dataset-registry", selectedDno] });
      return;
    }
    toast.warning(`${title}: Still processing — check back shortly`);
    queryClient.invalidateQueries({ queryKey: ["dno-dataset-registry", selectedDno] });
  };

  // ── Link layer ──
  const handleLinkLayer = async (entryId: string, layerId: string) => {
    const { error } = await supabase
      .from("dno_dataset_registry")
      .update({ linked_layer_id: layerId, updated_at: new Date().toISOString() })
      .eq("id", entryId);

    if (error) {
      toast.error(`Failed to link: ${error.message}`);
    } else {
      toast.success("Layer linked");
      queryClient.invalidateQueries({ queryKey: ["dno-dataset-registry", selectedDno] });
    }
  };

  // ── Toggle active ──
  const handleToggleActive = async (entryId: string, active: boolean) => {
    await supabase
      .from("dno_dataset_registry")
      .update({ active, updated_at: new Date().toISOString() })
      .eq("id", entryId);
    queryClient.invalidateQueries({ queryKey: ["dno-dataset-registry", selectedDno] });
  };

  // Active+linked datasets for "Sync All"
  const activeLinkedDatasets = datasets.filter(d => d.active && d.linked_layer_id);

  // ── Sync All Active ──
  const handleSyncAll = async () => {
    setSyncAllRunning(true);
    // Filter out non-geospatial datasets linked to spatial layers
    const syncable = activeLinkedDatasets.filter(ds => ds.is_geospatial);
    const skippedTabular = activeLinkedDatasets.length - syncable.length;
    if (skippedTabular > 0) {
      toast.info(`Skipping ${skippedTabular} tabular dataset(s) — no geometry to ingest`);
    }

    let successCount = 0;
    let failCount = 0;
    // Sequential processing with delay to avoid overwhelming the database
    for (const ds of syncable) {
      try {
        await handleIngest(ds, "export");
        successCount++;
        // Wait 2s between datasets to avoid 502s from concurrent load
        await new Promise(r => setTimeout(r, 2000));
      } catch {
        failCount++;
      }
    }
    toast.success(`Sync All complete: ${successCount} started, ${failCount} failed`);
    setSyncAllRunning(false);
    queryClient.invalidateQueries({ queryKey: ["dno-dataset-registry", selectedDno] });
  };

  // Filtering
  const filtered = datasets.filter(ds => {
    if (search && !ds.title.toLowerCase().includes(search.toLowerCase()) &&
      !ds.dataset_id.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterGeo === "geo" && !ds.is_geospatial) return false;
    if (filterGeo === "tabular" && ds.is_geospatial) return false;
    return true;
  });

  // Stats
  const totalDatasets = datasets.length;
  const geoDatasets = datasets.filter(d => d.is_geospatial).length;
  const activeDatasets = datasets.filter(d => d.active).length;
  const syncedDatasets = datasets.filter(d => d.last_sync_status === "success").length;
  const failedDatasets = datasets.filter(d => d.last_sync_status === "error").length;
  const totalRows = datasets.reduce((sum, d) => sum + (d.last_sync_rows || 0), 0);

  return (
    <div className="space-y-4">
      {/* Summary Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <StatCard icon={<Database className="h-4 w-4" />} label="Total Datasets" value={totalDatasets} />
        <StatCard icon={<MapPin className="h-4 w-4" />} label="Geospatial" value={geoDatasets} />
        <StatCard icon={<Radar className="h-4 w-4" />} label="Active" value={activeDatasets} />
        <StatCard icon={<CheckCircle className="h-4 w-4" />} label="Synced" value={syncedDatasets} />
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Failed" value={failedDatasets} variant="destructive" />
        <StatCard icon={<FileSpreadsheet className="h-4 w-4" />} label="Total Rows" value={totalRows.toLocaleString()} />
      </div>

      {/* Controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Globe className="h-5 w-5" />
                  {dnoConfig[selectedDno].label} Dataset Registry
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  Auto-discovered from {dnoConfig[selectedDno].portalUrl} — Explore API v2.1
                </CardDescription>
              </div>
              <Select value={selectedDno} onValueChange={(v: any) => setSelectedDno(v)}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(dnoConfig).map(([key, cfg]) => (
                    <SelectItem key={key} value={key} className="text-xs">{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCrawl} disabled={crawling} size="sm">
                {crawling ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Radar className="h-4 w-4 mr-1" />}
                {crawling ? "Crawling…" : "Discover All Datasets"}
              </Button>
              <Button
                onClick={handleSyncAll}
                disabled={syncAllRunning || activeLinkedDatasets.length === 0}
                size="sm"
                variant="outline"
              >
                {syncAllRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                {syncAllRunning ? "Syncing…" : `Sync All Active (${activeLinkedDatasets.length})`}
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
              {filtered.length} of {totalDatasets} datasets
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Dataset Table */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
            Loading registry…
          </CardContent>
        </Card>
      ) : totalDatasets === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Globe className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No datasets discovered yet.</p>
            <p className="text-xs mt-1">Click "Discover All Datasets" to crawl the NPG portal.</p>
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
                {filtered.map(ds => {
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
                            {(() => {
                              const linkedLayer = ds.linked_layer_id ? layers.find(l => l.id === ds.linked_layer_id) : null;
                              const hasMismatch = linkedLayer && ds.storage_table && linkedLayer.storage_table !== ds.storage_table;
                              return (
                                <div className="space-y-0.5">
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
                                  {hasMismatch && (
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-400">
                                          <AlertTriangle className="h-2 w-2 mr-0.5" />
                                          Table mismatch
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent className="max-w-xs text-xs">
                                        Dataset suggests <strong>{ds.storage_table}</strong> but layer uses <strong>{linkedLayer?.storage_table}</strong>. Ingest uses the layer's table.
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                  {!ds.is_geospatial && ds.linked_layer_id && (
                                    <Badge variant="outline" className="text-[9px] text-blue-600 border-blue-400">
                                      Enrichment only
                                    </Badge>
                                  )}
                                </div>
                              );
                            })()}
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
                                  <TooltipContent>View on NPG Portal</TooltipContent>
                                </Tooltip>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-[10px]"
                                disabled={isSyncing || !ds.linked_layer_id}
                                onClick={() => handleIngest(ds, "export")}
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
                              <DatasetDetail ds={ds} onIngest={handleIngest} isSyncing={isSyncing} />
                            </TableCell>
                          </TableRow>
                        </CollapsibleContent>
                      </>
                    </Collapsible>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Sub-components ──

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

function DatasetDetail({ ds, onIngest, isSyncing }: { ds: DatasetEntry; onIngest: (ds: DatasetEntry, mode: "export" | "records") => void; isSyncing: boolean }) {
  const fields = Array.isArray(ds.fields_json) ? ds.fields_json : [];

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

      {/* Fields */}
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

      {/* Ingest controls */}
      <div className="flex gap-2">
        <Button
          size="sm" variant="outline" className="h-7 text-xs"
          disabled={isSyncing || !ds.linked_layer_id}
          onClick={() => onIngest(ds, "export")}
        >
          <Download className="h-3 w-3 mr-1" />
          Full Export Ingest
        </Button>
        <Button
          size="sm" variant="outline" className="h-7 text-xs"
          disabled={isSyncing || !ds.linked_layer_id}
          onClick={() => onIngest(ds, "records")}
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Records (Paginated)
        </Button>
      </div>
    </div>
  );
}
