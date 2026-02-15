import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import type { BasemapId } from "@/components/map/BasemapSwitcher";

const UK_CENTER: [number, number] = [-1.5, 54.0];
const DEFAULT_ZOOM = 6;

const BASEMAP_SOURCES: Record<BasemapId, { tiles: string[]; attribution: string; maxzoom?: number }> = {
  street: {
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  satellite: {
    tiles: [
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ],
    attribution: '&copy; <a href="https://www.esri.com">Esri</a> &mdash; Sources: Esri, Maxar, Earthstar Geographics',
    maxzoom: 19,
  },
  topo: {
    tiles: [
      "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    ],
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxzoom: 17,
  },
};

export function useMap(containerRef: React.RefObject<HTMLDivElement>) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            tiles: BASEMAP_SOURCES.street.tiles,
            tileSize: 256,
            attribution: BASEMAP_SOURCES.street.attribution,
          },
        },
        layers: [
          {
            id: "basemap-tiles",
            type: "raster",
            source: "basemap",
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: UK_CENTER,
      zoom: DEFAULT_ZOOM,
      maxZoom: 22,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

    map.on("load", () => setMapLoaded(true));

    mapRef.current = map;
    setMapInstance(map);

    return () => {
      map.remove();
      mapRef.current = null;
      setMapInstance(null);
      setMapLoaded(false);
    };
  }, [containerRef]);

  const setBasemap = useCallback((id: BasemapId) => {
    const map = mapRef.current;
    if (!map) return;

    const cfg = BASEMAP_SOURCES[id];

    // Remove old basemap source+layer, re-add with new tiles
    if (map.getLayer("basemap-tiles")) map.removeLayer("basemap-tiles");
    if (map.getSource("basemap")) map.removeSource("basemap");

    map.addSource("basemap", {
      type: "raster",
      tiles: cfg.tiles,
      tileSize: 256,
      attribution: cfg.attribution,
      maxzoom: cfg.maxzoom,
    });

    // Add basemap layer at the bottom (before all other layers)
    const firstLayerId = map.getStyle().layers?.[0]?.id;
    map.addLayer(
      {
        id: "basemap-tiles",
        type: "raster",
        source: "basemap",
        minzoom: 0,
        maxzoom: cfg.maxzoom || 19,
      },
      firstLayerId
    );
  }, []);

  return { map: mapInstance, mapLoaded, setBasemap };
}
