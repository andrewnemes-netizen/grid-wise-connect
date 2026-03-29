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
  const cxShift = Math.abs((a[0] + a[2]) / 2 - (b[0] + b[2]) / 2);
  const cyShift = Math.abs((a[1] + a[3]) / 2 - (b[1] + b[3]) / 2);
  return cxShift > aW * threshold || cyShift > aH * threshold;
}

const GAS_OPERATORS = new Set(["CADENT", "NGN", "SGN", "WWU"]);

export function useLayerManager(
  map: maplibregl.Map | null,
  mapLoaded: boolean,
  heatmapMode: boolean,
  selectedDno?: string | null
) {
  const { registryLayers, registryLoading } = useRegistryLayers();
  const [visibility, setVisibility] = useState<LayerVisibility>({});
  const [selectedFeature, setSelectedFeature] = useState<Record<string, unknown> | null>(null);
  const [selectedLayerLabel, setSelectedLayerLabel] = useState("");
  const [loadingLayers, setLoadingLayers] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Refs for stable moveend listener (no dependency on visibility/dno state)
  const visibilityRef = useRef<LayerVisibility>({});
  // Do NOT sync visibilityRef from state here — it's updated immediately
  // in handleLayerToggle to prevent moveend from seeing stale values.
  // Syncing here would overwrite the immediate update before React batches the setState.
  const selectedDnoRef = useRef<string | null | undefined>(selectedDno);
  selectedDnoRef.current = selectedDno;

  const clickHandlersRef = useRef<Map<string, { click: (e: any) => void; enter: () => void; leave: () => void }>>(new Map());
  const moveEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBboxMap = useRef<Map<string, [number, number, number, number]>>(new Map());
  const lastZoomRef = useRef<number>(6);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  // Registry layer lookup
  const layerMap = useMemo(() => {
    const m = new Map<string, RegistryLayer>();
    registryLayers.forEach((l) => m.set(l.id, l));
    return m;
  }, [registryLayers]);

  // Feature cap — tiered by zoom to prevent timeouts at wide zoom
  const getFeatureCap = useCallback((layer: RegistryLayer, zoom?: number): number => {
    const gt = layer.geometry_type.toLowerCase();
    const z = zoom ?? 10;
    if (gt.includes("line")) {
      if (z < 7) return 1000;
      if (z < 10) return 3000;
      return 5000;
    }
    if (gt.includes("point")) {
      if (z < 7) return 2000;
      if (z < 10) return 5000;
      return 10000;
    }
    // Polygons
    if (z < 7) return 1000;
    if (z < 10) return 3000;
    return 5000;
  }, []);

  // Detach event handlers for a layer
  const detachLayerHandlers = useCallback((map: maplibregl.Map, layerId: string) => {
    const handlers = clickHandlersRef.current.get(layerId);
    if (!handlers) return;
    const mapLayerId = `layer-${layerId}`;
    try {
      map.off("click", mapLayerId, handlers.click);
      map.off("mouseenter", mapLayerId, handlers.enter);
      map.off("mouseleave", mapLayerId, handlers.leave);
    } catch {
      // layer may already be removed
    }
    clickHandlersRef.current.delete(layerId);
  }, []);

  // Load a single layer
  const loadLayer = useCallback(
    async (layerId: string, bbox?: [number, number, number, number], showEmptyToast = true) => {
      const layer = layerMap.get(layerId);
      if (!layer || !map || !mapLoaded) return;

      // Check min_zoom
      const currentZoom = map.getZoom();
      if (layer.min_zoom && currentZoom < layer.min_zoom) {
        removeRegistryLayerFromMap(map, layerId);
        return;
      }

      const cap = getFeatureCap(layer, currentZoom);
      // Abort any in-flight request for this layer
      const prevController = abortControllersRef.current.get(layerId);
      if (prevController) prevController.abort();
      const controller = new AbortController();
      abortControllersRef.current.set(layerId, controller);

      setLoadingLayers((prev) => new Set(prev).add(layerId));
      try {
        const layerDno = layer.dno;
        const clipDno = GAS_OPERATORS.has(layerDno) ? null : selectedDnoRef.current;
        const geojson = await fetchLayerGeoJSON(layerId, bbox, clipDno, cap, layer.source_type, layer.slug);
        const catLayers = registryLayers.filter((l) => l.category === layer.category && l.dno === layer.dno);
        const colorIdx = catLayers.findIndex((l) => l.id === layerId);
        const isUtil = layer.slug === "npg_hv_substations_utilisation";

        await addRegistryLayerToMap(map, layer, geojson, colorIdx, isUtil && heatmapMode);

        // Store the bbox we fetched with
        if (bbox) lastBboxMap.current.set(layerId, bbox);

        // Attach click/hover handlers (detach old ones first)
        const mapLayerId = `layer-${layerId}`;
        detachLayerHandlers(map, layerId);

        const clickHandler = (e: any) => {
          if (e.features && e.features.length > 0) {
            setSelectedFeature(e.features[0].properties as Record<string, unknown>);
            setSelectedLayerLabel(layer.display_name);
          }
        };
        const enterHandler = () => { map.getCanvas().style.cursor = "pointer"; };
        const leaveHandler = () => { map.getCanvas().style.cursor = ""; };

        map.on("click", mapLayerId, clickHandler);
        map.on("mouseenter", mapLayerId, enterHandler);
        map.on("mouseleave", mapLayerId, leaveHandler);
        clickHandlersRef.current.set(layerId, { click: clickHandler, enter: enterHandler, leave: leaveHandler });

        if (geojson.features.length === 0 && showEmptyToast) {
          if (layer.source_type === "overpass") {
            toast({
              title: layer.display_name,
              description: "No road data in this viewport — zoom in or pan to a populated area.",
            });
          } else {
            const hasAnyData = layer.feature_count && layer.feature_count > 0;
            toast({
              title: layer.display_name,
              description: hasAnyData
                ? "No data in this viewport — try panning to the layer's coverage area."
                : "No data available yet. Run Sync in Admin to ingest this dataset.",
            });
          }
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
    [map, mapLoaded, layerMap, registryLayers, heatmapMode, toast, detachLayerHandlers]
  );

  // Toggle layer on/off
  const handleLayerToggle = useCallback(
    async (layerId: string, visible: boolean) => {
      const newVis = { ...visibilityRef.current, [layerId]: visible };
      visibilityRef.current = newVis; // Update ref immediately to prevent moveend race
      setVisibility(newVis);
      if (!map) return;

      if (visible) {
        // Check min_zoom before loading — give user feedback if blocked
        const layer = layerMap.get(layerId);
        const currentZoom = map.getZoom();
        if (layer?.min_zoom && currentZoom < layer.min_zoom) {
          toast({
            title: layer.display_name,
            description: `Zoom in to level ${layer.min_zoom} to see this layer`,
          });
        }
        const bbox = getMapBbox(map);
        await loadLayer(layerId, bbox);
      } else {
        // Detach handlers, remove from map, clear cache
        detachLayerHandlers(map, layerId);
        removeRegistryLayerFromMap(map, layerId);
        clearLayerCache(layerId);
        lastBboxMap.current.delete(layerId);
      }
    },
    [map, loadLayer, detachLayerHandlers]
  );

  // Smart viewport refresh on moveend — stable: uses visibilityRef, not visibility state
  useEffect(() => {
    if (!map || !mapLoaded) return;

    const onMoveEnd = () => {
      if (moveEndTimerRef.current) clearTimeout(moveEndTimerRef.current);
      const currentZoom = map.getZoom();
      const debounceMs = currentZoom < 8 ? 600 : 300;
      moveEndTimerRef.current = setTimeout(() => {
        const newBbox = getMapBbox(map);
        const newZoom = map.getZoom();
        const prevZoom = lastZoomRef.current;
        lastZoomRef.current = newZoom;

        const currentVisibility = visibilityRef.current;
        const visibleLayerIds = Object.entries(currentVisibility)
          .filter(([, v]) => v)
          .map(([id]) => id);

        visibleLayerIds.forEach((id) => {
          const layer = layerMap.get(id);
          if (!layer) return;

          if (layer.min_zoom) {
            const wasBelow = prevZoom < layer.min_zoom;
            const isAbove = newZoom >= layer.min_zoom;
            const nowBelow = newZoom < layer.min_zoom;

            if (nowBelow) {
              removeRegistryLayerFromMap(map, id);
              return;
            }
            if (wasBelow && isAbove) {
              loadLayer(id, newBbox, false);
              return;
            }
          }

          const lastBbox = lastBboxMap.current.get(id);
          if (!lastBbox) {
            loadLayer(id, newBbox, false);
            return;
          }

          const overlap = bboxOverlap(lastBbox, newBbox);
          const shifted = bboxDimensionShifted(lastBbox, newBbox, 0.32);

          if (overlap < 0.7 || shifted) {
            loadLayer(id, newBbox, false);
          }
        });
      }, debounceMs);
    };

    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
      if (moveEndTimerRef.current) clearTimeout(moveEndTimerRef.current);
    };
  }, [map, mapLoaded, loadLayer, layerMap]); // NO visibility dependency — uses ref

  // Cleanup all handlers on unmount
  useEffect(() => {
    return () => {
      if (!map) return;
      clickHandlersRef.current.forEach((handlers, layerId) => {
        const mapLayerId = `layer-${layerId}`;
        try {
          map.off("click", mapLayerId, handlers.click);
          map.off("mouseenter", mapLayerId, handlers.enter);
          map.off("mouseleave", mapLayerId, handlers.leave);
        } catch {
          // ignore
        }
      });
      clickHandlersRef.current.clear();
    };
  }, [map]);

  const closeFeatureInfo = useCallback(() => {
    setSelectedFeature(null);
    setSelectedLayerLabel("");
  }, []);

  const goToLayerCoverage = useCallback(
    (layerId: string) => {
      if (!map || !mapLoaded) return;
      const layer = layerMap.get(layerId);
      const bbox = layer?.bbox;
      if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) return;
      map.fitBounds(
        [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
        { padding: 48, maxZoom: 13 }
      );
    },
    [map, mapLoaded, layerMap]
  );

  return {
    registryLayers,
    registryLoading,
    visibility,
    handleLayerToggle,
    loadingLayers,
    selectedFeature,
    selectedLayerLabel,
    closeFeatureInfo,
    goToLayerCoverage,
    layerMap,
    loadLayer,
  };
}
