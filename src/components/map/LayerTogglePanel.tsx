import { useState, useEffect, useMemo } from "react";
import { Layers, ChevronDown, ChevronRight, Flame, Loader2, TreePine, Zap, Landmark, Compass, Crosshair } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { PlanningDataset } from "@/hooks/usePlanningLayers";
import type { LandRegistryDataset } from "@/hooks/useLandRegistryLayers";
import type { OsOpenDataset } from "@/hooks/useOsOpenLayers";
import { OS_CATEGORY_COLORS, OS_UTILISATION_COLORS, getOsLayerColor } from "@/lib/osGeoDataVizPalette";

export interface RegistryLayer {
  id: string;
  slug: string;
  display_name: string;
  dno: string;
  category: string;
  storage_table: string;
  geometry_type: string;
  style_json: any;
  legend_json: any;
  feature_count: number;
  enabled: boolean;
  visible_by_default: boolean;
  min_zoom: number;
  max_zoom: number;
  bbox: [number, number, number, number] | null;
  source_type: string;
}

export interface LayerVisibility {
  [layerId: string]: boolean;
}

interface LayerTogglePanelProps {
  visibility: LayerVisibility;
  onToggle: (layerId: string, visible: boolean) => void;
  onGoToCoverage?: (layerId: string) => void;
  heatmapMode?: boolean;
  onHeatmapToggle?: (enabled: boolean) => void;
  registryLayers: RegistryLayer[];
  loadingLayers: Set<string>;
  selectedDno?: string | null;
  onDnoChange?: (dno: string | null) => void;
  // Planning layers
  planningDatasets?: PlanningDataset[];
  planningVisibility?: Record<string, boolean>;
  planningLoading?: Set<string>;
  onPlanningToggle?: (datasetId: string, visible: boolean) => void;
  // Land Registry layers
  lrDatasets?: LandRegistryDataset[];
  lrVisibility?: Record<string, boolean>;
  lrLoading?: Set<string>;
  onLrToggle?: (datasetId: string, visible: boolean) => void;
  // OS Open layers
  osDatasets?: OsOpenDataset[];
  osVisibility?: Record<string, boolean>;
  osLoading?: Set<string>;
  osFeatureCounts?: Record<string, number>;
  onOsToggle?: (datasetId: string, visible: boolean) => void;
}

// Use OS GeoDataViz palette (re-exported for backward compatibility)
const CATEGORY_COLORS = OS_CATEGORY_COLORS;

export function getLayerColor(layer: RegistryLayer, index: number): string {
  const style = layer.style_json as any;
  if (style?.color) return style.color;
  if (style?.paint?.["circle-color"] && typeof style.paint["circle-color"] === "string") return style.paint["circle-color"];
  if (style?.paint?.["line-color"] && typeof style.paint["line-color"] === "string") return style.paint["line-color"];

  return getOsLayerColor(layer.category, index);
}

export function isUtilisationLayer(layer: RegistryLayer): boolean {
  return layer.slug === "npg_hv_substations_utilisation" || layer.category === "substations";
}

export function useRegistryLayers() {
  const [layers, setLayers] = useState<RegistryLayer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase
        .from("layer_registry")
        .select("id, slug, display_name, dno, category, storage_table, geometry_type, style_json, legend_json, feature_count, enabled, visible_by_default, min_zoom, max_zoom, bbox, source_type")
        .eq("enabled", true)
        .order("dno")
        .order("category")
        .order("display_name");
      if (error) {
        console.error("Failed to load layer registry:", error);
      } else {
        setLayers((data as RegistryLayer[]) || []);
      }
      setLoading(false);
    }
    fetch();
  }, []);

  return { registryLayers: layers, registryLoading: loading };
}

/* ── Shared layer row ──────────────────────────────────────── */
function LayerRow({
  layer,
  idx,
  visibility,
  loadingLayers,
  onToggle,
  onGoToCoverage,
  heatmapMode,
  onHeatmapToggle,
}: {
  layer: RegistryLayer;
  idx: number;
  visibility: LayerVisibility;
  loadingLayers: Set<string>;
  onToggle: (id: string, v: boolean) => void;
  onGoToCoverage?: (id: string) => void;
  heatmapMode?: boolean;
  onHeatmapToggle?: (v: boolean) => void;
}) {
  const color = getLayerColor(layer, idx);
  const isVisible = visibility[layer.id] ?? false;
  const isLoading = loadingLayers.has(layer.id);
  const isUtilLayer = layer.slug === "npg_hv_substations_utilisation";

  const isEmpty = !layer.feature_count || layer.feature_count === 0;
  const hasCoverageBbox = Array.isArray(layer.bbox) && layer.bbox.length === 4;

  return (
    <div className={`space-y-0.5 pl-4 ${isEmpty ? "opacity-50" : ""}`}>
      <div className="flex items-center justify-between gap-2 py-0.5">
        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto scrollbar-none">
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
          ) : (
            <div className="h-3 w-3 rounded-sm shrink-0 border border-border" style={{ backgroundColor: color }} />
          )}
          <Label htmlFor={`layer-${layer.id}`} className="text-xs font-normal whitespace-nowrap cursor-pointer">
            {layer.display_name}
          </Label>
          {isEmpty ? (
            <Badge variant="outline" className="text-[8px] h-3.5 px-1 shrink-0 text-muted-foreground border-dashed">
              No data
            </Badge>
          ) : (
            <span className="text-[9px] text-muted-foreground tabular-nums shrink-0">
              {layer.feature_count > 999 ? `${(layer.feature_count / 1000).toFixed(1)}k` : layer.feature_count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onGoToCoverage && hasCoverageBbox && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => onGoToCoverage(layer.id)}
                >
                  <Crosshair className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Go to coverage area</TooltipContent>
            </Tooltip>
          )}
          <Switch
            id={`layer-${layer.id}`}
            checked={isVisible}
            onCheckedChange={(checked) => onToggle(layer.id, checked)}
            className="scale-75 shrink-0"
          />
        </div>
      </div>
      {isUtilLayer && isVisible && onHeatmapToggle && (
        <div className="flex items-center gap-1.5 pl-5 pb-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant={heatmapMode ? "default" : "outline"} className="h-6 px-2 text-[10px] gap-1" onClick={() => onHeatmapToggle(!heatmapMode)}>
                <Flame className="h-3 w-3" />
                Heatmap
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Toggle heatmap view weighted by utilisation %</TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

/* ── Category group ────────────────────────────────────────── */
function CategoryGroup({
  groupKey,
  category,
  layers,
  collapsedGroups,
  toggleGroup,
  visibility,
  loadingLayers,
  onToggle,
  onGoToCoverage,
  heatmapMode,
  onHeatmapToggle,
}: {
  groupKey: string;
  category: string;
  layers: RegistryLayer[];
  collapsedGroups: Set<string>;
  toggleGroup: (key: string) => void;
  visibility: LayerVisibility;
  loadingLayers: Set<string>;
  onToggle: (id: string, v: boolean) => void;
  onGoToCoverage?: (id: string) => void;
  heatmapMode?: boolean;
  onHeatmapToggle?: (v: boolean) => void;
}) {
  const isCollapsed = collapsedGroups.has(groupKey);

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => toggleGroup(groupKey)}
        className="flex items-center gap-1.5 w-full px-1 py-1 text-left hover:bg-accent/30 rounded transition-colors"
      >
        {isCollapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground capitalize">{category.replace(/_/g, " ")}</span>
        <span className="text-[9px] text-muted-foreground ml-auto">{layers.length}</span>
      </button>
      {!isCollapsed &&
        layers.map((layer, idx) => (
          <LayerRow
            key={layer.id}
            layer={layer}
            idx={idx}
            visibility={visibility}
            loadingLayers={loadingLayers}
            onToggle={onToggle}
            onGoToCoverage={onGoToCoverage}
            heatmapMode={heatmapMode}
            onHeatmapToggle={onHeatmapToggle}
          />
        ))}
    </div>
  );
}

/* ── Main Panel ────────────────────────────────────────────── */
export function LayerTogglePanel({
  visibility,
  onToggle,
  onGoToCoverage,
  heatmapMode,
  onHeatmapToggle,
  registryLayers,
  loadingLayers,
  selectedDno,
  onDnoChange,
  planningDatasets = [],
  planningVisibility = {},
  planningLoading = new Set(),
  onPlanningToggle,
  lrDatasets = [],
  lrVisibility = {},
  lrLoading = new Set(),
  onLrToggle,
  osDatasets = [],
  osVisibility = {},
  osLoading = new Set(),
  osFeatureCounts = {},
  onOsToggle,
}: LayerTogglePanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("network");

  // DNO list
  const [dnoList, setDnoList] = useState<string[]>([]);
  useEffect(() => {
    async function fetchDnos() {
      const { data: layer } = await supabase.from("layer_registry").select("id").eq("slug", "gb_dno_licence_areas").single();
      if (!layer) {
        const dnos = new Set(registryLayers.map((l) => l.dno));
        setDnoList(Array.from(dnos).sort());
        return;
      }
      const { data: rows } = await supabase.from("geo_polygons").select("name").eq("layer_id", layer.id).not("name", "is", null);
      if (rows) setDnoList(Array.from(new Set(rows.map((r: any) => r.name as string))).sort());
    }
    fetchDnos();
  }, [registryLayers]);

  // Gas operator codes
  const GAS_OPERATORS = new Set(["CADENT", "NGN", "SGN", "WWU"]);

  // Network tree (exclude gas operators)
  const networkTree = useMemo(() => {
    const filtered = (selectedDno ? registryLayers.filter((l) => l.dno === selectedDno) : registryLayers)
      .filter((l) => !GAS_OPERATORS.has(l.dno));
    const dnoMap = new Map<string, Map<string, RegistryLayer[]>>();
    filtered.forEach((layer) => {
      if (!dnoMap.has(layer.dno)) dnoMap.set(layer.dno, new Map());
      const catMap = dnoMap.get(layer.dno)!;
      if (!catMap.has(layer.category)) catMap.set(layer.category, []);
      catMap.get(layer.category)!.push(layer);
    });
    return dnoMap;
  }, [registryLayers, selectedDno]);

  // Gas tree
  const gasTree = useMemo(() => {
    const gasLayers = registryLayers.filter((l) => GAS_OPERATORS.has(l.dno));
    const dnoMap = new Map<string, Map<string, RegistryLayer[]>>();
    gasLayers.forEach((layer) => {
      if (!dnoMap.has(layer.dno)) dnoMap.set(layer.dno, new Map());
      const catMap = dnoMap.get(layer.dno)!;
      if (!catMap.has(layer.category)) catMap.set(layer.category, []);
      catMap.get(layer.category)!.push(layer);
    });
    return dnoMap;
  }, [registryLayers]);

  // Planning tree by category
  const planningTree = useMemo(() => {
    const catMap = new Map<string, PlanningDataset[]>();
    planningDatasets.forEach((ds) => {
      if (!catMap.has(ds.category)) catMap.set(ds.category, []);
      catMap.get(ds.category)!.push(ds);
    });
    return catMap;
  }, [planningDatasets]);

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const lrVisibleCount = Object.values(lrVisibility).filter(Boolean).length;
  const osVisibleCount = Object.values(osVisibility).filter(Boolean).length;
  const visibleCount = Object.values(visibility).filter(Boolean).length + Object.values(planningVisibility).filter(Boolean).length + lrVisibleCount + osVisibleCount;
  const networkVisibleCount = Object.values(visibility).filter(Boolean).length;
  const planningVisibleCount = Object.values(planningVisibility).filter(Boolean).length;

  return (
    <div className="absolute top-3 right-14 z-10 w-72">
      <div className="rounded-lg border bg-background/95 backdrop-blur shadow-lg overflow-hidden">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-accent/50 transition-colors"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Layers className="h-4 w-4 text-primary" />
            Map Layers
            {visibleCount > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{visibleCount}</Badge>}
          </div>
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </button>

        {expanded && (
          <div className="border-t">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-full h-8 rounded-none border-b bg-muted/50 grid grid-cols-5">
                <TabsTrigger value="network" className="text-[10px] h-7 gap-0.5 data-[state=active]:bg-background px-1">
                  <Zap className="h-3 w-3" />
                  Network
                  {networkVisibleCount > 0 && <Badge variant="secondary" className="text-[9px] h-3.5 px-1 ml-0.5">{networkVisibleCount}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="gas" className="text-[10px] h-7 gap-0.5 data-[state=active]:bg-background px-1">
                  <Flame className="h-3 w-3" />
                  Gas
                </TabsTrigger>
                <TabsTrigger value="osopen" className="text-[10px] h-7 gap-0.5 data-[state=active]:bg-background px-1">
                  <Compass className="h-3 w-3" />
                  OS Open
                  {osVisibleCount > 0 && <Badge variant="secondary" className="text-[9px] h-3.5 px-1 ml-0.5">{osVisibleCount}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="planning" className="text-[10px] h-7 gap-0.5 data-[state=active]:bg-background px-1">
                  <TreePine className="h-3 w-3" />
                  Planning
                  {planningVisibleCount > 0 && <Badge variant="secondary" className="text-[9px] h-3.5 px-1 ml-0.5">{planningVisibleCount}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="landregistry" className="text-[10px] h-7 gap-0.5 data-[state=active]:bg-background px-1">
                  <Landmark className="h-3 w-3" />
                  Land Reg
                  {lrVisibleCount > 0 && <Badge variant="secondary" className="text-[9px] h-3.5 px-1 ml-0.5">{lrVisibleCount}</Badge>}
                </TabsTrigger>
              </TabsList>

              {/* Network Tab */}
              <TabsContent value="network" className="mt-0 px-2 py-2 space-y-1 max-h-[55vh] overflow-y-auto">
                {dnoList.length > 1 && onDnoChange && (
                  <div className="pb-1.5 mb-1 border-b">
                    <Select value={selectedDno || "all"} onValueChange={(v) => onDnoChange(v === "all" ? null : v)}>
                      <SelectTrigger className="h-7 text-xs">
                        <SelectValue placeholder="All DNOs" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All DNOs</SelectItem>
                        {dnoList.map((dno) => (
                          <SelectItem key={dno} value={dno}>{dno}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {Array.from(networkTree.entries()).map(([dno, catMap]) => (
                  <div key={dno} className="space-y-0.5">
                    {networkTree.size > 1 && (
                      <div className="flex items-center gap-1.5 px-1 pt-1">
                        <Badge variant="outline" className="text-[9px] font-semibold">{dno}</Badge>
                      </div>
                    )}
                    {Array.from(catMap.entries()).map(([category, catLayers]) => (
                      <CategoryGroup
                        key={`${dno}:${category}`}
                        groupKey={`${dno}:${category}`}
                        category={category}
                        layers={catLayers}
                        collapsedGroups={collapsedGroups}
                        toggleGroup={toggleGroup}
                        visibility={visibility}
                        loadingLayers={loadingLayers}
                        onToggle={onToggle}
                        onGoToCoverage={onGoToCoverage}
                        heatmapMode={heatmapMode}
                        onHeatmapToggle={onHeatmapToggle}
                      />
                    ))}
                  </div>
                ))}
                {registryLayers.length === 0 && <p className="text-[11px] text-muted-foreground px-1 py-2">No network layers available.</p>}
                <div className="pt-1.5 border-t mt-1">
                  <p className="text-[10px] text-muted-foreground px-1">Layers auto-refresh as you pan the map. Click features for details.</p>
                </div>
              </TabsContent>

              {/* Gas Tab */}
              <TabsContent value="gas" className="mt-0 px-2 py-2 space-y-1 max-h-[55vh] overflow-y-auto">
                {gasTree.size === 0 ? (
                  <div className="py-4 text-center space-y-1.5">
                    <Flame className="h-6 w-6 text-muted-foreground mx-auto" />
                    <p className="text-[11px] text-muted-foreground">No gas network layers available.</p>
                    <p className="text-[10px] text-muted-foreground">Discover Cadent datasets in Admin → Gas Registry.</p>
                  </div>
                ) : (
                  Array.from(gasTree.entries()).map(([dno, catMap]) => (
                    <div key={dno} className="space-y-0.5">
                      {gasTree.size > 1 && (
                        <div className="flex items-center gap-1.5 px-1 pt-1">
                          <Badge variant="outline" className="text-[9px] font-semibold">{dno}</Badge>
                        </div>
                      )}
                      {Array.from(catMap.entries()).map(([category, catLayers]) => (
                        <CategoryGroup
                          key={`gas:${dno}:${category}`}
                          groupKey={`gas:${dno}:${category}`}
                          category={category}
                          layers={catLayers}
                          collapsedGroups={collapsedGroups}
                          toggleGroup={toggleGroup}
                          visibility={visibility}
                          loadingLayers={loadingLayers}
                          onToggle={onToggle}
                          onGoToCoverage={onGoToCoverage}
                        />
                      ))}
                    </div>
                  ))
                )}
              </TabsContent>

              {/* Planning Tab */}
              <TabsContent value="planning" className="mt-0 px-2 py-2 space-y-1 max-h-[55vh] overflow-y-auto">
                {planningDatasets.length === 0 ? (
                  <div className="py-4 text-center space-y-1.5">
                    <TreePine className="h-6 w-6 text-muted-foreground mx-auto" />
                    <p className="text-[11px] text-muted-foreground">No planning layers configured.</p>
                  </div>
                ) : (
                  Array.from(planningTree.entries()).map(([category, datasets]) => {
                    const groupKey = `planning:${category}`;
                    const isCollapsed = collapsedGroups.has(groupKey);

                    return (
                      <div key={groupKey} className="space-y-0.5">
                        <button
                          onClick={() => toggleGroup(groupKey)}
                          className="flex items-center gap-1.5 w-full px-1 py-1 text-left hover:bg-accent/30 rounded transition-colors"
                        >
                          {isCollapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground capitalize">{category}</span>
                          <span className="text-[9px] text-muted-foreground ml-auto">{datasets.length}</span>
                        </button>

                        {!isCollapsed &&
                          datasets.map((ds) => {
                            const isVisible = planningVisibility[ds.id] ?? false;
                            const isLoading = planningLoading.has(ds.id);

                            return (
                              <div key={ds.id} className="space-y-0.5 pl-4">
                                <div className="flex items-center justify-between gap-2 py-0.5">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {isLoading ? (
                                      <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
                                    ) : (
                                      <div className="h-3 w-3 rounded-sm shrink-0 border border-border" style={{ backgroundColor: ds.color }} />
                                    )}
                                    <Label htmlFor={`planning-${ds.id}`} className="text-xs font-normal whitespace-nowrap cursor-pointer">
                                      {ds.label}
                                    </Label>
                                  </div>
                                  <Switch
                                    id={`planning-${ds.id}`}
                                    checked={isVisible}
                                    onCheckedChange={(checked) => onPlanningToggle?.(ds.id, checked)}
                                    className="scale-75 shrink-0"
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    );
                  })
                )}
                <div className="pt-1.5 border-t mt-1">
                  <p className="text-[10px] text-muted-foreground px-1">
                    Data from planning.data.gov.uk — fetched live for your map location.
                  </p>
                </div>
              </TabsContent>

              {/* OS Open Tab */}
              <TabsContent value="osopen" className="mt-0 px-2 py-2 space-y-1 max-h-[55vh] overflow-y-auto">
                {(() => {
                  const osCatMap = new Map<string, OsOpenDataset[]>();
                  osDatasets.forEach((ds) => {
                    if (!osCatMap.has(ds.category)) osCatMap.set(ds.category, []);
                    osCatMap.get(ds.category)!.push(ds);
                  });

                  return osDatasets.length === 0 ? (
                    <div className="py-4 text-center space-y-1.5">
                      <Compass className="h-6 w-6 text-muted-foreground mx-auto" />
                      <p className="text-[11px] text-muted-foreground">No OS Open layers available.</p>
                    </div>
                  ) : (
                    Array.from(osCatMap.entries()).map(([category, datasets]) => {
                      const groupKey = `osopen:${category}`;
                      const isCollapsed = collapsedGroups.has(groupKey);

                      return (
                        <div key={groupKey} className="space-y-0.5">
                          <button
                            onClick={() => toggleGroup(groupKey)}
                            className="flex items-center gap-1.5 w-full px-1 py-1 text-left hover:bg-accent/30 rounded transition-colors"
                          >
                            {isCollapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />}
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground capitalize">{category}</span>
                            <span className="text-[9px] text-muted-foreground ml-auto">{datasets.length}</span>
                          </button>

                          {!isCollapsed &&
                            datasets.map((ds) => {
                              const isVisible = osVisibility[ds.id] ?? false;
                              const isLoading = osLoading.has(ds.id);

                              return (
                                <div key={ds.id} className="space-y-0.5 pl-4">
                                  <div className="flex items-center justify-between gap-2 py-0.5">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      {isLoading ? (
                                        <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
                                      ) : (
                                        <div className="h-3 w-3 rounded-sm shrink-0 border border-border" style={{ backgroundColor: ds.color }} />
                                      )}
                                      <Label htmlFor={`os-${ds.id}`} className="text-xs font-normal whitespace-nowrap cursor-pointer">
                                        {ds.label}
                                      </Label>
                                      {isVisible && !isLoading && (
                                        <span className="text-[9px] text-muted-foreground">
                                          {(osFeatureCounts[ds.id] ?? 0) > 0
                                            ? `${osFeatureCounts[ds.id]?.toLocaleString()}`
                                            : `z${ds.minZoom}+`}
                                        </span>
                                      )}
                                    </div>
                                    <Switch
                                      id={`os-${ds.id}`}
                                      checked={isVisible}
                                      onCheckedChange={(checked) => onOsToggle?.(ds.id, checked)}
                                      className="scale-75 shrink-0"
                                    />
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      );
                    })
                  );
                })()}
                <div className="pt-1.5 border-t mt-1">
                  <p className="text-[10px] text-muted-foreground px-1">
                    Ordnance Survey Open Data — Zoomstack layers for your viewport.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="landregistry" className="mt-0 px-2 py-2 space-y-1 max-h-[55vh] overflow-y-auto">
                {lrDatasets.length === 0 ? (
                  <div className="py-4 text-center space-y-1.5">
                    <Landmark className="h-6 w-6 text-muted-foreground mx-auto" />
                    <p className="text-[11px] text-muted-foreground">No Land Registry layers configured.</p>
                  </div>
                ) : (
                  lrDatasets.map((ds) => {
                    const isVisible = lrVisibility[ds.id] ?? false;
                    const isLoading = lrLoading.has(ds.id);

                    return (
                      <div key={ds.id} className="space-y-0.5">
                        <div className="flex items-center justify-between gap-2 py-0.5">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isLoading ? (
                              <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
                            ) : (
                              <div className="h-3 w-3 rounded-sm shrink-0 border border-border" style={{ backgroundColor: ds.color }} />
                            )}
                            <Label htmlFor={`lr-${ds.id}`} className="text-xs font-normal whitespace-nowrap cursor-pointer">
                              {ds.label}
                            </Label>
                          </div>
                          <Switch
                            id={`lr-${ds.id}`}
                            checked={isVisible}
                            onCheckedChange={(checked) => onLrToggle?.(ds.id, checked)}
                            className="scale-75 shrink-0"
                          />
                        </div>
                      </div>
                    );
                  })
                )}
                <div className="pt-1.5 border-t mt-1">
                  <p className="text-[10px] text-muted-foreground px-1">
                    INSPIRE Index Polygons from HM Land Registry — visible at zoom 18+.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
}
