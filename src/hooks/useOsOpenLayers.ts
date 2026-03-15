import { useState, useCallback, useRef } from "react";
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
  },
  {
    id: "os-foreshore",
    typeName: "Zoomstack_Foreshore",
    label: "Foreshore",
    color: "#6CB0D6",
    fillOpacity: 0.25,
    category: "land",
    type: "polygon",
  },
  {
    id: "os-woodland",
    typeName: "Zoomstack_Woodland",
    label: "Woodland",
    color: "#228B3B",
    fillOpacity: 0.3,
    category: "land",
    type: "polygon",
  },
  {
    id: "os-surfacewater",
    typeName: "Zoomstack_SurfaceWater",
    label: "Surface Water",
    color: "#3C93C2",
    fillOpacity: 0.35,
    category: "water",
    type: "polygon",
  },
  {
    id: "os-railway-stations",
    typeName: "Zoomstack_RailwayStations",
    label: "Railway Stations",
    color: "#FF1F5B",
    fillOpacity: 0.9,
    category: "transport",
    type: "point",
  },
  {
    id: "os-sites",
    typeName: "Zoomstack_Sites",
    label: "Sites (Schools, Hospitals)",
    color: "#AF58BA",
    fillOpacity: 0.25,
    category: "facilities",
    type: "polygon",
  },
];

export function useOsOpenLayers() {
  const [osVisibility, setOsVisibility] = useState<Record<string, boolean>>({});
  const [osLoading, setOsLoading] = useState<Set<string>>(new Set());
  const activeOnMap = useRef<Set<string>>(new Set());

  const toggleOsLayer = useCallback(
    async (datasetId: string, visible: boolean, map: MaplibreMap | null) => {
      setOsVisibility((prev) => ({ ...prev, [datasetId]: visible }));

      if (!map) return;
      const ds = OS_OPEN_DATASETS.find((d) => d.id === datasetId);
      if (!ds) return;

      const sourceId = `os-open-${datasetId}`;
      const layerId = `os-open-layer-${datasetId}`;
      const outlineId = `${layerId}-outline`;

      if (!visible) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getLayer(outlineId)) map.removeLayer(outlineId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        activeOnMap.current.delete(datasetId);
        return;
      }

      // Fetch from os-features-proxy
      setOsLoading((prev) => new Set(prev).add(datasetId));

      try {
        const bounds = map.getBounds();
        const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;

        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;

        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/os-features-proxy?typeName=${ds.typeName}&bbox=${bbox}&count=1000`;
        const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const geojson = await res.json();

        // Remove stale layers if they exist
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getLayer(outlineId)) map.removeLayer(outlineId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);

        map.addSource(sourceId, { type: "geojson", data: geojson });

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

        activeOnMap.current.add(datasetId);
      } catch (err) {
        console.error(`Failed to load OS Open layer ${ds.label}:`, err);
        setOsVisibility((prev) => ({ ...prev, [datasetId]: false }));
      } finally {
        setOsLoading((prev) => {
          const next = new Set(prev);
          next.delete(datasetId);
          return next;
        });
      }
    },
    []
  );

  return {
    osDatasets: OS_OPEN_DATASETS,
    osVisibility,
    osLoading,
    toggleOsLayer,
  };
}
