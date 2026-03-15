import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import type { BasemapId } from "@/components/map/BasemapSwitcher";

const UK_CENTER: [number, number] = [-1.5, 54.0];
const DEFAULT_ZOOM = 6;

const MAPBOX_TOKEN = "pk.eyJ1IjoiYW5kcmV3bmVtZXMiLCJhIjoiY21tb3kzcXFnMDYxeTJwc2F5bm1weWt5dyJ9.LE9-j6HiHMEJqnG86aIxEg";
const OS_API_KEY = "j7vwIPqoPOj5tiwNsJGlQ1SDD2GpsehD";

const GOOGLE_MAPS_KEY = "AIzaSyAmWxB25LnJgpULZRuBHG4CjlrEKMcQlTs";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
  "satellite-hd": {
    tiles: [
      `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${MAPBOX_TOKEN}`,
    ],
    attribution: '&copy; <a href="https://www.mapbox.com">Mapbox</a> &copy; Maxar',
    maxzoom: 22,
  },
  "google-satellite": {
    tiles: [
      `https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}&key=${GOOGLE_MAPS_KEY}`,
    ],
    attribution: '&copy; Google',
    maxzoom: 21,
  },
  topo: {
    tiles: [
      "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    ],
    attribution: '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
    maxzoom: 17,
  },
  "os-road": {
    tiles: [
      `https://api.os.uk/maps/raster/v1/zxy/Road_3857/{z}/{x}/{y}.png?key=${OS_API_KEY}`,
    ],
    attribution: '&copy; <a href="https://www.ordnancesurvey.co.uk/">Ordnance Survey</a>',
    maxzoom: 20,
  },
  "os-outdoor": {
    tiles: [
      `https://api.os.uk/maps/raster/v1/zxy/Outdoor_3857/{z}/{x}/{y}.png?key=${OS_API_KEY}`,
    ],
    attribution: '&copy; <a href="https://www.ordnancesurvey.co.uk/">Ordnance Survey</a>',
    maxzoom: 20,
  },
  "os-light": {
    tiles: [
      `https://api.os.uk/maps/raster/v1/zxy/Light_3857/{z}/{x}/{y}.png?key=${OS_API_KEY}`,
    ],
    attribution: '&copy; <a href="https://www.ordnancesurvey.co.uk/">Ordnance Survey</a>',
    maxzoom: 20,
  },
};

export { GOOGLE_MAPS_KEY };

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
      transformRequest: (url) => {
        const tileProxyBase = `${SUPABASE_URL}/functions/v1/planning-vector-tile/`;
        if (SUPABASE_URL && SUPABASE_ANON_KEY && url.startsWith(tileProxyBase)) {
          return {
            url,
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            },
          };
        }
        return { url };
      },
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
