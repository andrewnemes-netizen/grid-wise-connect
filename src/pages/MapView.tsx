import "maplibre-gl/dist/maplibre-gl.css";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import maplibregl from "maplibre-gl";
import { useMap } from "@/hooks/useMap";
import { usePolygonDraw } from "@/hooks/usePolygonDraw";
import { PostcodeSearch } from "@/components/map/PostcodeSearch";
import {
  LayerTogglePanel,
  useRegistryLayers,
  type LayerVisibility,
  type RegistryLayer,
} from "@/components/map/LayerTogglePanel";
import { FeatureInfoPanel } from "@/components/map/FeatureInfoPanel";
import { MapLegend } from "@/components/map/MapLegend";
import { MapToolbar } from "@/components/map/MapToolbar";
import { SiteCheckPanel, type ConnectionLine } from "@/components/map/SiteCheckPanel";
import { PolygonSearchResults } from "@/components/map/PolygonSearchResults";
import {
  fetchLayerGeoJSON,
  addRegistryLayerToMap,
  removeRegistryLayerFromMap,
  clearLayerCache,
} from "@/lib/mapLayers";
import { useToast } from "@/hooks/use-toast";

const UK_CENTER: [number, number] = [-1.5, 54.0];

function getMapBbox(map: maplibregl.Map): [number, number, number, number] {
  const bounds = map.getBounds();
  return [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ];
}

const MapView = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map, mapLoaded } = useMap(containerRef);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const pinMarkerRef = useRef<maplibregl.Marker | null>(null);
  const { registryLayers, registryLoading } = useRegistryLayers();
  const [visibility, setVisibility] = useState<LayerVisibility>({});
  const [selectedFeature, setSelectedFeature] = useState<Record<string, unknown> | null>(null);
  const [selectedLayerLabel, setSelectedLayerLabel] = useState("");
  const [activeTool, setActiveTool] = useState<"pin" | "measure" | "polygon" | null>(null);
  const [pinLocation, setPinLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [showSiteCheck, setShowSiteCheck] = useState(false);
  const [loadingLayers, setLoadingLayers] = useState<Set<string>>(new Set());
  const [heatmapMode, setHeatmapMode] = useState(false);
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const { toast } = useToast();
  const { isDrawing, polygon: drawnPolygon, clearDrawing } = usePolygonDraw(map, activeTool === "polygon");

  // Track which layers have click handlers attached
  const clickHandlersRef = useRef<Set<string>>(new Set());
  // Debounce timer ref for viewport refresh
  const moveEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Registry layer lookup
  const layerMap = useMemo(() => {
    const m = new Map<string, RegistryLayer>();
    registryLayers.forEach((l) => m.set(l.id, l));
    return m;
  }, [registryLayers]);

  // Load/refresh a single visible layer with current bbox
  const loadLayer = useCallback(
    async (layerId: string, bbox?: [number, number, number, number]) => {
      const layer = layerMap.get(layerId);
      if (!layer || !map) return;

      setLoadingLayers((prev) => new Set(prev).add(layerId));
      try {
        const geojson = await fetchLayerGeoJSON(layerId, bbox);
        // Find color index within category
        const catLayers = registryLayers.filter((l) => l.category === layer.category && l.dno === layer.dno);
        const colorIdx = catLayers.findIndex((l) => l.id === layerId);
        const isUtil = layer.slug === "npg_hv_substations_utilisation";

        addRegistryLayerToMap(map, layer, geojson, colorIdx, isUtil && heatmapMode);

        // Attach click/hover handlers (once)
        const mapLayerId = `layer-${layerId}`;
        if (!clickHandlersRef.current.has(layerId)) {
          map.on("click", mapLayerId, (e) => {
            if (e.features && e.features.length > 0) {
              setSelectedFeature(e.features[0].properties as Record<string, unknown>);
              setSelectedLayerLabel(layer.display_name);
            }
          });
          map.on("mouseenter", mapLayerId, () => {
            if (activeToolRef.current !== "pin") map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", mapLayerId, () => {
            if (activeToolRef.current !== "pin") map.getCanvas().style.cursor = "";
          });
          clickHandlersRef.current.add(layerId);
        }

        if (geojson.features.length === 0) {
          toast({ title: layer.display_name, description: "No data in this viewport." });
        }
      } catch (err) {
        console.error(`Failed to load layer ${layerId}:`, err);
        toast({ title: "Layer load failed", description: `Could not load ${layer.display_name}`, variant: "destructive" });
      } finally {
        setLoadingLayers((prev) => {
          const next = new Set(prev);
          next.delete(layerId);
          return next;
        });
      }
    },
    [map, layerMap, registryLayers, heatmapMode, toast]
  );

  // Handle layer toggle
  const handleLayerToggle = useCallback(
    async (layerId: string, visible: boolean) => {
      setVisibility((prev) => ({ ...prev, [layerId]: visible }));

      if (!map) return;

      if (visible) {
        const bbox = getMapBbox(map);
        await loadLayer(layerId, bbox);
      } else {
        removeRegistryLayerFromMap(map, layerId);
        clearLayerCache(layerId);
      }
    },
    [map, loadLayer]
  );

  // Viewport-based auto-refresh: reload visible layers on moveend
  useEffect(() => {
    if (!map || !mapLoaded) return;

    const onMoveEnd = () => {
      // Debounce to avoid rapid fire
      if (moveEndTimerRef.current) clearTimeout(moveEndTimerRef.current);
      moveEndTimerRef.current = setTimeout(() => {
        const bbox = getMapBbox(map);
        const visibleLayerIds = Object.entries(visibility)
          .filter(([, v]) => v)
          .map(([id]) => id);

        // Clear cache for visible layers so they refetch with new bbox
        visibleLayerIds.forEach((id) => clearLayerCache(id));

        // Reload all visible layers with new bbox
        visibleLayerIds.forEach((id) => loadLayer(id, bbox));
      }, 500);
    };

    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
      if (moveEndTimerRef.current) clearTimeout(moveEndTimerRef.current);
    };
  }, [map, mapLoaded, visibility, loadLayer]);

  // Postcode search handler
  const handleSearchResult = useCallback(
    (lng: number, lat: number, label: string) => {
      if (!map) return;
      markerRef.current?.remove();
      map.flyTo({ center: [lng, lat], zoom: 15, duration: 1500 });
      const marker = new maplibregl.Marker({ color: "hsl(100, 38%, 30%)" })
        .setLngLat([lng, lat])
        .setPopup(
          new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(
            `<div style="font-size:12px;max-width:220px"><strong>${label.split(",")[0]}</strong><br/><span style="color:#666">${label}</span></div>`
          )
        )
        .addTo(map);
      marker.togglePopup();
      markerRef.current = marker;
    },
    [map]
  );

  const handleCloseFeatureInfo = useCallback(() => {
    setSelectedFeature(null);
    setSelectedLayerLabel("");
  }, []);

  // Connection lines
  const handleConnectionLines = useCallback((lines: ConnectionLine[]) => {
    if (!map) return;
    ["line-primary", "line-feeder", "line-cable"].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getLayer(`${id}-label`)) map.removeLayer(`${id}-label`);
      if (map.getSource(id)) map.removeSource(id);
    });
    lines.forEach((line) => {
      map.addSource(line.id, {
        type: "geojson",
        data: {
          type: "Feature",
          properties: { label: `${line.label}: ${line.distance_m.toLocaleString()}m` },
          geometry: { type: "LineString", coordinates: line.coords },
        },
      });
      map.addLayer({
        id: line.id,
        type: "line",
        source: line.id,
        paint: {
          "line-color": line.color,
          "line-width": 3,
          "line-dasharray": [4, 3],
          "line-opacity": 0.9,
        },
      });
    });
  }, [map]);

  const clearConnectionLines = useCallback(() => {
    if (!map) return;
    ["line-primary", "line-feeder", "line-cable"].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    });
  }, [map]);

  // Pin drop
  useEffect(() => {
    if (!map) return;
    const handler = (e: maplibregl.MapMouseEvent) => {
      if (activeToolRef.current !== "pin") return;
      const { lng, lat } = e.lngLat;
      pinMarkerRef.current?.remove();
      const marker = new maplibregl.Marker({ color: "#e74c3c" })
        .setLngLat([lng, lat])
        .addTo(map);
      pinMarkerRef.current = marker;
      setPinLocation({ lng, lat });
      setShowSiteCheck(true);
      setActiveTool(null);
    };
    map.on("click", handler);
    return () => { map.off("click", handler); };
  }, [map]);

  const handleClear = useCallback(() => {
    markerRef.current?.remove();
    markerRef.current = null;
    pinMarkerRef.current?.remove();
    pinMarkerRef.current = null;
    setPinLocation(null);
    setShowSiteCheck(false);
    setSelectedFeature(null);
    clearConnectionLines();
    clearDrawing();
  }, [clearConnectionLines, clearDrawing]);

  const handleZoomToUK = useCallback(() => {
    if (!map) return;
    map.flyTo({ center: UK_CENTER, zoom: 6, duration: 1200 });
  }, [map]);

  // Cursor for active tools
  useEffect(() => {
    if (!map) return;
    map.getCanvas().style.cursor =
      activeTool === "pin" || activeTool === "measure" || activeTool === "polygon"
        ? "crosshair"
        : "";
  }, [map, activeTool]);

  // Re-render utilisation layer when heatmap mode toggles
  const handleHeatmapToggle = useCallback(
    (enabled: boolean) => {
      setHeatmapMode(enabled);
      const utilLayer = registryLayers.find((l) => l.slug === "npg_hv_substations_utilisation");
      if (utilLayer && visibility[utilLayer.id] && map) {
        clearLayerCache(utilLayer.id);
        const bbox = getMapBbox(map);
        fetchLayerGeoJSON(utilLayer.id, bbox).then((geojson) => {
          const catLayers = registryLayers.filter((l) => l.category === utilLayer.category && l.dno === utilLayer.dno);
          const idx = catLayers.findIndex((l) => l.id === utilLayer.id);
          addRegistryLayerToMap(map, utilLayer, geojson, idx, enabled);
        });
      }
    },
    [map, registryLayers, visibility]
  );

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {mapLoaded && (
        <>
          <PostcodeSearch onResult={handleSearchResult} />
          <LayerTogglePanel
            visibility={visibility}
            onToggle={handleLayerToggle}
            heatmapMode={heatmapMode}
            onHeatmapToggle={handleHeatmapToggle}
            registryLayers={registryLayers}
            loadingLayers={loadingLayers}
          />
          <MapLegend
            registryLayers={registryLayers}
            visibility={visibility}
            heatmapMode={heatmapMode}
          />
          <FeatureInfoPanel
            feature={selectedFeature}
            layerLabel={selectedLayerLabel}
            onClose={handleCloseFeatureInfo}
          />
          <MapToolbar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            onClear={handleClear}
            onZoomToUK={handleZoomToUK}
          />
          {showSiteCheck && pinLocation && (
            <SiteCheckPanel
              lng={pinLocation.lng}
              lat={pinLocation.lat}
              onClose={() => { setShowSiteCheck(false); clearConnectionLines(); }}
              onConnectionLines={handleConnectionLines}
            />
          )}
          {drawnPolygon && (
            <PolygonSearchResults
              polygon={drawnPolygon}
              onClose={() => { clearDrawing(); setActiveTool(null); }}
            />
          )}
        </>
      )}
    </div>
  );
};

export default MapView;
