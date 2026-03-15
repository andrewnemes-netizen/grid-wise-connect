import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { Map as MaplibreMap } from "maplibre-gl";

export interface LandRegistryDataset {
  id: string;
  label: string;
  color: string;
  wmsLayer: string;
  category: string;
}

/**
 * HM Land Registry INSPIRE index polygons via public OSMUK tile service.
 * Source: https://tiles.osmuk.org/PropertyBoundaries/{z}/{x}/{y}.png
 */
const LAND_REGISTRY_TILE_URL = "https://tiles.osmuk.org/PropertyBoundaries/{z}/{x}/{y}.png";

export const LAND_REGISTRY_DATASETS: LandRegistryDataset[] = [
  {
    id: "lr-inspire-cadastral",
    label: "Cadastral Parcels (INSPIRE)",
    color: "#D4A017",
    wmsLayer: "inspire:CP.CadastralParcel",
    category: "ownership",
  },
];

interface LandRegistryLayerState {
  [datasetId: string]: boolean;
}

export function useLandRegistryLayers() {
  const [lrVisibility, setLrVisibility] = useState<LandRegistryLayerState>({});
  const [lrLoading] = useState<Set<string>>(new Set());
  const addedRef = useRef<Set<string>>(new Set());

  const toggleLandRegistryLayer = useCallback(
    (datasetId: string, visible: boolean, map: MaplibreMap | null) => {
      setLrVisibility((prev) => ({ ...prev, [datasetId]: visible }));

      if (!map) return;

      const ds = LAND_REGISTRY_DATASETS.find((d) => d.id === datasetId);
      if (!ds) return;

      if (visible && map.getZoom() < 18) {
        toast.info("Zoom in to level 18+ to view cadastral parcels.");
      }

      const sourceId = `lr-wms-${ds.id}`;
      const layerId = `lr-raster-${ds.id}`;

      // Add source + layer on first toggle-on
      if (!addedRef.current.has(datasetId)) {
        if (!map.getSource(sourceId)) {
          // The INSPIRE WMS supports EPSG:900913 which is equivalent to EPSG:3857
          map.addSource(sourceId, {
            type: "raster",
            tiles: [
              `${WMS_PROXY}?service=WMS&version=1.1.1&request=GetMap&layers=${encodeURIComponent(ds.wmsLayer)}&styles=&format=image/png&transparent=true&srs=EPSG:900913&width=256&height=256&bbox={bbox-epsg-3857}`,
            ],
            tileSize: 256,
          });
        }

        map.addLayer({
          id: layerId,
          type: "raster",
          source: sourceId,
          paint: {
            "raster-opacity": 0.65,
          },
          layout: { visibility: "visible" },
          minzoom: 12,
        });

        addedRef.current.add(datasetId);
        console.log(`Added Land Registry WMS layer: ${ds.label}`);
        return;
      }

      // Toggle visibility
      const vis = visible ? "visible" : "none";
      if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", vis);
    },
    []
  );

  return {
    lrVisibility,
    lrLoading,
    toggleLandRegistryLayer,
    lrDatasets: LAND_REGISTRY_DATASETS,
  };
}
