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

const BASEMAP_SOURCES: Record<string, { tiles: string[]; attribution: string; maxzoom?: number }> = {
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

// Cached OS VTS style
let osVtsStyleCache: any = null;

async function fetchOsVtsStyle(): Promise<any> {
  if (osVtsStyleCache) return osVtsStyleCache;
  const res = await fetch(
    `https://api.os.uk/maps/vector/v1/vts/resources/styles?srs=3857&key=${OS_API_KEY}`
  );
  if (!res.ok) throw new Error(`Failed to fetch OS VTS style: ${res.status}`);
  osVtsStyleCache = await res.json();
  return osVtsStyleCache;
}

export { GOOGLE_MAPS_KEY, OS_API_KEY };

export function useMap(containerRef: React.RefObject<HTMLDivElement>) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const currentBasemapRef = useRef<BasemapId>("street");

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

  const setBasemap = useCallback(async (id: BasemapId) => {
    const map = mapRef.current;
    if (!map) return;

    const prevBasemap = currentBasemapRef.current;
    currentBasemapRef.current = id;

    // ── Switching TO OS Vector Tiles ──
    if (id === "os-vector") {
      try {
        const style = await fetchOsVtsStyle();

        // Capture current center/zoom to restore after style swap
        const center = map.getCenter();
        const zoom = map.getZoom();
        const bearing = map.getBearing();
        const pitch = map.getPitch();

        // Capture all non-basemap sources and layers to re-add
        const currentStyle = map.getStyle();
        const customSources: Record<string, any> = {};
        const customLayers: any[] = [];

        if (currentStyle) {
          for (const [srcId, srcDef] of Object.entries(currentStyle.sources || {})) {
            if (srcId !== "basemap") {
              customSources[srcId] = srcDef;
            }
          }
          for (const layer of currentStyle.layers || []) {
            if (layer.id !== "basemap-tiles") {
              customLayers.push(layer);
            }
          }
        }

        // Merge OS VTS style with custom sources and layers
        const mergedStyle = {
          ...style,
          sources: {
            ...style.sources,
            ...customSources,
          },
          layers: [
            ...style.layers,
            ...customLayers,
          ],
        };

        map.setStyle(mergedStyle);

        map.once("style.load" as any, () => {
          map.jumpTo({ center, zoom, bearing, pitch });
        });
      } catch (err) {
        console.error("Failed to load OS Vector Tiles:", err);
        currentBasemapRef.current = prevBasemap;
      }
      return;
    }

    // ── Switching FROM OS Vector Tiles to raster ──
    if (prevBasemap === "os-vector") {
      const cfg = BASEMAP_SOURCES[id];
      if (!cfg) return;

      const center = map.getCenter();
      const zoom = map.getZoom();
      const bearing = map.getBearing();
      const pitch = map.getPitch();

      // Capture custom sources/layers (non-esri, non-OS VTS)
      const currentStyle = map.getStyle();
      const customSources: Record<string, any> = {};
      const customLayers: any[] = [];

      if (currentStyle) {
        const osLayerIds = new Set((currentStyle.layers || [])
          .filter((l: any) => l.source === "esri")
          .map((l: any) => l.id));

        for (const [srcId, srcDef] of Object.entries(currentStyle.sources || {})) {
          if (srcId !== "esri") {
            customSources[srcId] = srcDef;
          }
        }
        for (const layer of currentStyle.layers || []) {
          if (!osLayerIds.has(layer.id) && layer.id !== "background") {
            customLayers.push(layer);
          }
        }
      }

      const rasterStyle: any = {
        version: 8,
        sources: {
          basemap: {
            type: "raster",
            tiles: cfg.tiles,
            tileSize: 256,
            attribution: cfg.attribution,
            maxzoom: cfg.maxzoom,
          },
          ...customSources,
        },
        layers: [
          {
            id: "basemap-tiles",
            type: "raster",
            source: "basemap",
            minzoom: 0,
            maxzoom: cfg.maxzoom || 19,
          },
          ...customLayers,
        ],
      };

      map.setStyle(rasterStyle);
      map.once("style.load" as any, () => {
        map.jumpTo({ center, zoom, bearing, pitch });
      });
      return;
    }

    // ── Normal raster-to-raster swap ──
    const cfg = BASEMAP_SOURCES[id];
    if (!cfg) return;

    if (map.getLayer("basemap-tiles")) map.removeLayer("basemap-tiles");
    if (map.getSource("basemap")) map.removeSource("basemap");

    map.addSource("basemap", {
      type: "raster",
      tiles: cfg.tiles,
      tileSize: 256,
      attribution: cfg.attribution,
      maxzoom: cfg.maxzoom,
    });

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
