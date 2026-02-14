import "maplibre-gl/dist/maplibre-gl.css";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import maplibregl from "maplibre-gl";
import { Undo2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMap } from "@/hooks/useMap";
import { BasemapSwitcher, type BasemapId } from "@/components/map/BasemapSwitcher";
import { usePolygonDraw } from "@/hooks/usePolygonDraw";
import { useMeasure } from "@/hooks/useMeasure";
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
import { ConnectAssessmentPanel, type ConnectEndpoints } from "@/components/map/ConnectAssessmentPanel";
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
  const { map, mapLoaded, setBasemap } = useMap(containerRef);
  const [basemapId, setBasemapId] = useState<BasemapId>("street");
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const pinMarkerRef = useRef<maplibregl.Marker | null>(null);
  const { registryLayers, registryLoading } = useRegistryLayers();
  const [visibility, setVisibility] = useState<LayerVisibility>({});
  const [selectedFeature, setSelectedFeature] = useState<Record<string, unknown> | null>(null);
  const [selectedLayerLabel, setSelectedLayerLabel] = useState("");
  const [activeTool, setActiveTool] = useState<"pin" | "measure" | "polygon" | "connect" | null>(null);
  const [pinLocation, setPinLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [showSiteCheck, setShowSiteCheck] = useState(false);
  const [loadingLayers, setLoadingLayers] = useState<Set<string>>(new Set());
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [connectSource, setConnectSource] = useState<ConnectEndpoints["source"] | null>(null);
  const [connectWaypoints, setConnectWaypoints] = useState<[number, number][]>([]);
  const [connectEndpoints, setConnectEndpoints] = useState<ConnectEndpoints | null>(null);
  const waypointMarkersRef = useRef<maplibregl.Marker[]>([]);
  const connectDstMarkerRef = useRef<maplibregl.Marker | null>(null);
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const { toast } = useToast();
  const { isDrawing, polygon: drawnPolygon, clearDrawing } = usePolygonDraw(map, activeTool === "polygon");
  const { clearMeasure } = useMeasure(map, activeTool === "measure");

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
    async (layerId: string, bbox?: [number, number, number, number], showEmptyToast = true) => {
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

        if (geojson.features.length === 0 && showEmptyToast) {
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
        visibleLayerIds.forEach((id) => loadLayer(id, bbox, false));
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

  // Pin drop + Connect tool handler
  useEffect(() => {
    if (!map) return;
    const handler = (e: maplibregl.MapMouseEvent) => {
      // Connect mode: multi-point route drawing
      if (activeToolRef.current === "connect") {
        const { lng, lat } = e.lngLat;

        if (!connectSource) {
          // First click: select source asset from visible layer
          const features = map.queryRenderedFeatures(e.point);
          const layerFeature = features.find((f) => f.layer.id.startsWith("layer-"));
          if (!layerFeature) {
            toast({ title: "Click on an asset", description: "First click should be on a visible network asset (substation, feeder, etc.)" });
            return;
          }
          const layerId = layerFeature.layer.id.replace("layer-", "");
          const regLayer = layerMap.get(layerId);
          const coords = layerFeature.geometry.type === "Point"
            ? (layerFeature.geometry as GeoJSON.Point).coordinates as [number, number]
            : [lng, lat] as [number, number];

          // Place marker on source
          pinMarkerRef.current?.remove();
          const srcMarker = new maplibregl.Marker({ color: "#3498db" })
            .setLngLat(coords)
            .addTo(map);
          pinMarkerRef.current = srcMarker;

          setConnectSource({
            lngLat: coords,
            properties: (layerFeature.properties || {}) as Record<string, unknown>,
            layerLabel: regLayer?.display_name || "Asset",
          });
          setConnectWaypoints([]);
          toast({ title: `Source: ${regLayer?.display_name || "Asset"}`, description: "Click to add route waypoints. Double-click to finish." });
        } else {
          // Subsequent clicks: add waypoint
          const newPoint: [number, number] = [lng, lat];
          const updatedWaypoints = [...connectWaypoints, newPoint];
          setConnectWaypoints(updatedWaypoints);

          // Place a small waypoint marker
          const wpMarker = new maplibregl.Marker({ color: "#9b59b6", scale: 0.6 })
            .setLngLat(newPoint)
            .addTo(map);
          waypointMarkersRef.current.push(wpMarker);

          // Update the polyline on the map
          const allCoords = [connectSource.lngLat, ...updatedWaypoints];
          const lineId = "connect-line";
          if (map.getSource(lineId)) {
            (map.getSource(lineId) as maplibregl.GeoJSONSource).setData({
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: allCoords },
            });
          } else {
            map.addSource(lineId, {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: allCoords },
              },
            });
            map.addLayer({
              id: lineId,
              type: "line",
              source: lineId,
              paint: { "line-color": "#2ecc71", "line-width": 3, "line-dasharray": [4, 3] },
            });
          }
        }
        return;
      }

      // Pin mode
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

    // Double-click to finish connect route
    const dblClickHandler = (e: maplibregl.MapMouseEvent) => {
      if (activeToolRef.current !== "connect" || !connectSource) return;
      e.preventDefault();
      
      const waypoints = connectWaypoints;
      if (waypoints.length === 0) return; // need at least one waypoint

      const lastPoint = waypoints[waypoints.length - 1];
      const allCoords: [number, number][] = [connectSource.lngLat, ...waypoints];

      // Place destination marker on last point
      connectDstMarkerRef.current?.remove();
      const dstEl = document.createElement("div");
      dstEl.style.cssText = "width:18px;height:18px;background:#e74c3c;border:3px solid #fff;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,0.5);";
      const dstMarker = new maplibregl.Marker({ element: dstEl })
        .setLngLat(lastPoint)
        .addTo(map);
      connectDstMarkerRef.current = dstMarker;

      setConnectEndpoints({
        source: connectSource,
        destination: { lngLat: lastPoint },
        routeCoords: allCoords,
      });
      setActiveTool(null);
    };
    map.on("dblclick", dblClickHandler);

    return () => {
      map.off("click", handler);
      map.off("dblclick", dblClickHandler);
    };
  }, [map, connectSource, connectWaypoints, layerMap, toast]);

  const clearWaypointMarkers = useCallback(() => {
    waypointMarkersRef.current.forEach((m) => m.remove());
    waypointMarkersRef.current = [];
  }, []);

  const handleClear = useCallback(() => {
    markerRef.current?.remove();
    markerRef.current = null;
    pinMarkerRef.current?.remove();
    pinMarkerRef.current = null;
    connectDstMarkerRef.current?.remove();
    connectDstMarkerRef.current = null;
    clearWaypointMarkers();
    setPinLocation(null);
    setShowSiteCheck(false);
    setSelectedFeature(null);
    setConnectSource(null);
    setConnectWaypoints([]);
    setConnectEndpoints(null);
    clearConnectionLines();
    clearDrawing();
    clearMeasure();
    // Clear connect line
    if (map) {
      if (map.getLayer("connect-line")) map.removeLayer("connect-line");
      if (map.getSource("connect-line")) map.removeSource("connect-line");
    }
  }, [clearConnectionLines, clearDrawing, clearMeasure, clearWaypointMarkers, map]);

  // Finish route: finalize the multi-point connect route
  const handleFinishRoute = useCallback(() => {
    if (!connectSource || connectWaypoints.length === 0 || !map) return;
    const lastPoint = connectWaypoints[connectWaypoints.length - 1];
    const allCoords: [number, number][] = [connectSource.lngLat, ...connectWaypoints];

    // Place destination marker on last point
    connectDstMarkerRef.current?.remove();
    const dstEl = document.createElement("div");
    dstEl.style.cssText = "width:18px;height:18px;background:#e74c3c;border:3px solid #fff;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,0.5);";
    const dstMarker = new maplibregl.Marker({ element: dstEl })
      .setLngLat(lastPoint)
      .addTo(map);
    connectDstMarkerRef.current = dstMarker;

    setConnectEndpoints({
      source: connectSource,
      destination: { lngLat: lastPoint },
      routeCoords: allCoords,
    });
    setActiveTool(null);
  }, [connectSource, connectWaypoints, map]);

  // Undo last waypoint
  const handleUndoWaypoint = useCallback(() => {
    if (!map || connectWaypoints.length === 0 || !connectSource) return;
    const updated = connectWaypoints.slice(0, -1);
    setConnectWaypoints(updated);

    // Remove last waypoint marker
    const lastMarker = waypointMarkersRef.current.pop();
    lastMarker?.remove();

    // Update polyline
    const allCoords = [connectSource.lngLat, ...updated];
    const lineId = "connect-line";
    if (updated.length === 0) {
      if (map.getLayer(lineId)) map.removeLayer(lineId);
      if (map.getSource(lineId)) map.removeSource(lineId);
    } else if (map.getSource(lineId)) {
      (map.getSource(lineId) as maplibregl.GeoJSONSource).setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: allCoords },
      });
    }
  }, [connectSource, connectWaypoints, map]);

  const handleZoomToUK = useCallback(() => {
    if (!map) return;
    map.flyTo({ center: UK_CENTER, zoom: 6, duration: 1200 });
  }, [map]);

  // Capture map screenshot - fits bounds to route with 100m buffer on street basemap
  const handleCaptureMapScreenshot = useCallback(async (): Promise<string | null> => {
    if (!map || !connectEndpoints) return null;

    // Switch to street basemap so roads, buildings, road names are visible
    setBasemap("street");

    // Fit map to show full route with ~100m buffer
    const coords = connectEndpoints.routeCoords;
    const bounds = new maplibregl.LngLatBounds(coords[0], coords[0]);
    coords.forEach((c) => bounds.extend(c));

    // Add ~100m buffer: 100m ≈ 0.0009 degrees latitude, ~0.0014 degrees longitude at UK latitudes
    const BUFFER_DEG_LAT = 0.0009;
    const BUFFER_DEG_LNG = 0.0014;
    bounds.extend([bounds.getWest() - BUFFER_DEG_LNG, bounds.getSouth() - BUFFER_DEG_LAT]);
    bounds.extend([bounds.getEast() + BUFFER_DEG_LNG, bounds.getNorth() + BUFFER_DEG_LAT]);

    map.fitBounds(bounds, { padding: 40, duration: 0 });

    // Wait for tiles to load then capture
    return new Promise((resolve) => {
      const waitForIdle = () => {
        if (map.areTilesLoaded()) {
          try {
            const dataUrl = map.getCanvas().toDataURL("image/png");
            resolve(dataUrl);
          } catch (e) {
            console.warn("Map screenshot capture failed:", e);
            resolve(null);
          }
        } else {
          map.once("idle", () => {
            try {
              const dataUrl = map.getCanvas().toDataURL("image/png");
              resolve(dataUrl);
            } catch (e) {
              console.warn("Map screenshot capture failed:", e);
              resolve(null);
            }
          });
        }
      };
      // Give time for basemap switch + bounds fit
      setTimeout(waitForIdle, 500);
    });
  }, [map, connectEndpoints, setBasemap]);

  // Cursor for active tools
  useEffect(() => {
    if (!map) return;
    map.getCanvas().style.cursor =
      activeTool === "pin" || activeTool === "measure" || activeTool === "polygon" || activeTool === "connect"
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
          <BasemapSwitcher
            active={basemapId}
            onChange={(id) => {
              setBasemapId(id);
              setBasemap(id);
            }}
          />
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
            onToolChange={(tool) => {
              if (tool !== "connect") {
                setConnectSource(null);
                setConnectWaypoints([]);
                clearWaypointMarkers();
              }
              setActiveTool(tool);
            }}
            onClear={handleClear}
            onZoomToUK={handleZoomToUK}
          />
          {/* Route drawing controls */}
          {activeTool === "connect" && connectSource && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-background/95 backdrop-blur rounded-lg border shadow-lg px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {connectWaypoints.length === 0
                  ? "Click to add route points"
                  : `${connectWaypoints.length} point${connectWaypoints.length !== 1 ? "s" : ""} — click to add more`}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={connectWaypoints.length === 0}
                onClick={handleUndoWaypoint}
              >
                <Undo2 className="h-3 w-3 mr-1" />Undo
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={connectWaypoints.length === 0}
                onClick={handleFinishRoute}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />Finish
              </Button>
            </div>
          )}
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
          {connectEndpoints && (
            <ConnectAssessmentPanel
              endpoints={connectEndpoints}
              onCaptureMapScreenshot={handleCaptureMapScreenshot}
              onClose={() => {
                setConnectEndpoints(null);
                setConnectSource(null);
                setConnectWaypoints([]);
                clearWaypointMarkers();
                handleClear();
              }}
            />
          )}
        </>
      )}
    </div>
  );
};

export default MapView;
