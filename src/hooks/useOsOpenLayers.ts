import { useState, useCallback, useRef, useEffect } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface OsOpenDataset {
  id: string;
  typeName: string;
  label: string;
  color: string;
  fillOpacity: number;
  category: string;
  type: "polygon" | "line" | "point";
  minZoom: number;
  maxCount: number;
}

// Only includes layers available on the OS Features API free/open tier
export const OS_OPEN_DATASETS: OsOpenDataset[] = [
  {
    id: "os-greenspace",
    typeName: "Zoomstack_Greenspace",
    label: "Greenspace",
    color: "#40AD5A",
    fillOpacity: 0.3,
    category: "land",
    type: "polygon",
    minZoom: 10,
    maxCount: 5000,
  },
  {
    id: "os-foreshore",
    typeName: "Zoomstack_Foreshore",
    label: "Foreshore",
    color: "#6CB0D6",
    fillOpacity: 0.25,
    category: "land",
    type: "polygon",
    minZoom: 8,
    maxCount: 3000,
  },
  {
    id: "os-woodland",
    typeName: "Zoomstack_Woodland",
    label: "Woodland",
    color: "#228B3B",
    fillOpacity: 0.3,
    category: "land",
    type: "polygon",
    minZoom: 10,
    maxCount: 5000,
  },
  {
    id: "os-surfacewater",
    typeName: "Zoomstack_SurfaceWater",
    label: "Surface Water",
    color: "#3C93C2",
    fillOpacity: 0.35,
    category: "water",
    type: "polygon",
    minZoom: 9,
    maxCount: 5000,
  },
  {
    id: "os-railway-stations",
    typeName: "Zoomstack_RailwayStations",
    label: "Railway Stations",
    color: "#FF1F5B",
    fillOpacity: 0.9,
    category: "transport",
    type: "point",
    minZoom: 6,
    maxCount: 10000,
  },
  {
    id: "os-sites",
    typeName: "Zoomstack_Sites",
    label: "Sites (Schools, Hospitals)",
    color: "#AF58BA",
    fillOpacity: 0.25,
    category: "facilities",
    type: "polygon",
    minZoom: 10,
    maxCount: 5000,
  },
];

const DEBOUNCE_MS = 600;

export function useOsOpenLayers() {
  const [osVisibility, setOsVisibility] = useState<Record<string, boolean>>({});
  const [osLoading, setOsLoading] = useState<Set<string>>(new Set());
  const [osFeatureCounts, setOsFeatureCounts] = useState<Record<string, number>>({});
  const activeOnMap = useRef<Set<string>>(new Set());
  const mapRef = useRef<MaplibreMap | null>(null);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const abortControllers = useRef<Record<string, AbortController>>({});
  const moveHandler = useRef<(() => void) | null>(null);

  const ensureLayers = useCallback(
    (map: MaplibreMap, ds: OsOpenDataset, sourceId: string, layerId: string, outlineId: string) => {
      if (!map.getSource(sourceId)) {
        map.addSource(sourceId, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }

      if (!map.getLayer(layerId)) {
        if (ds.type === "polygon") {
          map.addLayer({
            id: layerId,
            type: "fill",
            source: sourceId,
            paint: {
              "fill-color": ds.color,
              "fill-opacity": ds.fillOpacity,
            },
          });
          if (!map.getLayer(outlineId)) {
            map.addLayer({
              id: outlineId,
              type: "line",
              source: sourceId,
              paint: {
                "line-color": ds.color,
                "line-width": 1,
                "line-opacity": 0.7,
              },
            });
          }
        } else if (ds.type === "line") {
          map.addLayer({
            id: layerId,
            type: "line",
            source: sourceId,
            paint: {
              "line-color": ds.color,
              "line-width": 2,
              "line-opacity": ds.fillOpacity,
            },
          });
        } else {
          map.addLayer({
            id: layerId,
            type: "circle",
            source: sourceId,
            paint: {
              "circle-radius": 5,
              "circle-color": ds.color,
              "circle-stroke-color": "#fff",
              "circle-stroke-width": 1.5,
              "circle-opacity": ds.fillOpacity,
            },
          });
        }
      }
    },
    []
  );

  const fetchAndUpdate = useCallback(
    async (datasetId: string, map: MaplibreMap) => {
      const ds = OS_OPEN_DATASETS.find((d) => d.id === datasetId);
      if (!ds) return;

      const sourceId = `os-open-${datasetId}`;
      const layerId = `os-open-layer-${datasetId}`;
      const outlineId = `${layerId}-outline`;

      const zoom = map.getZoom();
      if (zoom < ds.minZoom) {
        // Below minimum zoom — clear data but keep layers
        const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData({ type: "FeatureCollection", features: [] });
        }
        setOsFeatureCounts((prev) => ({ ...prev, [datasetId]: 0 }));
        return;
      }

      // Abort previous request for this layer
      abortControllers.current[datasetId]?.abort();
      const ac = new AbortController();
      abortControllers.current[datasetId] = ac;

      setOsLoading((prev) => new Set(prev).add(datasetId));

      try {
        const bounds = map.getBounds();
        const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;

        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;

        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/os-features-proxy?typeName=${ds.typeName}&bbox=${bbox}&count=${ds.maxCount}`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          signal: ac.signal,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (res.status === 500 && typeof body?.error === "string" && body.error.includes("403")) {
            toast.error(`${ds.label} requires an OS Premium plan`);
          }
          throw new Error(`HTTP ${res.status}`);
        }

        const geojson = await res.json();
        const featureCount = geojson?.features?.length ?? 0;
        setOsFeatureCounts((prev) => ({ ...prev, [datasetId]: featureCount }));

        // Ensure layers exist, then update data in-place
        ensureLayers(map, ds, sourceId, layerId, outlineId);
        const src = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData(geojson);
        }

        activeOnMap.current.add(datasetId);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error(`Failed to load OS Open layer ${ds.label}:`, err);
      } finally {
        setOsLoading((prev) => {
          const next = new Set(prev);
          next.delete(datasetId);
          return next;
        });
      }
    },
    [ensureLayers]
  );

  const debouncedFetch = useCallback(
    (datasetId: string, map: MaplibreMap) => {
      clearTimeout(debounceTimers.current[datasetId]);
      debounceTimers.current[datasetId] = setTimeout(() => {
        fetchAndUpdate(datasetId, map);
      }, DEBOUNCE_MS);
    },
    [fetchAndUpdate]
  );

  // Attach / detach a single moveend listener that refreshes all visible layers
  const syncMoveHandler = useCallback(
    (map: MaplibreMap) => {
      if (moveHandler.current) {
        map.off("moveend", moveHandler.current);
      }
      const handler = () => {
        const visibleIds = Object.entries(osVisibility)
          .filter(([, v]) => v)
          .map(([id]) => id);
        for (const id of visibleIds) {
          debouncedFetch(id, map);
        }
      };
      moveHandler.current = handler;
      map.on("moveend", handler);
    },
    [osVisibility, debouncedFetch]
  );

  // Re-sync moveend handler whenever visibility changes
  useEffect(() => {
    const map = mapRef.current;
    if (map) syncMoveHandler(map);
    return () => {
      if (map && moveHandler.current) {
        map.off("moveend", moveHandler.current);
      }
    };
  }, [syncMoveHandler]);

  const toggleOsLayer = useCallback(
    async (datasetId: string, visible: boolean, map: MaplibreMap | null) => {
      setOsVisibility((prev) => ({ ...prev, [datasetId]: visible }));

      if (!map) return;
      mapRef.current = map;
      const ds = OS_OPEN_DATASETS.find((d) => d.id === datasetId);
      if (!ds) return;

      const sourceId = `os-open-${datasetId}`;
      const layerId = `os-open-layer-${datasetId}`;
      const outlineId = `${layerId}-outline`;

      if (!visible) {
        abortControllers.current[datasetId]?.abort();
        clearTimeout(debounceTimers.current[datasetId]);
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getLayer(outlineId)) map.removeLayer(outlineId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        activeOnMap.current.delete(datasetId);
        setOsFeatureCounts((prev) => ({ ...prev, [datasetId]: 0 }));
        return;
      }

      // Check zoom
      const zoom = map.getZoom();
      if (zoom < ds.minZoom) {
        toast.info(`Zoom in to level ${ds.minZoom}+ to see ${ds.label} data`);
      }

      // Immediate fetch
      await fetchAndUpdate(datasetId, map);

      // Ensure moveend listener is active
      syncMoveHandler(map);
    },
    [fetchAndUpdate, syncMoveHandler]
  );

  return {
    osDatasets: OS_OPEN_DATASETS,
    osVisibility,
    osLoading,
    osFeatureCounts,
    toggleOsLayer,
  };
}
