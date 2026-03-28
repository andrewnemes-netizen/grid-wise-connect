import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, CheckCircle, XCircle, AlertCircle, Loader2, Database, Globe } from "lucide-react";
import { Progress } from "@/components/ui/progress";

interface DatasetDef {
  key: string;
  label: string;
  dataset_id: string;
  storage_table: string;
  geometry_type: string;
  expected_records: number;
}

interface DnoDef {
  key: string;
  label: string;
  base_url: string;
  status: "live" | "auth_required" | "blocked";
  datasets: DatasetDef[];
}

const DNO_REGISTRY: DnoDef[] = [
  {
    key: "NPG",
    label: "Northern Powergrid",
    base_url: "https://northernpowergrid.opendatasoft.com",
    status: "live",
    datasets: [
      { key: "primary_substations", label: "Primary Substations + Utilisation", dataset_id: "heatmapdatatable", storage_table: "geo_substations", geometry_type: "Point", expected_records: 670 },
      { key: "supply_areas", label: "Supply Area Polygons", dataset_id: "heatmapsubstationareas", storage_table: "geo_polygons", geometry_type: "MultiPolygon", expected_records: 683 },
      { key: "ehv_feeders", label: "EHV Feeders", dataset_id: "npg-ehv-feeders", storage_table: "geo_feeders", geometry_type: "LineString", expected_records: 7850 },
      { key: "lv_supports", label: "LV Support Locations", dataset_id: "lv-support-locations", storage_table: "geo_points", geometry_type: "Point", expected_records: 175709 },
    ],
  },
  {
    key: "UKPN",
    label: "UK Power Networks",
    base_url: "https://ukpowernetworks.opendatasoft.com",
    status: "auth_required",
    datasets: [
      { key: "licence_boundaries", label: "Licence Boundaries", dataset_id: "ukpn-licence-boundaries", storage_table: "geo_polygons", geometry_type: "MultiPolygon", expected_records: 3 },
    ],
  },
  {
    key: "NGED",
    label: "National Grid ED",
    base_url: "https://connecteddata.nationalgrid.co.uk",
    status: "blocked",
    datasets: [],
  },
  {
    key: "SPEN",
    label: "SP Energy Networks",
    base_url: "https://opendata.spenergynetworks.co.uk",
    status: "blocked",
    datasets: [],
  },
  {
    key: "ENWL",
    label: "Electricity North West",
    base_url: "https://electricitynorthwest.opendatasoft.com",
    status: "live",
    datasets: [],
  },
  {
    key: "SSEN",
    label: "Scottish & Southern",
    base_url: "https://data.ssen.co.uk",
    status: "blocked",
    datasets: [],
  },
  {
    key: "DFT",
    label: "DfT Road Traffic",
    base_url: "https://roadtraffic.dft.gov.uk",
    status: "live",
    datasets: [
      { key: "count_points", label: "Traffic Count Points (AADF)", dataset_id: "count-points", storage_table: "geo_points", geometry_type: "Point", expected_records: 23500 },
    ],
  },
  {
    key: "NAPTAN",
    label: "NaPTAN Transport Nodes",
    base_url: "https://naptan.api.dft.gov.uk",
    status: "live",
    datasets: [
      { key: "access_nodes", label: "Bus, Rail, Tram & Ferry Stops", dataset_id: "access-nodes", storage_table: "geo_points", geometry_type: "Point", expected_records: 400000 },
    ],
  },
  {
    key: "STATS19",
    label: "DfT Road Accidents (STATS19)",
    base_url: "https://data.dft.gov.uk",
    status: "live",
    datasets: [
      { key: "collisions", label: "Collision Data (Last 5 Years)", dataset_id: "road-casualty-statistics", storage_table: "geo_points", geometry_type: "Point", expected_records: 650000 },
    ],
  },
];

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  live: { label: "Live", variant: "default" },
  auth_required: { label: "Auth Required", variant: "secondary" },
  blocked: { label: "Blocked", variant: "destructive" },
};

interface SyncState {
  syncing: boolean;
  progress: number;
  result?: { inserted: number; skipped: number; total: number } | null;
  error?: string | null;
}

export function DnoApiSources() {
  const [syncStates, setSyncStates] = useState<Record<string, SyncState>>({});
  const [selectedLayer, setSelectedLayer] = useState<Record<string, string>>({});

  // Fetch existing layers to allow linking
  const { data: layers = [] } = useQuery({
    queryKey: ["admin-layer-registry-for-api"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("layer_registry")
        .select("id, display_name, slug, storage_table, dno, feature_count")
        .order("display_name");
      if (error) throw error;
      return data;
    },
  });

  const getSyncKey = (dno: string, dsKey: string) => `${dno}:${dsKey}`;

  const handleSync = async (dno: DnoDef, ds: DatasetDef) => {
    const syncKey = getSyncKey(dno.key, ds.key);
    const isSelfContained = ["DFT", "NAPTAN", "STATS19"].includes(dno.key);
    const layerId = selectedLayer[syncKey];

    if (!isSelfContained && !layerId) {
      toast.error("Select a target layer first");
      return;
    }

    setSyncStates(prev => ({
      ...prev,
      [syncKey]: { syncing: true, progress: 10, result: null, error: null },
    }));

    try {
      // Refresh session before calling
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      setSyncStates(prev => ({
        ...prev,
        [syncKey]: { ...prev[syncKey], progress: 30 },
      }));

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      
      // Route to appropriate edge function
      const functionMap: Record<string, string> = {
        DFT: "dft-traffic-proxy",
        NAPTAN: "naptan-ingest",
        STATS19: "stats19-ingest",
      };
      const functionName = functionMap[dno.key] || "dno-open-data-ingest";

      // NaPTAN uses chunked auto-chaining
      if (dno.key === "NAPTAN") {
        let offset = 0;
        let totalInserted = 0;
        let chunkNum = 0;

        while (true) {
          chunkNum++;
          setSyncStates(prev => ({
            ...prev,
            [syncKey]: { syncing: true, progress: Math.min(90, 10 + chunkNum * 10), result: null, error: null },
          }));

          const resp = await fetch(
            `https://${projectId}.supabase.co/functions/v1/${functionName}`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ action: "ingest", offset }),
            }
          );

          const result = await resp.json();
          if (!resp.ok) throw new Error(result.error || `HTTP ${resp.status}`);

          totalInserted = result.inserted ?? totalInserted + (result.chunk_inserted ?? 0);
          toast.info(`NaPTAN: ${totalInserted.toLocaleString()} records so far (chunk ${chunkNum})…`);

          if (result.done) {
            setSyncStates(prev => ({
              ...prev,
              [syncKey]: {
                syncing: false,
                progress: 100,
                result: { inserted: totalInserted, skipped: 0, total: totalInserted },
              },
            }));
            toast.success(`NaPTAN complete: ${totalInserted.toLocaleString()} transport nodes ingested`);
            return;
          }

          offset = result.next_offset;
          // Refresh token between chunks
          await supabase.auth.refreshSession();
        }
      }

      const body = isSelfContained
        ? { action: "ingest" }
        : { dno: dno.key, dataset_key: ds.key, layer_id: layerId, batch_size: 100 };

      const resp = await fetch(
        `https://${projectId}.supabase.co/functions/v1/${functionName}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
        }
      );

      const result = await resp.json();

      if (!resp.ok) {
        throw new Error(result.error || `HTTP ${resp.status}`);
      }

      setSyncStates(prev => ({
        ...prev,
        [syncKey]: {
          syncing: false,
          progress: 100,
          result: {
            inserted: result.inserted,
            skipped: result.skipped,
            total: result.total_api_records,
          },
        },
      }));

      toast.success(`Imported ${result.inserted} features from ${dno.label} → ${ds.label}`);
    } catch (err: any) {
      console.error("Sync error:", err);
      setSyncStates(prev => ({
        ...prev,
        [syncKey]: { syncing: false, progress: 0, error: err.message },
      }));
      toast.error(`Sync failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            DNO Open Data API Sources
          </CardTitle>
          <CardDescription>
            Pull live network data from UK DNO open data portals directly into your layer registry.
            All DNOs use the Opendatasoft API framework.
          </CardDescription>
        </CardHeader>
      </Card>

      {DNO_REGISTRY.map((dno) => {
        const statusBadge = STATUS_BADGES[dno.status];
        return (
          <Card key={dno.key}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="text-base">{dno.label}</CardTitle>
                  <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                </div>
                <span className="text-xs text-muted-foreground font-mono">{dno.key}</span>
              </div>
              <CardDescription className="text-xs">{dno.base_url}</CardDescription>
            </CardHeader>
            {dno.datasets.length > 0 ? (
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dataset</TableHead>
                      <TableHead>Records</TableHead>
                      <TableHead>Geometry</TableHead>
                      <TableHead>Target Layer</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dno.datasets.map((ds) => {
                      const syncKey = getSyncKey(dno.key, ds.key);
                      const state = syncStates[syncKey];
                      const compatibleLayers = layers.filter(
                        (l) => l.storage_table === ds.storage_table
                      );

                      return (
                        <TableRow key={ds.key}>
                          <TableCell>
                            <div>
                              <span className="font-medium text-sm">{ds.label}</span>
                              <span className="block text-xs text-muted-foreground font-mono">{ds.dataset_id}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{ds.expected_records.toLocaleString()}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{ds.geometry_type}</Badge>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={selectedLayer[syncKey] || ""}
                              onValueChange={(val) =>
                                setSelectedLayer((prev) => ({ ...prev, [syncKey]: val }))
                              }
                            >
                              <SelectTrigger className="w-[200px] h-8 text-xs">
                                <SelectValue placeholder="Select layer…" />
                              </SelectTrigger>
                              <SelectContent>
                                {compatibleLayers.map((l) => (
                                  <SelectItem key={l.id} value={l.id} className="text-xs">
                                    {l.display_name} ({l.feature_count ?? 0})
                                  </SelectItem>
                                ))}
                                {compatibleLayers.length === 0 && (
                                  <SelectItem value="__none" disabled className="text-xs text-muted-foreground">
                                    No compatible layers ({ds.storage_table})
                                  </SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={state?.syncing || dno.status !== "live" || (!selectedLayer[syncKey] && !["DFT", "NAPTAN", "STATS19"].includes(dno.key))}
                                onClick={() => handleSync(dno, ds)}
                              >
                                {state?.syncing ? (
                                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                                )}
                                {state?.syncing ? "Syncing…" : "Sync Now"}
                              </Button>
                              {state?.syncing && (
                                <Progress value={state.progress} className="w-24 h-1.5" />
                              )}
                              {state?.result && (
                                <span className="text-xs text-primary flex items-center gap-1">
                                  <CheckCircle className="h-3 w-3" />
                                  {state.result.inserted} inserted
                                </span>
                              )}
                              {state?.error && (
                                <span className="text-xs text-destructive flex items-center gap-1">
                                  <XCircle className="h-3 w-3" />
                                  {state.error.slice(0, 50)}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            ) : (
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <AlertCircle className="h-4 w-4" />
                  API access blocked or unavailable — datasets require API key registration or portal has changed.
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}
