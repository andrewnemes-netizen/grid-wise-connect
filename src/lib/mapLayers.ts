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

export function addLayerToMap(map: maplibregl.Map, layerId: string, geojson: GeoJSON.FeatureCollection, color: string) {
  const sourceId = `source-${layerId}`;
  const renderType = LAYER_RENDER_TYPE[layerId] || "line";

  // Remove existing source/layer if present
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getLayer(`${layerId}-outline`)) map.removeLayer(`${layerId}-outline`);
  if (map.getSource(sourceId)) map.removeSource(sourceId);

  map.addSource(sourceId, {
    type: "geojson",
    data: geojson,
  });

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
    map.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": 6,
        "circle-color": color,
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
