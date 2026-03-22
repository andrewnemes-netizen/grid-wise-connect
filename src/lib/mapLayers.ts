import { supabase } from "@/integrations/supabase/client";
import type { RegistryLayer } from "@/components/map/LayerTogglePanel";
import { getLayerColor } from "@/components/map/LayerTogglePanel";
import maplibregl from "maplibre-gl";

// Cache for fetched GeoJSON keyed by "layerId:bbox"
const geojsonCache = new Map<string, GeoJSON.FeatureCollection>();

/**
 * Fetch GeoJSON for a layer directly via the database RPC — no edge function needed.
 * Pass bbox as [minLng, minLat, maxLng, maxLat] for viewport filtering.
 */
export async function fetchLayerGeoJSON(
  layerId: string,
  bbox?: [number, number, number, number],
  dnoClip?: string | null,
  featureLimit?: number
): Promise<GeoJSON.FeatureCollection> {
  // Ensure a minimum bbox size so close-zoom queries still capture nearby points
  let bufferedBbox = bbox;
  if (bbox) {
    const lngSpan = bbox[2] - bbox[0];
    const latSpan = bbox[3] - bbox[1];
    const MIN_SPAN = 0.02;
    if (lngSpan < MIN_SPAN || latSpan < MIN_SPAN) {
      const cLng = (bbox[0] + bbox[2]) / 2;
      const cLat = (bbox[1] + bbox[3]) / 2;
      const halfSpan = MIN_SPAN / 2;
      bufferedBbox = [cLng - halfSpan, cLat - halfSpan, cLng + halfSpan, cLat + halfSpan];
    }
  }

  // Round bbox for cache key stability
  const roundedBbox = bufferedBbox
    ? bufferedBbox.map((v) => Math.round(v * 1000) / 1000) as [number, number, number, number]
    : undefined;
  const cacheKey = roundedBbox
    ? `${layerId}:${roundedBbox.join(",")}${dnoClip ? `:${dnoClip}` : ""}`
    : `${layerId}${dnoClip ? `:${dnoClip}` : ""}`;

  if (geojsonCache.has(cacheKey)) {
    return geojsonCache.get(cacheKey)!;
  }

  // Look up the layer's storage_table from the registry
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(layerId);

  let storageTable: string | null = null;
  let resolvedLayerId = layerId;

  if (isUUID) {
    const { data: meta } = await supabase
      .from("layer_registry")
      .select("id, storage_table, enabled")
      .eq("id", layerId)
      .single();
    if (!meta || !meta.enabled) {
      return { type: "FeatureCollection", features: [] };
    }
    storageTable = meta.storage_table;
  } else {
    // Legacy slug lookup
    const { data: meta } = await supabase
      .from("layer_registry")
      .select("id, storage_table, enabled")
      .eq("slug", layerId)
      .single();
    if (!meta || !meta.enabled) {
      return { type: "FeatureCollection", features: [] };
    }
    storageTable = meta.storage_table;
    resolvedLayerId = meta.id;
  }

  if (!storageTable) {
    return { type: "FeatureCollection", features: [] };
  }

  // Call the RPC directly
  const bboxStr = roundedBbox ? roundedBbox.join(",") : null;
  const effectiveLimit = featureLimit ?? 20000;
  const { data: features, error } = await supabase.rpc("get_geo_layer_geojson" as any, {
    _layer_id: resolvedLayerId,
    _storage_table: storageTable,
    _bbox: bboxStr,
    _limit: effectiveLimit,
    _dno_clip: dnoClip || null,
  });

  if (error) {
    console.error(`RPC error for layer ${layerId}:`, error);
    return { type: "FeatureCollection", features: [] };
  }

  const geojson: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: (features as any[]) || [],
  };

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

/**
 * Wait for the map style to be loaded. Returns a promise that resolves
 * once isStyleLoaded() is true, with a timeout to prevent infinite waits.
 */
function waitForStyleLoaded(map: maplibregl.Map, timeoutMs = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    if (map.isStyleLoaded()) {
      resolve(true);
      return;
    }
    let resolved = false;
    const onLoad = () => {
      if (!resolved) {
        resolved = true;
        resolve(true);
      }
    };
    map.once("load", onLoad);
    // Also listen for style.load as a fallback
    map.once("style.load" as any, onLoad);
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(!!map.isStyleLoaded());
      }
    }, timeoutMs);
  });
}

export async function addRegistryLayerToMap(
  map: maplibregl.Map,
  layer: RegistryLayer,
  geojson: GeoJSON.FeatureCollection,
  colorIndex: number,
  heatmap?: boolean
) {
  const sourceId = `source-${layer.id}`;
  const layerMapId = `layer-${layer.id}`;
  const color = getLayerColor(layer, colorIndex);

  // Wait for style to be loaded
  if (!map.isStyleLoaded()) {
    console.log(`Waiting for map style before adding ${layer.display_name}...`);
    const loaded = await waitForStyleLoaded(map);
    if (!loaded) {
      console.warn(`Map style never loaded, skipping layer ${layer.display_name}`);
      return;
    }
  }

  // If source already exists, check if we need a full rebuild (heatmap toggle) or just data update
  const existingSource = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
  if (existingSource && typeof existingSource.setData === "function") {
    const heatLayerExists = !!map.getLayer(`${layerMapId}-heat`);
    const needsHeatmap = !!(heatmap && layer.slug === "npg_hv_substations_utilisation");
    
    // If heatmap state matches what's on the map, just update data in-place
    if (heatLayerExists === needsHeatmap) {
      existingSource.setData(geojson);
      return;
    }
    // Otherwise fall through to full rebuild (remove + re-add with correct layers)
  }

  // Remove any stale remnants (shouldn't happen but safety)
  removeRegistryLayerFromMap(map, layer.id);

  try {
    map.addSource(sourceId, { type: "geojson", data: geojson });
  } catch (err) {
    console.warn(`Failed to add source ${sourceId}:`, err);
    return;
  }

  // Heatmap mode for utilisation layer
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
  }

  const renderType = getRenderType(layer.geometry_type);

  try {
    if (renderType === "circle") {
      let circleColor: any = color;
      let circleRadius: any = 6;

      if (layer.slug === "npg_hv_substations_utilisation") {
        circleColor = [
          "match", ["get", "utilisation_band"],
          "Low", "#00B000",
          "Below Average", "#86C440",
          "Average", "#FFAA00",
          "Above Average", "#F28522",
          "High", "#E9002D",
          color,
        ];
        circleRadius = ["interpolate", ["linear"], ["zoom"], 6, 2, 10, 4, 14, 8];
      } else if (layer.slug === "dft_traffic_count_points") {
        // Data-driven colour by AADF volume (all_motor_vehicles in attrs_json)
        circleColor = [
          "interpolate", ["linear"],
          ["coalesce", ["get", "all_motor_vehicles"], 0],
          0, "#27AE60",      // green — low
          5000, "#F1C40F",   // yellow
          20000, "#E74C3C",  // red — high
          50000, "#8E44AD",  // purple — very high
        ];
        circleRadius = [
          "interpolate", ["linear"],
          ["coalesce", ["get", "all_motor_vehicles"], 0],
          0, 4,
          5000, 6,
          20000, 9,
          50000, 13,
        ];
      }

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
  removeRegistryLayerFromMap(map, layerId);
  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getLayer(`${layerId}-outline`)) map.removeLayer(`${layerId}-outline`);
  const sourceId = `source-${layerId}`;
  if (map.getSource(sourceId)) map.removeSource(sourceId);
}

export function clearLayerCache(layerId?: string) {
  if (layerId) {
    for (const key of geojsonCache.keys()) {
      if (key.startsWith(layerId)) {
        geojsonCache.delete(key);
      }
    }
  } else {
    geojsonCache.clear();
  }
}
