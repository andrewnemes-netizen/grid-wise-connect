import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { HardDrive, RefreshCw, Play, Loader2 } from "lucide-react";

type Layer = {
  region: "SEPD" | "SHEPD";
  base: string;
  size_bytes: number;
  is_annotation: boolean;
  files: Record<string, { id: string; size: number }>;
};

export function SsenDriveIngest() {
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { features?: number; error?: string }>>({});

  const layersQ = useQuery({
    queryKey: ["ssen-drive-layers"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ssen-drive-ingest", { body: { action: "list" } });
      if (error) throw error;
      return (data?.layers || []) as Layer[];
    },
  });

  const registryQ = useQuery({
    queryKey: ["ssen-drive-registry"],
    queryFn: async () => {
      const { data } = await supabase
        .from("layer_registry")
        .select("slug, feature_count, bbox")
        .eq("source_type", "drive_shapefile");
      return new Map((data || []).map((r: any) => [r.slug, r]));
    },
  });

  const runSync = async () => {
    setBusy("sync");
    try {
      const { data, error } = await supabase.functions.invoke("ssen-drive-ingest", { body: { action: "sync-registry" } });
      if (error) throw error;
      toast.success(`Registry synced: ${data.synced} new layer(s)`);
      registryQ.refetch();
    } catch (e: any) {
      toast.error(`Sync failed: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const runIngest = async (layer: Layer) => {
    const key = `${layer.region}/${layer.base}`;
    setBusy(key);
    try {
      // Kick off background ingest; the edge function returns immediately.
      const { data, error } = await supabase.functions.invoke("ssen-drive-ingest", {
        body: { action: "ingest", region: layer.region, layer_base: layer.base },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Poll layer_registry.feature_count until it stops growing.
      const slug = `ssen-drive-${layer.base}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      let last = -1;
      let stableTicks = 0;
      let total = 0;
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 2500));
        const { data: reg } = await supabase
          .from("layer_registry")
          .select("feature_count")
          .eq("slug", slug)
          .maybeSingle();
        total = reg?.feature_count ?? 0;
        setResults((r) => ({ ...r, [key]: { features: total } }));
        if (total === last) {
          stableTicks++;
          if (stableTicks >= 3 && total > 0) break; // ~7.5s no change ⇒ done
        } else {
          stableTicks = 0;
          last = total;
        }
      }
      toast.success(`${layer.base}: ${total.toLocaleString()} features ingested`);
      registryQ.refetch();
    } catch (e: any) {
      setResults((r) => ({ ...r, [key]: { error: e.message } }));
      toast.error(`${layer.base}: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const ingestAll = async (region: "SEPD" | "SHEPD") => {
    const layers = (layersQ.data || []).filter((l) => l.region === region);
    if (layers.length === 0) return;
    // Ensure every layer has a layer_registry row before ingesting so the
    // per-layer poller can find it. Safe to call repeatedly — it's idempotent.
    setBusy("sync");
    try {
      await supabase.functions.invoke("ssen-drive-ingest", { body: { action: "sync-registry" } });
      await registryQ.refetch();
    } catch (e: any) {
      toast.error(`Registry sync failed: ${e.message}`);
      setBusy(null);
      return;
    }
    setBusy(null);
    for (const layer of layers) {
      await runIngest(layer);
    }
  };

  const layers = layersQ.data || [];
  const registry = registryQ.data || new Map();

  const renderRegion = (region: "SEPD" | "SHEPD") => {
    const rows = layers.filter((l) => l.region === region);
    if (rows.length === 0) {
      return <div className="p-6 text-sm text-muted-foreground text-center">No layers discovered</div>;
    }
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {rows.length} layers ({rows.filter((r) => r.is_annotation).length} annotation)
          </div>
          <Button size="sm" variant="secondary" onClick={() => ingestAll(region)} disabled={!!busy}>
            <Play className="h-3.5 w-3.5 mr-1.5" /> Ingest all {region}
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Layer</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((layer) => {
              const key = `${layer.region}/${layer.base}`;
              const slug = `ssen-drive-${layer.base}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
              const reg = registry.get(slug);
              const res = results[key];
              const isBusy = busy === key;
              return (
                <TableRow key={key}>
                  <TableCell className="font-mono text-xs">
                    {layer.base}
                    {layer.is_annotation && <Badge variant="outline" className="ml-2">annotation</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {(layer.size_bytes / 1024).toFixed(0)} KB
                  </TableCell>
                  <TableCell>
                    {res?.error ? (
                      <Badge variant="destructive">error</Badge>
                    ) : reg?.feature_count ? (
                      <Badge variant="default">{reg.feature_count.toLocaleString()} features</Badge>
                    ) : reg ? (
                      <Badge variant="secondary">registered</Badge>
                    ) : (
                      <Badge variant="outline">not synced</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!busy}
                      onClick={() => runIngest(layer)}
                    >
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDrive className="h-4 w-4" /> SSEN Google Drive shapefile ingest
        </CardTitle>
        <Button size="sm" onClick={runSync} disabled={!!busy}>
          {busy === "sync" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Sync registry
        </Button>
      </CardHeader>
      <CardContent>
        {layersQ.isLoading ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Listing Drive folders…
          </div>
        ) : layersQ.error ? (
          <div className="p-4 text-sm text-destructive">Error: {(layersQ.error as Error).message}</div>
        ) : (
          <Tabs defaultValue="SEPD">
            <TabsList>
              <TabsTrigger value="SEPD">SEPD (South England)</TabsTrigger>
              <TabsTrigger value="SHEPD">SHEPD (North Scotland)</TabsTrigger>
            </TabsList>
            <TabsContent value="SEPD" className="mt-4">{renderRegion("SEPD")}</TabsContent>
            <TabsContent value="SHEPD" className="mt-4">{renderRegion("SHEPD")}</TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}