import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import maplibregl from "maplibre-gl";
import {
  useRegistryLayers,
  type LayerVisibility,
  type RegistryLayer,
} from "@/components/map/LayerTogglePanel";
import {
  fetchLayerGeoJSON,
  addRegistryLayerToMap,
  removeRegistryLayerFromMap,
  clearLayerCache,
} from "@/lib/mapLayers";
import { useToast } from "@/hooks/use-toast";

function getMapBbox(map: maplibregl.Map): [number, number, number, number] {
  const bounds = map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

/** Compute the fraction of bbox A that is covered by bbox B (0..1) */
function bboxOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number]
): number {
  const overlapW = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const overlapH = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const overlapArea = overlapW * overlapH;
  const aArea = (a[2] - a[0]) * (a[3] - a[1]);
  return aArea > 0 ? overlapArea / aArea : 0;
}

/** Check if bbox dimension shifted more than a threshold fraction */
function bboxDimensionShifted(
  a: [number, number, number, number],
  b: [number, number, number, number],
  threshold: number
): boolean {
  const aW = a[2] - a[0];
  const aH = a[3] - a[1];
  const bW = b[2] - b[0];
  const bH = b[3] - b[1];
  const cxShift = Math.abs((a[0] + a[2]) / 2 - (b[0] + b[2]) / 2);
  const cyShift = Math.abs((a[1] + a[3]) / 2 - (b[1] + b[3]) / 2);
  return cxShift > aW * threshold || cyShift > aH * threshold;
}

export function useLayerManager(
  map: maplibregl.Map | null,
  mapLoaded: boolean,
  heatmapMode: boolean
) {
  const { registryLayers, registryLoading } = useRegistryLayers();
  const [visibility, setVisibility] = useState<LayerVisibility>({});
  const [selectedFeature, setSelectedFeature] = useState<Record<string, unknown> | null>(null);
  const [selectedLayerLabel, setSelectedLayerLabel] = useState("");
  const [loadingLayers, setLoadingLayers] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const clickHandlersRef = useRef<Set<string>>(new Set());
  const moveEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBboxMap = useRef<Map<string, [number, number, number, number]>>(new Map());
  const lastZoomRef = useRef<number>(6);

  // Registry layer lookup
  const layerMap = useMemo(() => {
    const m = new Map<string, RegistryLayer>();
    registryLayers.forEach((l) => m.set(l.id, l));
    return m;
  }, [registryLayers]);

  // Determine feature cap by geometry type
  const getFeatureCap = useCallback((layer: RegistryLayer): number => {
    const gt = layer.geometry_type.toLowerCase();
    if (gt.includes("point")) return 1000;
    if (gt.includes("polygon")) return 1000;
    return 2000; // lines
  }, []);

  // Load a single layer
  const loadLayer = useCallback(
    async (layerId: string, bbox?: [number, number, number, number], showEmptyToast = true) => {
      const layer = layerMap.get(layerId);
      if (!layer || !map) return;

      // Check min_zoom
      const currentZoom = map.getZoom();
      if (layer.min_zoom && currentZoom < layer.min_zoom) {
        // Remove from map if present, but don't show toast
        removeRegistryLayerFromMap(map, layerId);
        return;
      }

      setLoadingLayers((prev) => new Set(prev).add(layerId));
      try {
        const geojson = await fetchLayerGeoJSON(layerId, bbox);
        const catLayers = registryLayers.filter((l) => l.category === layer.category && l.dno === layer.dno);
        const colorIdx = catLayers.findIndex((l) => l.id === layerId);
        const isUtil = layer.slug === "npg_hv_substations_utilisation";

        addRegistryLayerToMap(map, layer, geojson, colorIdx, isUtil && heatmapMode);

        // Store the bbox we fetched with
        if (bbox) lastBboxMap.current.set(layerId, bbox);

        // Attach click/hover handlers once
        const mapLayerId = `layer-${layerId}`;
        if (!clickHandlersRef.current.has(layerId)) {
          map.on("click", mapLayerId, (e) => {
            if (e.features && e.features.length > 0) {
              setSelectedFeature(e.features[0].properties as Record<string, unknown>);
              setSelectedLayerLabel(layer.display_name);
            }
          });
          map.on("mouseenter", mapLayerId, () => {
            map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", mapLayerId, () => {
            map.getCanvas().style.cursor = "";
          });
          clickHandlersRef.current.add(layerId);
        }

        if (geojson.features.length === 0 && showEmptyToast) {
          toast({ title: layer.display_name, description: "No data in this viewport." });
        }
      } catch (err) {
        console.error(`Failed to load layer ${layerId}:`, err);
        toast({ title: "Layer load failed", description: `Could not load ${layer.display_name}`, variant: "destructive" });
      } finally {
        setLoadingLayers((prev) => {
          const next = new Set(prev);
          next.delete(layerId);
          return next;
        });
      }
    },
    [map, layerMap, registryLayers, heatmapMode, toast]
  );

  // Toggle layer on/off
  const handleLayerToggle = useCallback(
    async (layerId: string, visible: boolean) => {
      setVisibility((prev) => ({ ...prev, [layerId]: visible }));
      if (!map) return;

      if (visible) {
        const bbox = getMapBbox(map);
        await loadLayer(layerId, bbox);
      } else {
        removeRegistryLayerFromMap(map, layerId);
        clearLayerCache(layerId);
        lastBboxMap.current.delete(layerId);
      }
    },
    [map, loadLayer]
  );

  // Smart viewport refresh on moveend
  useEffect(() => {
    if (!map || !mapLoaded) return;

    const onMoveEnd = () => {
      if (moveEndTimerRef.current) clearTimeout(moveEndTimerRef.current);
      moveEndTimerRef.current = setTimeout(() => {
        const newBbox = getMapBbox(map);
        const newZoom = map.getZoom();
        const prevZoom = lastZoomRef.current;
        lastZoomRef.current = newZoom;

        const visibleLayerIds = Object.entries(visibility)
          .filter(([, v]) => v)
          .map(([id]) => id);

        visibleLayerIds.forEach((id) => {
          const layer = layerMap.get(id);
          if (!layer) return;

          // min_zoom threshold crossing: fetch when becoming eligible
          if (layer.min_zoom) {
            const wasBelow = prevZoom < layer.min_zoom;
            const isAbove = newZoom >= layer.min_zoom;
            const nowBelow = newZoom < layer.min_zoom;

            if (nowBelow) {
              removeRegistryLayerFromMap(map, id);
              return;
            }
            if (wasBelow && isAbove) {
              // Just crossed into eligible zoom — force fetch
              clearLayerCache(id);
              loadLayer(id, newBbox, false);
              return;
            }
          }

          // Check overlap with last-fetched bbox
          const lastBbox = lastBboxMap.current.get(id);
          if (!lastBbox) {
            // Never fetched — fetch now
            loadLayer(id, newBbox, false);
            return;
          }

          const overlap = bboxOverlap(lastBbox, newBbox);
          const shifted = bboxDimensionShifted(lastBbox, newBbox, 0.32);

          // Only refetch if overlap < 70% OR shifted > 32%
          if (overlap < 0.7 || shifted) {
            clearLayerCache(id);
            loadLayer(id, newBbox, false);
          }
        });
      }, 300); // 300ms debounce
    };

    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
      if (moveEndTimerRef.current) clearTimeout(moveEndTimerRef.current);
    };
  }, [map, mapLoaded, visibility, loadLayer, layerMap]);

  const closeFeatureInfo = useCallback(() => {
    setSelectedFeature(null);
    setSelectedLayerLabel("");
  }, []);

  return {
    registryLayers,
    registryLoading,
    visibility,
    handleLayerToggle,
    loadingLayers,
    selectedFeature,
    selectedLayerLabel,
    closeFeatureInfo,
    layerMap,
    loadLayer,
  };
}
