import { useState, useCallback, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

export interface PlanningDataset {
  id: string;
  slug: string;
  label: string;
  color: string;
  fillOpacity: number;
  category: string;
  type: "polygon" | "point"; // geometry type hint
}

const TILES_BASE = "https://tiles.planning.data.gov.uk";

export const PLANNING_DATASETS: PlanningDataset[] = [
  {
    id: "planning-green-belt",
    slug: "green-belt",
    label: "Green Belt",
    color: "#85994b",
    fillOpacity: 0.35,
    category: "environmental",
    type: "polygon",
  },
  {
    id: "planning-brownfield-land",
    slug: "brownfield-land",
    label: "Brownfield Land",
    color: "#745729",
    fillOpacity: 0.5,
    category: "development",
    type: "polygon",
  },
  {
    id: "planning-brownfield-site",
    slug: "brownfield-site",
    label: "Brownfield Site",
    color: "#745729",
    fillOpacity: 0.35,
    category: "development",
    type: "polygon",
  },
  {
    id: "planning-flood-risk-zone",
    slug: "flood-risk-zone",
    label: "Flood Risk Zone",
    color: "#2196F3",
    fillOpacity: 0.25,
    category: "environmental",
    type: "polygon",
  },
  {
    id: "planning-conservation-area",
    slug: "conservation-area",
    label: "Conservation Area",
    color: "#78AA00",
    fillOpacity: 0.3,
    category: "heritage",
    type: "polygon",
  },
  {
    id: "planning-ancient-woodland",
    slug: "ancient-woodland",
    label: "Ancient Woodland",
    color: "#00703c",
    fillOpacity: 0.4,
    category: "environmental",
    type: "polygon",
  },
  {
    id: "planning-sssi",
    slug: "site-of-special-scientific-interest",
    label: "SSSI",
    color: "#7B1FA2",
    fillOpacity: 0.25,
    category: "environmental",
    type: "polygon",
  },
  {
    id: "planning-listed-building-outline",
    slug: "listed-building-outline",
    label: "Listed Building",
    color: "#E91E63",
    fillOpacity: 0.3,
    category: "heritage",
    type: "polygon",
  },
];

interface PlanningLayerState {
  [datasetId: string]: boolean;
}

export function usePlanningLayers() {
  const [planningVisibility, setPlanningVisibility] = useState<PlanningLayerState>({});
  const [planningLoading] = useState<Set<string>>(new Set()); // No loading needed with vector tiles
  const addedRef = useRef<Set<string>>(new Set());

  const togglePlanningLayer = useCallback(
    (datasetId: string, visible: boolean, map: MaplibreMap | null) => {
      setPlanningVisibility((prev) => ({ ...prev, [datasetId]: visible }));

      if (!map) return;

      const ds = PLANNING_DATASETS.find((d) => d.id === datasetId);
      if (!ds) return;

      const sourceId = `planning-vt-${ds.slug}`;
      const fillLayerId = `planning-fill-${ds.slug}`;
      const lineLayerId = `planning-line-${ds.slug}`;
      const circleLayerId = `planning-circle-${ds.slug}`;

      // Add source + layers on first toggle-on
      if (!addedRef.current.has(datasetId)) {
        if (!map.getSource(sourceId)) {
          map.addSource(sourceId, {
            type: "vector",
            tiles: [`${TILES_BASE}/${ds.slug}/{z}/{x}/{y}.pbf`],
            minzoom: 4,
            maxzoom: 14,
          });
        }

        if (ds.type === "point") {
          map.addLayer({
            id: circleLayerId,
            type: "circle",
            source: sourceId,
            "source-layer": ds.slug,
            paint: {
              "circle-color": ds.color,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 2, 12, 6],
              "circle-stroke-color": "#fff",
              "circle-stroke-width": 1,
              "circle-opacity": 0.8,
            },
            layout: { visibility: "visible" },
          });
        } else {
          map.addLayer({
            id: fillLayerId,
            type: "fill",
            source: sourceId,
            "source-layer": ds.slug,
            paint: {
              "fill-color": ds.color,
              "fill-opacity": ds.fillOpacity,
            },
            layout: { visibility: "visible" },
          });
          map.addLayer({
            id: lineLayerId,
            type: "line",
            source: sourceId,
            "source-layer": ds.slug,
            paint: {
              "line-color": ds.color,
              "line-width": 1.5,
              "line-opacity": 0.8,
            },
            layout: { visibility: "visible" },
          });
        }

        addedRef.current.add(datasetId);
        console.log(`Added planning vector tile layer: ${ds.slug}`);
        return; // Already visible on add
      }

      // Toggle visibility
      const vis = visible ? "visible" : "none";
      if (map.getLayer(fillLayerId)) map.setLayoutProperty(fillLayerId, "visibility", vis);
      if (map.getLayer(lineLayerId)) map.setLayoutProperty(lineLayerId, "visibility", vis);
      if (map.getLayer(circleLayerId)) map.setLayoutProperty(circleLayerId, "visibility", vis);
    },
    []
  );

  // No-op for vector tiles — data loads automatically by viewport
  const refreshPlanningLayers = useCallback(
    async (_map: MaplibreMap | null) => {
      // Vector tiles refresh automatically — nothing to do
    },
    []
  );

  return {
    planningVisibility,
    planningLoading,
    togglePlanningLayer,
    refreshPlanningLayers,
    planningDatasets: PLANNING_DATASETS,
  };
}
