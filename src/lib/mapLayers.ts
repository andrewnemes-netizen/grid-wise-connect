import { supabase } from "@/integrations/supabase/client";
import type { LayerConfig } from "@/components/map/LayerTogglePanel";
import maplibregl from "maplibre-gl";

// Map layer geometry types for MapLibre rendering
const LAYER_RENDER_TYPE: Record<string, "line" | "circle" | "fill"> = {
  site_utilisation: "circle",
  primary_substations: "circle",
  ehv_feeders: "line",
  hv_feeders: "line",
  underground_cables: "line",
  ndp: "fill",
  highway_widths: "line",
  wayleaves: "fill",
};

// Cache for fetched GeoJSON
const geojsonCache = new Map<string, GeoJSON.FeatureCollection>();

export async function fetchLayerGeoJSON(layerId: string): Promise<GeoJSON.FeatureCollection> {
  if (geojsonCache.has(layerId)) {
    return geojsonCache.get(layerId)!;
  }

  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-layer-geojson?layer=${layerId}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!res.ok) {
    console.error(`Failed to fetch layer ${layerId}:`, await res.text());
    return { type: "FeatureCollection", features: [] };
  }

  const geojson = await res.json();
  geojsonCache.set(layerId, geojson);
  return geojson;
}

export function addLayerToMap(map: maplibregl.Map, layerId: string, geojson: GeoJSON.FeatureCollection, color: string, heatmap?: boolean) {
  const sourceId = `source-${layerId}`;
  const renderType = LAYER_RENDER_TYPE[layerId] || "line";

  // Remove existing source/layer if present
  removeLayerFromMap(map, layerId);

  map.addSource(sourceId, {
    type: "geojson",
    data: geojson,
  });

  // Heatmap mode for site_utilisation
  if (heatmap && layerId === "site_utilisation") {
    map.addLayer({
      id: layerId,
      type: "heatmap",
      source: sourceId,
      paint: {
        "heatmap-weight": [
          "interpolate", ["linear"], ["coalesce", ["get", "utilisation_pct"], 50],
          0, 0,
          100, 1,
        ],
        "heatmap-intensity": [
          "interpolate", ["linear"], ["zoom"],
          0, 0.5,
          9, 2,
        ],
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0, "rgba(0,0,0,0)",
          0.2, "hsl(141, 53%, 53%)",
          0.4, "hsl(80, 60%, 55%)",
          0.6, "hsl(45, 97%, 64%)",
          0.8, "hsl(27, 95%, 55%)",
          1, "hsl(0, 86%, 57%)",
        ],
        "heatmap-radius": [
          "interpolate", ["linear"], ["zoom"],
          0, 4,
          6, 15,
          10, 30,
          14, 50,
        ],
        "heatmap-opacity": [
          "interpolate", ["linear"], ["zoom"],
          7, 0.85,
          14, 0.5,
        ],
      },
    } as any);
    return;
  }

  if (renderType === "line") {
    map.addLayer({
      id: layerId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": color,
        "line-width": 2.5,
        "line-opacity": 0.85,
      },
    });
  } else if (renderType === "circle") {
    const circleColor = layerId === "site_utilisation"
      ? [
          "match",
          ["get", "utilisation_band"],
          "Low", "#22c55e",
          "Below Average", "#84cc16",
          "Average", "#f59e0b",
          "Above Average", "#f97316",
          "High", "#ef4444",
          color,
        ] as any
      : color;

    const circleRadius = layerId === "site_utilisation"
      ? [
          "interpolate", ["linear"], ["zoom"],
          6, 2,
          10, 4,
          14, 8,
        ] as any
      : 6;

    map.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": circleRadius,
        "circle-color": circleColor,
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.9,
      },
    });
  } else if (renderType === "fill") {
    map.addLayer({
      id: layerId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": color,
        "fill-opacity": 0.25,
      },
    });
    map.addLayer({
      id: `${layerId}-outline`,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": color,
        "line-width": 1.5,
        "line-opacity": 0.7,
      },
    });
  }
}

export function removeLayerFromMap(map: maplibregl.Map, layerId: string) {
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getLayer(`${layerId}-outline`)) map.removeLayer(`${layerId}-outline`);
  const sourceId = `source-${layerId}`;
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

export function clearLayerCache(layerId?: string) {
  if (layerId) {
    geojsonCache.delete(layerId);
  } else {
    geojsonCache.clear();
  }
}
