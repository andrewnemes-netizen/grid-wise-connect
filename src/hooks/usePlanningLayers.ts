import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Map as MaplibreMap } from "maplibre-gl";

export interface PlanningDataset {
  id: string;
  slug: string;
  label: string;
  color: string;
  fillOpacity: number;
  category: string;
}

export const PLANNING_DATASETS: PlanningDataset[] = [
  {
    id: "planning-green-belt",
    slug: "green-belt",
    label: "Green Belt",
    color: "#4CAF50",
    fillOpacity: 0.25,
    category: "environmental",
  },
  {
    id: "planning-brownfield-land",
    slug: "brownfield-land",
    label: "Brownfield Land",
    color: "#795548",
    fillOpacity: 0.35,
    category: "development",
  },
  {
    id: "planning-brownfield-site",
    slug: "brownfield-site",
    label: "Brownfield Site",
    color: "#8D6E63",
    fillOpacity: 0.35,
    category: "development",
  },
  {
    id: "planning-flood-risk-zone",
    slug: "flood-risk-zone",
    label: "Flood Risk Zone",
    color: "#2196F3",
    fillOpacity: 0.25,
    category: "environmental",
  },
  {
    id: "planning-conservation-area",
    slug: "conservation-area",
    label: "Conservation Area",
    color: "#FF9800",
    fillOpacity: 0.25,
    category: "heritage",
  },
  {
    id: "planning-ancient-woodland",
    slug: "ancient-woodland",
    label: "Ancient Woodland",
    color: "#2E7D32",
    fillOpacity: 0.3,
    category: "environmental",
  },
  {
    id: "planning-sssi",
    slug: "site-of-special-scientific-interest",
    label: "SSSI",
    color: "#7B1FA2",
    fillOpacity: 0.25,
    category: "environmental",
  },
  {
    id: "planning-listed-building-outline",
    slug: "listed-building-outline",
    label: "Listed Building",
    color: "#E91E63",
    fillOpacity: 0.3,
    category: "heritage",
  },
];

interface PlanningLayerState {
  [datasetId: string]: boolean;
}

export function usePlanningLayers() {
  const [planningVisibility, setPlanningVisibility] = useState<PlanningLayerState>({});
  const [planningLoading, setPlanningLoading] = useState<Set<string>>(new Set());
  const loadedRef = useRef<Set<string>>(new Set());

  const togglePlanningLayer = useCallback(
    async (datasetId: string, visible: boolean, map: MaplibreMap | null) => {
      setPlanningVisibility((prev) => ({ ...prev, [datasetId]: visible }));

      if (!map) return;

      const ds = PLANNING_DATASETS.find((d) => d.id === datasetId);
      if (!ds) return;

      const sourceId = `planning-src-${ds.slug}`;
      const fillLayerId = `planning-fill-${ds.slug}`;
      const lineLayerId = `planning-line-${ds.slug}`;
      const circleLayerId = `planning-circle-${ds.slug}`;

      if (!visible) {
        // Hide layers
        if (map.getLayer(fillLayerId)) map.setLayoutProperty(fillLayerId, "visibility", "none");
        if (map.getLayer(lineLayerId)) map.setLayoutProperty(lineLayerId, "visibility", "none");
        if (map.getLayer(circleLayerId)) map.setLayoutProperty(circleLayerId, "visibility", "none");
        return;
      }

      // If already loaded, just show
      if (loadedRef.current.has(datasetId)) {
        if (map.getLayer(fillLayerId)) map.setLayoutProperty(fillLayerId, "visibility", "visible");
        if (map.getLayer(lineLayerId)) map.setLayoutProperty(lineLayerId, "visibility", "visible");
        if (map.getLayer(circleLayerId)) map.setLayoutProperty(circleLayerId, "visibility", "visible");
        return;
      }

      // Fetch from API
      setPlanningLoading((prev) => new Set(prev).add(datasetId));

      try {
        const center = map.getCenter();
        const { data, error } = await supabase.functions.invoke("planning-data-lookup", {
          body: {
            dataset: ds.slug,
            latitude: center.lat,
            longitude: center.lng,
            limit: 100,
            geometry_relation: "intersects",
          },
        });

        if (error) {
          console.error("Planning data fetch error:", error);
          return;
        }

        const geojson = data;
        if (!geojson?.features?.length) {
          console.log(`No features for ${ds.slug} near ${center.lat},${center.lng}`);
          // Still add empty source so toggle works
          if (!map.getSource(sourceId)) {
            map.addSource(sourceId, {
              type: "geojson",
              data: { type: "FeatureCollection", features: [] },
            });
          }
          loadedRef.current.add(datasetId);
          return;
        }

        // Determine geometry types
        const geomTypes = new Set(geojson.features.map((f: any) => f.geometry?.type));
        const hasPolygon = geomTypes.has("Polygon") || geomTypes.has("MultiPolygon");
        const hasLine = geomTypes.has("LineString") || geomTypes.has("MultiLineString");
        const hasPoint = geomTypes.has("Point") || geomTypes.has("MultiPoint");

        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, { type: "geojson", data: geojson });
        } else {
          (map.getSource(sourceId) as any).setData(geojson);
        }

        if (hasPolygon && !map.getLayer(fillLayerId)) {
          map.addLayer({
            id: fillLayerId,
            type: "fill",
            source: sourceId,
            filter: ["any", ["==", "$type", "Polygon"]],
            paint: {
              "fill-color": ds.color,
              "fill-opacity": ds.fillOpacity,
            },
          });
          map.addLayer({
            id: lineLayerId,
            type: "line",
            source: sourceId,
            filter: ["any", ["==", "$type", "Polygon"]],
            paint: {
              "line-color": ds.color,
              "line-width": 1.5,
              "line-opacity": 0.8,
            },
          });
        }

        if (hasLine && !map.getLayer(lineLayerId)) {
          map.addLayer({
            id: lineLayerId,
            type: "line",
            source: sourceId,
            filter: ["==", "$type", "LineString"],
            paint: {
              "line-color": ds.color,
              "line-width": 2,
            },
          });
        }

        if (hasPoint && !map.getLayer(circleLayerId)) {
          map.addLayer({
            id: circleLayerId,
            type: "circle",
            source: sourceId,
            filter: ["==", "$type", "Point"],
            paint: {
              "circle-color": ds.color,
              "circle-radius": 5,
              "circle-stroke-color": "#fff",
              "circle-stroke-width": 1,
            },
          });
        }

        loadedRef.current.add(datasetId);
        console.log(`Loaded ${geojson.features.length} planning features for ${ds.slug}`);
      } catch (err) {
        console.error("Failed to load planning layer:", err);
      } finally {
        setPlanningLoading((prev) => {
          const next = new Set(prev);
          next.delete(datasetId);
          return next;
        });
      }
    },
    []
  );

  /** Refetch visible planning layers for a new map center */
  const refreshPlanningLayers = useCallback(
    async (map: MaplibreMap | null) => {
      if (!map) return;
      const visible = Object.entries(planningVisibility).filter(([, v]) => v);
      for (const [datasetId] of visible) {
        const ds = PLANNING_DATASETS.find((d) => d.id === datasetId);
        if (!ds) continue;
        const sourceId = `planning-src-${ds.slug}`;
        const center = map.getCenter();

        try {
          const { data } = await supabase.functions.invoke("planning-data-lookup", {
            body: {
              dataset: ds.slug,
              latitude: center.lat,
              longitude: center.lng,
              limit: 100,
              geometry_relation: "intersects",
            },
          });
          if (data?.features && map.getSource(sourceId)) {
            (map.getSource(sourceId) as any).setData(data);
          }
        } catch (err) {
          console.error("Refresh planning layer failed:", err);
        }
      }
    },
    [planningVisibility]
  );

  return {
    planningVisibility,
    planningLoading,
    togglePlanningLayer,
    refreshPlanningLayers,
    planningDatasets: PLANNING_DATASETS,
  };
}
