import { supabase } from "@/integrations/supabase/client";
import type { RegistryLayer } from "@/components/map/LayerTogglePanel";
import { getLayerColor } from "@/components/map/LayerTogglePanel";
import maplibregl from "maplibre-gl";

// Cache for fetched GeoJSON keyed by "layerId:bbox"
const geojsonCache = new Map<string, GeoJSON.FeatureCollection>();

/**
 * Fetch GeoJSON for a layer. Supports both legacy slugs and new UUID layer_ids.
 * Pass bbox as [minLng, minLat, maxLng, maxLat] for viewport filtering.
 */
export async function fetchLayerGeoJSON(
  layerId: string,
  bbox?: [number, number, number, number],
  dnoClip?: string | null
): Promise<GeoJSON.FeatureCollection> {
  // Ensure a minimum bbox size so close-zoom queries still capture nearby points
  let bufferedBbox = bbox;
  if (bbox) {
    const lngSpan = bbox[2] - bbox[0];
    const latSpan = bbox[3] - bbox[1];
    const MIN_SPAN = 0.1; // ~10km minimum extent – ensures data loads at street-level zoom
    if (lngSpan < MIN_SPAN || latSpan < MIN_SPAN) {
      const cLng = (bbox[0] + bbox[2]) / 2;
      const cLat = (bbox[1] + bbox[3]) / 2;
      const halfSpan = MIN_SPAN / 2;
      bufferedBbox = [cLng - halfSpan, cLat - halfSpan, cLng + halfSpan, cLat + halfSpan];
    }
  }

  // Round bbox to 2 decimal places for cache key stability
  const roundedBbox = bufferedBbox
    ? bufferedBbox.map((v) => Math.round(v * 1000) / 1000) as [number, number, number, number]
    : undefined;
  const cacheKey = roundedBbox
    ? `${layerId}:${roundedBbox.join(",")}${dnoClip ? `:${dnoClip}` : ""}`
    : `${layerId}${dnoClip ? `:${dnoClip}` : ""}`;

  if (geojsonCache.has(cacheKey)) {
    return geojsonCache.get(cacheKey)!;
  }

  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;

  // Determine if layerId is a UUID (new system) or a slug (legacy)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(layerId);
  const params = new URLSearchParams();
  if (isUUID) {
    params.set("layer_id", layerId);
  } else {
    params.set("layer", layerId);
  }
  if (roundedBbox) {
    params.set("bbox", roundedBbox.join(","));
  }
  if (dnoClip) {
    params.set("dno_clip", dnoClip);
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-layer-geojson?${params}`;
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
  geojsonCache.set(cacheKey, geojson);
  return geojson;
}

/** Determine MapLibre layer type from geometry_type */
function getRenderType(geometryType: string): "circle" | "line" | "fill" {
  const gt = geometryType.toLowerCase();
  if (gt.includes("point")) return "circle";
  if (gt.includes("line")) return "line";
  if (gt.includes("polygon")) return "fill";
  return "circle";
}

export function addRegistryLayerToMap(
  map: maplibregl.Map,
  layer: RegistryLayer,
  geojson: GeoJSON.FeatureCollection,
  colorIndex: number,
  heatmap?: boolean
) {
  const sourceId = `source-${layer.id}`;
  const layerMapId = `layer-${layer.id}`;
  const color = getLayerColor(layer, colorIndex);

  // Guard: ensure map style is loaded before mutating sources/layers
  if (!map.isStyleLoaded()) {
    console.warn(`Map style not loaded, deferring layer ${layer.display_name}`);
    map.once("idle", () => {
      try { addRegistryLayerToMap(map, layer, geojson, colorIndex, heatmap); } catch {}
    });
    return;
  }

  // Remove existing
  removeRegistryLayerFromMap(map, layer.id);

  try {
    map.addSource(sourceId, { type: "geojson", data: geojson });
  } catch (err) {
    console.warn(`Failed to add source ${sourceId}:`, err);
    // Source may already exist — try updating data instead
    const existing = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
    if (existing && typeof existing.setData === "function") {
      existing.setData(geojson);
    } else {
      return;
    }
  }

  // Heatmap mode for utilisation layer — render heatmap AND circle layer
  if (heatmap && layer.slug === "npg_hv_substations_utilisation") {
    try {
      map.addLayer({
        id: `${layerMapId}-heat`,
        type: "heatmap",
        source: sourceId,
        paint: {
          "heatmap-weight": [
            "interpolate", ["linear"], ["coalesce", ["get", "utilisation_pct"], 50],
            0, 0, 100, 1,
          ],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 9, 2],
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(0,0,0,0)",
            0.2, "hsl(141, 53%, 53%)",
            0.4, "hsl(80, 60%, 55%)",
            0.6, "hsl(45, 97%, 64%)",
            0.8, "hsl(27, 95%, 55%)",
            1, "hsl(0, 86%, 57%)",
          ],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 4, 6, 15, 10, 30, 14, 50],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0.85, 14, 0.5],
        },
      } as any);
    } catch (err) {
      console.warn("Heatmap layer failed, falling back to circles only:", err);
    }
    // Don't return — still add circle layer below for pin drops & click interactions
  }

  const renderType = getRenderType(layer.geometry_type);

  try {
    if (renderType === "circle") {
      const circleColor = layer.slug === "npg_hv_substations_utilisation"
        ? [
            "match", ["get", "utilisation_band"],
            "Low", "#22c55e",
            "Below Average", "#84cc16",
            "Average", "#f59e0b",
            "Above Average", "#f97316",
            "High", "#ef4444",
            color,
          ] as any
        : color;

      const circleRadius = layer.slug === "npg_hv_substations_utilisation"
        ? ["interpolate", ["linear"], ["zoom"], 6, 2, 10, 4, 14, 8] as any
        : 6;

      map.addLayer({
        id: layerMapId,
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
    } else if (renderType === "line") {
      map.addLayer({
        id: layerMapId,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": color,
          "line-width": 2.5,
          "line-opacity": 0.85,
        },
      });
    } else if (renderType === "fill") {
      map.addLayer({
        id: layerMapId,
        type: "fill",
        source: sourceId,
        paint: {
          "fill-color": color,
          "fill-opacity": 0.25,
        },
      });
      map.addLayer({
        id: `${layerMapId}-outline`,
        type: "line",
        source: sourceId,
        paint: {
          "line-color": color,
          "line-width": 1.5,
          "line-opacity": 0.7,
        },
      });
    }
  } catch (err) {
    console.warn(`Failed to add render layer for ${layer.display_name}:`, err);
  }
}

export function removeRegistryLayerFromMap(map: maplibregl.Map, layerId: string) {
  try {
    const mapLayerId = `layer-${layerId}`;
    if (map.getLayer(mapLayerId)) map.removeLayer(mapLayerId);
    if (map.getLayer(`${mapLayerId}-outline`)) map.removeLayer(`${mapLayerId}-outline`);
    if (map.getLayer(`${mapLayerId}-heat`)) map.removeLayer(`${mapLayerId}-heat`);
    const sourceId = `source-${layerId}`;
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  } catch (err) {
    console.warn(`Error removing layer ${layerId}:`, err);
  }
}

// Legacy exports for backward compatibility
export { addRegistryLayerToMap as addLayerToMap };

export function removeLayerFromMap(map: maplibregl.Map, layerId: string) {
  // Try both naming conventions
  removeRegistryLayerFromMap(map, layerId);
  // Also try legacy naming without prefix
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getLayer(`${layerId}-outline`)) map.removeLayer(`${layerId}-outline`);
  const sourceId = `source-${layerId}`;
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

export function clearLayerCache(layerId?: string) {
  if (layerId) {
    // Clear all cache entries for this layer
    for (const key of geojsonCache.keys()) {
      if (key.startsWith(layerId)) {
        geojsonCache.delete(key);
      }
    }
  } else {
    geojsonCache.clear();
  }
}
