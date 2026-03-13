import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Layers, Plus, Upload, Loader2, Trash2, Eraser } from "lucide-react";
import { GeoFileUploader } from "./GeoFileUploader";

const CATEGORIES = ["substations", "feeders", "cables", "constraints", "points", "polygons"];
const GEOMETRY_TYPES = ["Auto-detect", "Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon"];
const STORAGE_TABLES: Record<string, string> = {
  substations: "geo_substations",
  feeders: "geo_feeders",
  cables: "geo_cables",
  constraints: "geo_constraints",
  points: "geo_points",
  polygons: "geo_polygons",
};

export function LayerManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dnoFilter, setDnoFilter] = useState<string>("all");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [uploadLayerId, setUploadLayerId] = useState<string | null>(null);

  const { data: layers = [], isLoading } = useQuery({
    queryKey: ["admin-layers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("layer_registry")
        .select("*")
        .order("dno")
        .order("category")
        .order("display_name");
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const dnos = [...new Set(layers.map((l) => l.dno))].sort();

  const filtered = layers.filter((l) => {
    if (dnoFilter !== "all" && l.dno !== dnoFilter) return false;
    if (catFilter !== "all" && l.category !== catFilter) return false;
    return true;
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("layer_registry")
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Only refetch if the upload dialog is NOT open — refetching while
      // uploading causes the dialog to unmount and the user sees a "crash"
      if (!uploadLayerId) {
        queryClient.invalidateQueries({ queryKey: ["admin-layers"] });
      }
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("layer_registry").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-layers"] });
      toast({ title: "Layer deleted" });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">DNO</Label>
          <Select value={dnoFilter} onValueChange={setDnoFilter}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All DNOs</SelectItem>
              {dnos.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Category</Label>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus className="mr-1.5 h-3.5 w-3.5" />Add Layer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Register New Layer</DialogTitle>
              </DialogHeader>
              <AddLayerForm
                onSuccess={() => {
                  setAddOpen(false);
                  queryClient.invalidateQueries({ queryKey: ["admin-layers"] });
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Layer table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Layer</TableHead>
                <TableHead>DNO</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Features</TableHead>
                <TableHead>Enabled</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No layers found</TableCell>
                </TableRow>
              ) : (
                filtered.map((layer) => (
                  <TableRow key={layer.id}>
                    <TableCell>
                      <div>
                        <span className="font-medium text-sm">{layer.display_name}</span>
                        <p className="text-[10px] text-muted-foreground">{layer.slug}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px]">{layer.dno}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="capitalize text-[10px]">{layer.category}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {(layer.feature_count ?? 0).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={layer.enabled ?? true}
                        onCheckedChange={(checked) => toggleMut.mutate({ id: layer.id, enabled: checked })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => setUploadLayerId(layer.id)}
                        >
                          <Upload className="h-3 w-3 mr-1" />Upload
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Delete "${layer.display_name}"? This won't delete the features.`)) {
                              deleteMut.mutate(layer.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Upload dialog */}
      <Dialog open={!!uploadLayerId} onOpenChange={(open) => { if (!open) setUploadLayerId(null); }}>
        <DialogContent
          className="max-w-lg"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Upload Features</DialogTitle>
          </DialogHeader>
          {uploadLayerId && (() => {
            const layer = layers.find((l) => l.id === uploadLayerId);
            if (!layer) return <p className="text-sm text-muted-foreground">Loading layer…</p>;
            return (
              <GeoFileUploader
                key={uploadLayerId}
                layerId={uploadLayerId}
                layer={layer}
                onComplete={() => {
                  setUploadLayerId(null);
                  queryClient.invalidateQueries({ queryKey: ["admin-layers"] });
                }}
              />
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddLayerForm({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    display_name: "",
    slug: "",
    dno: "NPG",
    category: "substations",
    geometry_type: "Auto-detect",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.display_name || !form.slug) return;

    setSubmitting(true);
    try {
      const storageTable = STORAGE_TABLES[form.category] || "geo_points";
      const geometryType = form.geometry_type === "Auto-detect" ? "Geometry" : form.geometry_type;
      const { error } = await supabase.from("layer_registry").insert({
        display_name: form.display_name,
        slug: form.slug,
        dno: form.dno,
        category: form.category,
        geometry_type: geometryType,
        storage_table: storageTable,
        style_json: {},
        legend_json: [],
      });
      if (error) throw error;
      toast({ title: "Layer registered" });
      onSuccess();
    } catch (err: any) {
      toast({ title: "Failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Display Name</Label>
        <Input
          className="h-8 text-sm"
          value={form.display_name}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              display_name: e.target.value,
              slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
            }))
          }
          placeholder="e.g. HV Feeders (33kV)"
          required
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Slug</Label>
        <Input
          className="h-8 text-sm font-mono"
          value={form.slug}
          onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
          placeholder="auto-generated"
          required
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">DNO</Label>
          <Input
            className="h-8 text-sm"
            value={form.dno}
            onChange={(e) => setForm((f) => ({ ...f, dno: e.target.value }))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Category</Label>
          <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Geometry</Label>
          <Select value={form.geometry_type} onValueChange={(v) => setForm((f) => ({ ...f, geometry_type: v }))}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GEOMETRY_TYPES.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Register Layer
      </Button>
    </form>
  );
}
