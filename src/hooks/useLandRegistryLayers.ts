import { useState, useCallback, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";

export interface LandRegistryDataset {
  id: string;
  label: string;
  color: string;
  wmsLayer: string;
  category: string;
}

/**
 * HM Land Registry INSPIRE Index Polygons — free WMS service.
 * No API key required for the WMS endpoint.
 */
const WMS_BASE = "https://inspire.landregistry.gov.uk/inspire/ows";

export const LAND_REGISTRY_DATASETS: LandRegistryDataset[] = [
  {
    id: "lr-inspire-freehold",
    label: "Freehold Extents (INSPIRE)",
    color: "#D4A017",
    wmsLayer: "INSPIRE_Index_Polygons",
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

      const sourceId = `lr-wms-${ds.id}`;
      const layerId = `lr-raster-${ds.id}`;

      // Add source + layer on first toggle-on
      if (!addedRef.current.has(datasetId)) {
        if (!map.getSource(sourceId)) {
          // WMS raster tile source — requests 256x256 PNG tiles
          map.addSource(sourceId, {
            type: "raster",
            tiles: [
              `${WMS_BASE}?service=WMS&version=1.1.1&request=GetMap&layers=${ds.wmsLayer}&styles=&format=image/png&transparent=true&srs=EPSG:3857&width=256&height=256&bbox={bbox-epsg-3857}`,
            ],
            tileSize: 256,
          });
        }

        map.addLayer({
          id: layerId,
          type: "raster",
          source: sourceId,
          paint: {
            "raster-opacity": 0.6,
          },
          layout: { visibility: "visible" },
          minzoom: 12, // Only show at close zoom where polygons are legible
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
