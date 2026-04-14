import "maplibre-gl/dist/maplibre-gl.css";
import { useRef, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import maplibregl from "maplibre-gl";
import { Undo2, CheckCircle2, Trash2, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlanningLayers } from "@/hooks/usePlanningLayers";
import { useLandRegistryLayers } from "@/hooks/useLandRegistryLayers";
import { useOsOpenLayers } from "@/hooks/useOsOpenLayers";
import { Badge } from "@/components/ui/badge";
import { useMap } from "@/hooks/useMap";
import { useLayerManager } from "@/hooks/useLayerManager";
import { useConnectTool } from "@/hooks/useConnectTool";
import { usePinDrop } from "@/hooks/usePinDrop";
import { useMapScreenshot } from "@/hooks/useMapScreenshot";
import { usePolygonDraw } from "@/hooks/usePolygonDraw";
import { useBoundaryDraw } from "@/hooks/useBoundaryDraw";
import { useMeasure } from "@/hooks/useMeasure";
import { useActiveStudy } from "@/hooks/useActiveStudy";
import { useDesignMode } from "@/hooks/useDesignMode";
import { BasemapSwitcher, type BasemapId } from "@/components/map/BasemapSwitcher";
import { PostcodeSearch } from "@/components/map/PostcodeSearch";
import { LayerTogglePanel } from "@/components/map/LayerTogglePanel";
import { FeatureInfoPanel } from "@/components/map/FeatureInfoPanel";
import { MapLegend } from "@/components/map/MapLegend";
import { MapToolbar } from "@/components/map/MapToolbar";
import { UnifiedIntelligencePanel, type ConnectionLine } from "@/components/map/UnifiedIntelligencePanel";
import { PolygonSearchResults } from "@/components/map/PolygonSearchResults";
import { AssessmentPanel } from "@/components/map/AssessmentPanel";
import { DesignModePanel } from "@/components/map/DesignModePanel";
import { clearLayerCache, fetchLayerGeoJSON, addRegistryLayerToMap } from "@/lib/mapLayers";
import { StreetViewPanel, type StreetViewMarker, type StreetViewCapture } from "@/components/map/StreetViewPanel";

import type { RouteAutoDetectResult } from "@/hooks/useRouteAutoDetect";

const UK_CENTER: [number, number] = [-1.5, 54.0];

function calcRouteLength(coords: [number, number][]): number {
  let t = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    t += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return t;
}

function CableDrawingBar({ vertices, onUndo, onFinish }: { vertices: [number, number][]; onUndo: () => void; onFinish: () => void }) {
  const dist = vertices.length >= 2 ? Math.round(calcRouteLength(vertices)) : 0;
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-background/95 backdrop-blur rounded-lg border shadow-lg px-3 py-2">
      <span className="text-xs text-muted-foreground">
        {vertices.length} point{vertices.length !== 1 ? "s" : ""} — {dist.toLocaleString()}m
      </span>
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onUndo}>
        <Undo2 className="h-3 w-3 mr-1" />Undo
      </Button>
      <Button size="sm" className="h-7 text-xs" disabled={vertices.length < 2} onClick={onFinish}>
        <CheckCircle2 className="h-3 w-3 mr-1" />Finish
      </Button>
    </div>
  );
}

const MapView = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast: mapToast } = useToast();
  const { map, mapLoaded, setBasemap } = useMap(containerRef);
  const [basemapId, setBasemapId] = useState<BasemapId>("street");
  const [activeTool, setActiveTool] = useState<"pin" | "measure" | "polygon" | "assess" | "boundary" | "design" | "streetview" | null>(null);
  const [streetViewLocation, setStreetViewLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [streetViewCaptures, setStreetViewCaptures] = useState<StreetViewCapture[]>([]);
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [autoDetectResult, setAutoDetectResult] = useState<RouteAutoDetectResult | null>(null);
  const [selectedDno, setSelectedDno] = useState<string | null>(null);
  const [assessLocation, setAssessLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [routeDrawActive, setRouteDrawActive] = useState(false);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const connectionLinesRef = useRef<ConnectionLine[]>([]);
  const activeToolRef = useRef(activeTool);
  const routeDrawRef = useRef(routeDrawActive);
  activeToolRef.current = activeTool;
  routeDrawRef.current = routeDrawActive;

  // Extracted hooks
  const {
    registryLayers, visibility, handleLayerToggle, loadingLayers,
    selectedFeature, selectedLayerLabel, closeFeatureInfo, goToLayerCoverage, layerMap,
  } = useLayerManager(map, mapLoaded, heatmapMode, selectedDno);

  const connect = useConnectTool(map, layerMap);
  const pin = usePinDrop(map);
  const { isDrawing, polygon: drawnPolygon, clearDrawing } = usePolygonDraw(map, activeTool === "polygon");
  const boundary = useBoundaryDraw(map, activeTool === "boundary");
  const { captureScreenshot } = useMapScreenshot(map, setBasemap, boundary.vertices.length > 0 ? boundary.vertices : null);
  const { clearMeasure } = useMeasure(map, activeTool === "measure");
  const activeStudy = useActiveStudy();
  const design = useDesignMode(map, activeStudy.studyId);
  const planning = usePlanningLayers();
  const landRegistry = useLandRegistryLayers();
  const osOpen = useOsOpenLayers();

  // Deep-link: fly to site from Portfolio → Site Detail
  const [existingSiteId, setExistingSiteId] = useState<string | null>(null);

  useEffect(() => {
    if (!map || !mapLoaded) return;
    const lat = parseFloat(searchParams.get("lat") || "");
    const lng = parseFloat(searchParams.get("lng") || "");
    const siteName = searchParams.get("siteName") || "";
    const siteId = searchParams.get("siteId") || null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    if (siteId) setExistingSiteId(siteId);
    setSearchParams({}, { replace: true });

    map.flyTo({ center: [lng, lat], zoom: 16, duration: 1500 });

    markerRef.current?.remove();
    const marker = new maplibregl.Marker({ color: "hsl(100, 38%, 30%)" })
      .setLngLat([lng, lat])
      .setPopup(
        new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(
          `<div style="font-size:12px"><strong>${siteName || "Site"}</strong></div>`
        )
      )
      .addTo(map);
    marker.togglePopup();
    markerRef.current = marker;

    pin.setPinLocation({ lng, lat });

    mapToast({
      title: `${siteName || "Site"} loaded`,
      description: "Use the Assess tool to run a full assessment.",
    });
  }, [map, mapLoaded]);

  // Auto-save boundary to study when finished
  useEffect(() => {
    if (boundary.polygon && activeStudy.study) {
      activeStudy.saveBoundary(boundary.polygon);
    }
  }, [boundary.polygon]);

  // Auto-save route to study when connect finishes
  useEffect(() => {
    if (connect.connectEndpoints && activeStudy.study) {
      const lineString: GeoJSON.LineString = {
        type: "LineString",
        coordinates: connect.connectEndpoints.routeCoords,
      };
      activeStudy.saveRoute(lineString);
    }
  }, [connect.connectEndpoints]);

  // Map click dispatcher
  useEffect(() => {
    if (!map) return;
    const handler = (e: maplibregl.MapMouseEvent) => {
      if (activeToolRef.current === "design") {
        if (design.drawingCableType) {
          design.addCableVertex(e.lngLat.lng, e.lngLat.lat);
        } else {
          design.placeElement(e.lngLat.lng, e.lngLat.lat);
        }
        return;
      }
      if (activeToolRef.current === "boundary") {
        boundary.handleBoundaryClick(e);
        return;
      }
      if (activeToolRef.current === "assess") {
        if (routeDrawRef.current) {
          // Route draw mode: all clicks go to connect tool
          connect.handleConnectClick(e);
        } else {
          // Pin drop mode: drop pin at click location
          setAssessLocation({ lng: e.lngLat.lng, lat: e.lngLat.lat });
          setActiveTool(null);
        }
        return;
      }
      if (activeToolRef.current === "streetview") {
        setStreetViewLocation({ lng: e.lngLat.lng, lat: e.lngLat.lat });
        setActiveTool(null);
        return;
      }
      if (activeToolRef.current === "pin") {
        pin.handlePinClick(e);
        setActiveTool(null);
        return;
      }
    };
    const dblHandler = (e: maplibregl.MapMouseEvent) => {
      if (activeToolRef.current === "design" && design.drawingCableType) {
        e.preventDefault();
        design.finishCable();
        return;
      }
      if (activeToolRef.current === "boundary") {
        boundary.handleBoundaryDblClick(e);
        setActiveTool(null);
        return;
      }
      if (activeToolRef.current === "assess" && connect.connectSource) {
        connect.handleDblClick(e);
        // After finishing route, open assess panel at destination
        if (connect.connectWaypoints.length > 0) {
          const lastPt = connect.connectWaypoints[connect.connectWaypoints.length - 1];
          setAssessLocation({ lng: lastPt[0], lat: lastPt[1] });
        }
        setActiveTool(null);
      }
    };
    map.on("click", handler);
    map.on("dblclick", dblHandler);
    return () => {
      map.off("click", handler);
      map.off("dblclick", dblHandler);
    };
  }, [map, connect, pin, boundary, design]);

  // Cursor for active tools
  useEffect(() => {
    if (!map) return;
    map.getCanvas().style.cursor =
      activeTool === "pin" || activeTool === "measure" || activeTool === "polygon" || activeTool === "assess" || activeTool === "boundary" || activeTool === "design" || activeTool === "streetview"
        ? "crosshair"
        : "";
  }, [map, activeTool]);

  // Postcode search
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

  // Connection lines from SiteCheckPanel
  const handleConnectionLines = useCallback((lines: ConnectionLine[]) => {
    if (!map) return;
    connectionLinesRef.current = lines;
    ["line-cable"].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
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
        paint: { "line-color": line.color, "line-width": 3, "line-dasharray": [4, 3], "line-opacity": 0.9 },
      });
    });
  }, [map]);

  const clearConnectionLines = useCallback(() => {
    if (!map) return;
    connectionLinesRef.current = [];
    ["line-cable"].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
    });
  }, [map]);

  // Clear all
  const handleClear = useCallback(() => {
    markerRef.current?.remove();
    markerRef.current = null;
    pin.clearPin();
    connect.clearConnect();
    closeFeatureInfo();
    clearConnectionLines();
    clearDrawing();
    clearMeasure();
    boundary.clearBoundary();
  }, [pin, connect, closeFeatureInfo, clearConnectionLines, clearDrawing, clearMeasure, boundary]);

  const handleZoomToUK = useCallback(() => {
    map?.flyTo({ center: UK_CENTER, zoom: 6, duration: 1200 });
  }, [map]);

  // Heatmap toggle
  const handleHeatmapToggle = useCallback(
    (enabled: boolean) => {
      setHeatmapMode(enabled);
      const utilLayer = registryLayers.find((l) => l.slug === "npg_hv_substations_utilisation");
      if (utilLayer && visibility[utilLayer.id] && map) {
        clearLayerCache(utilLayer.id);
        const bounds = map.getBounds();
        const bbox: [number, number, number, number] = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
        fetchLayerGeoJSON(utilLayer.id, bbox).then((geojson) => {
          const catLayers = registryLayers.filter((l) => l.category === utilLayer.category && l.dno === utilLayer.dno);
          const idx = catLayers.findIndex((l) => l.id === utilLayer.id);
          addRegistryLayerToMap(map, utilLayer, geojson, idx, enabled);
        });
      }
    },
    [map, registryLayers, visibility]
  );

  // Screenshot handler for AssessmentPanel
  const handleCaptureScreenshot = useCallback(async (): Promise<string | null> => {
    if (!connect.connectEndpoints) {
      // For pin-drop mode, use the pin screenshot
      if (!map || !assessLocation) return null;
      return captureScreenshot(null);
    }
    return captureScreenshot(connect.connectEndpoints);
  }, [connect.connectEndpoints, captureScreenshot, map, assessLocation]);

  // Screenshot handler — returns { location, route } for PDF export
  const handlePinScreenshot = useCallback(async (): Promise<{ location: string | null; route: string | null }> => {
    if (!map || !pin.pinLocation) return { location: null, route: null };
    const { lng, lat } = pin.pinLocation;

    const origCenter = map.getCenter();
    const origZoom = map.getZoom();

    const isValidCoord = (c: any): c is [number, number] =>
      Array.isArray(c) && c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number" && isFinite(c[0]) && isFinite(c[1]);

    const allLineCoords: [number, number][] = [];
    const endpointFeatures: { coord: [number, number]; role: string; color: string }[] = [];

    connectionLinesRef.current.forEach((line) => {
      const validCoords = line.coords.filter(isValidCoord);
      if (validCoords.length >= 2) {
        allLineCoords.push(...validCoords);
        const roleLabel = line.id.replace("line-", "");
        endpointFeatures.push({ coord: validCoords[validCoords.length - 1], role: roleLabel, color: line.color });
      }
    });

    const tempLayerIds: string[] = [];
    const allPts: [number, number][] = [[lng, lat], ...allLineCoords];
    if (boundary.vertices && boundary.vertices.length > 0) {
      allPts.push(...boundary.vertices);
    }
    let minLng = lng, maxLng = lng, minLat = lat, maxLat = lat;
    allPts.forEach(([pLng, pLat]) => {
      if (pLng < minLng) minLng = pLng;
      if (pLng > maxLng) maxLng = pLng;
      if (pLat < minLat) minLat = pLat;
      if (pLat > maxLat) maxLat = pLat;
    });
    const PAD = 0.0004;
    const overviewBbox: [number, number, number, number] = [minLng - PAD, minLat - PAD, maxLng + PAD, maxLat + PAD];

    const routeSrcId = "screenshot-route-src";
    const routeLineId = "screenshot-route-line";
    const routeOutlineId = "screenshot-route-outline";
    const cleanupRoute = () => {
      try {
        if (map.getLayer(routeLineId)) map.removeLayer(routeLineId);
        if (map.getLayer(routeOutlineId)) map.removeLayer(routeOutlineId);
        if (map.getSource(routeSrcId)) map.removeSource(routeSrcId);
      } catch {}
    };
    cleanupRoute();

    const routeFeatures: any[] = [];
    connectionLinesRef.current.forEach((line) => {
      const validCoords = line.coords.filter(isValidCoord);
      if (validCoords.length >= 2) {
        routeFeatures.push({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: validCoords },
        });
      }
    });

    if (routeFeatures.length > 0) {
      map.addSource(routeSrcId, {
        type: "geojson",
        data: { type: "FeatureCollection", features: routeFeatures },
      });
      map.addLayer({
        id: routeOutlineId, type: "line", source: routeSrcId,
        paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 1 },
      });
      map.addLayer({
        id: routeLineId, type: "line", source: routeSrcId,
        paint: { "line-color": "#22c55e", "line-width": 3.5, "line-opacity": 1 },
      });
    }

    const markerSrcId = "screenshot-ep-src";
    const markerFillId = "screenshot-ep-fill";
    const markerStrokeId = "screenshot-ep-stroke";
    const cleanupMarkers = () => {
      try {
        if (map.getLayer(markerFillId)) map.removeLayer(markerFillId);
        if (map.getLayer(markerStrokeId)) map.removeLayer(markerStrokeId);
        if (map.getSource(markerSrcId)) map.removeSource(markerSrcId);
      } catch {}
    };
    cleanupMarkers();

    const markerFeatures = [
      { type: "Feature" as const, properties: { role: "feeder-pillar", color: "#e74c3c" }, geometry: { type: "Point" as const, coordinates: [lng, lat] } },
      ...endpointFeatures.map((ep) => ({
        type: "Feature" as const,
        properties: { role: "poc", color: "#3498db" },
        geometry: { type: "Point" as const, coordinates: ep.coord },
      })),
    ];

    map.addSource(markerSrcId, {
      type: "geojson",
      data: { type: "FeatureCollection", features: markerFeatures },
    });
    map.addLayer({ id: markerStrokeId, type: "circle", source: markerSrcId, paint: { "circle-radius": 12, "circle-color": "#ffffff" } });
    map.addLayer({
      id: markerFillId, type: "circle", source: markerSrcId,
      paint: { "circle-radius": 9, "circle-color": ["get", "color"] },
    });

    const cleanupAll = () => {
      cleanupMarkers();
      cleanupRoute();
      for (const id of tempLayerIds) {
        try {
          const mid = `layer-${id}`;
          if (map.getLayer(mid)) map.removeLayer(mid);
          if (map.getLayer(`${mid}-outline`)) map.removeLayer(`${mid}-outline`);
          if (map.getLayer(`${mid}-heat`)) map.removeLayer(`${mid}-heat`);
          const sid = `source-${id}`;
          if (map.getSource(sid)) map.removeSource(sid);
        } catch {}
      }
    };

    const captureCanvas = (): Promise<string | null> =>
      new Promise((resolve) => {
        const doCapture = () => {
          try { resolve(map.getCanvas().toDataURL("image/png")); } catch { resolve(null); }
        };
        setTimeout(() => {
          if (map.areTilesLoaded()) doCapture();
          else map.once("idle", doCapture);
        }, 800);
      });

    const overviewBounds = new maplibregl.LngLatBounds(
      [overviewBbox[0], overviewBbox[1]],
      [overviewBbox[2], overviewBbox[3]]
    );
    map.fitBounds(overviewBounds, { padding: 50, duration: 0 });
    const locationScreenshot = await captureCanvas();

    cleanupAll();
    map.jumpTo({ center: origCenter, zoom: origZoom });
    return { location: locationScreenshot, route: null };
  }, [map, pin.pinLocation, boundary.vertices]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {/* Active study bar */}
      {activeStudy.study && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-background/95 backdrop-blur rounded-lg border shadow-lg px-3 py-1.5">
          <FlaskConical className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">{activeStudy.study.study_name}</span>
          <Badge variant="outline" className="text-xs">{activeStudy.study.status}</Badge>
          {activeStudy.study.engine_output_json && (
            <Badge variant="secondary" className="text-xs">Rules ✓</Badge>
          )}
        </div>
      )}

      {mapLoaded && (
        <>
          <PostcodeSearch onResult={handleSearchResult} />
          <BasemapSwitcher
            active={basemapId}
            onChange={(id) => { setBasemapId(id); setBasemap(id); }}
          />
          <LayerTogglePanel
            visibility={visibility}
            onToggle={handleLayerToggle}
            onGoToCoverage={goToLayerCoverage}
            heatmapMode={heatmapMode}
            onHeatmapToggle={handleHeatmapToggle}
            registryLayers={registryLayers}
            loadingLayers={loadingLayers}
            selectedDno={selectedDno}
            onDnoChange={setSelectedDno}
            planningDatasets={planning.planningDatasets}
            planningVisibility={planning.planningVisibility}
            planningLoading={planning.planningLoading}
            onPlanningToggle={(id, visible) => planning.togglePlanningLayer(id, visible, map)}
            lrDatasets={landRegistry.lrDatasets}
            lrVisibility={landRegistry.lrVisibility}
            lrLoading={landRegistry.lrLoading}
            onLrToggle={(id, visible) => landRegistry.toggleLandRegistryLayer(id, visible, map)}
            osDatasets={osOpen.osDatasets}
            osVisibility={osOpen.osVisibility}
            osLoading={osOpen.osLoading}
            osFeatureCounts={osOpen.osFeatureCounts}
            onOsToggle={(id, visible) => osOpen.toggleOsLayer(id, visible, map)}
          />
          <MapLegend
            registryLayers={registryLayers}
            visibility={visibility}
            heatmapMode={heatmapMode}
          />
          <FeatureInfoPanel
            feature={planning.selectedPlanningFeature || selectedFeature}
            layerLabel={planning.selectedPlanningLabel || selectedLayerLabel}
            onClose={() => {
              planning.closePlanningFeatureInfo();
              closeFeatureInfo();
            }}
          />
          <MapToolbar
            activeTool={activeTool}
            onToolChange={(tool) => {
              if (tool !== "assess") {
                connect.setConnectSource(null);
                connect.clearConnect();
              }
              if (tool !== "design") {
                design.setPlacingType(null);
                design.setDrawingCableType(null);
              }
              setActiveTool(tool);
            }}
            onClear={handleClear}
            onZoomToUK={handleZoomToUK}
            hasActiveStudy={!!activeStudy.study}
          />

          {/* Route drawing controls (assess tool with source selected) */}
          {(activeTool === "assess" || routeDrawActive) && connect.connectSource && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-background/95 backdrop-blur rounded-lg border shadow-lg px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {connect.connectWaypoints.length === 0
                  ? "Click to add route points"
                  : `${connect.connectWaypoints.length} point${connect.connectWaypoints.length !== 1 ? "s" : ""} — click to add more`}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={connect.connectWaypoints.length === 0}
                onClick={connect.undoWaypoint}
              >
                <Undo2 className="h-3 w-3 mr-1" />Undo
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={connect.connectWaypoints.length === 0}
                onClick={() => {
                  connect.finishRoute();
                  if (connect.connectWaypoints.length > 0) {
                    const lastPt = connect.connectWaypoints[connect.connectWaypoints.length - 1];
                    setAssessLocation({ lng: lastPt[0], lat: lastPt[1] });
                  }
                  setActiveTool(null);
                }}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />Finish
              </Button>
            </div>
          )}

          {/* Boundary drawing controls */}
          {activeTool === "boundary" && boundary.isDrawing && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-background/95 backdrop-blur rounded-lg border shadow-lg px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {boundary.vertices.length === 0
                  ? "Click to start boundary"
                  : `${boundary.vertices.length} point${boundary.vertices.length !== 1 ? "s" : ""} — click to add more`}
              </span>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={boundary.vertices.length === 0} onClick={boundary.undoPoint}>
                <Undo2 className="h-3 w-3 mr-1" />Undo
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { boundary.clearBoundary(); setActiveTool(null); }}>
                <Trash2 className="h-3 w-3 mr-1" />Clear
              </Button>
              <Button size="sm" className="h-7 text-xs" disabled={boundary.vertices.length < 3} onClick={() => { boundary.finishBoundary(); setActiveTool(null); }}>
                <CheckCircle2 className="h-3 w-3 mr-1" />Finish
              </Button>
            </div>
          )}

          {/* Cable drawing controls */}
          {activeTool === "design" && design.drawingCableType && design.cableVertices.length > 0 && (
            <CableDrawingBar
              vertices={design.cableVertices}
              onUndo={design.undoCableVertex}
              onFinish={() => design.finishCable()}
            />
          )}

          {pin.showSiteCheck && pin.pinLocation && (
            <UnifiedIntelligencePanel
              lng={pin.pinLocation.lng}
              lat={pin.pinLocation.lat}
              onClose={() => { pin.closeSiteCheck(); clearConnectionLines(); setExistingSiteId(null); }}
              onConnectionLines={handleConnectionLines}
              onCaptureMapScreenshot={handlePinScreenshot}
              existingSiteId={existingSiteId}
            />
          )}

          {drawnPolygon && (
            <PolygonSearchResults
              polygon={drawnPolygon}
              onClose={() => { clearDrawing(); setActiveTool(null); }}
            />
          )}

          {/* ── Unified Assessment Panel ── */}
          {assessLocation && (
            <AssessmentPanel
              lng={assessLocation.lng}
              lat={assessLocation.lat}
              onClose={() => { setAssessLocation(null); connect.clearConnect(); setRouteDrawActive(false); }}
              connectEndpoints={connect.connectEndpoints}
              boundaryGeojson={boundary.polygon ?? undefined}
              onCaptureScreenshot={handleCaptureScreenshot}
              streetViewCaptures={streetViewCaptures}
              designElements={
                design.elements.length > 0
                  ? Object.entries(
                      design.elements.reduce<Record<string, number>>((acc, el) => {
                        acc[el.element_type] = (acc[el.element_type] || 0) + 1;
                        return acc;
                      }, {})
                    ).map(([type, count]) => ({ type, label: type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()), count }))
                  : undefined
              }
              hasActiveStudy={!!activeStudy.study}
              onConvertToDesign={design.bulkInsert}
              onAutoDetectComplete={(res) => setAutoDetectResult(res)}
              onRouteDrawChange={(active) => {
                setRouteDrawActive(active);
                if (active) setActiveTool("assess");
              }}
            />
          )}

          {activeTool === "design" && activeStudy.study && (
            <DesignModePanel
              studyName={activeStudy.study.study_name}
              elements={design.elements}
              placingType={design.placingType}
              onSelectType={design.setPlacingType}
              onRemove={design.removeElement}
              onClearAll={design.clearAll}
              onClose={() => setActiveTool(null)}
              cables={design.cables}
              drawingCableType={design.drawingCableType}
              onSelectCableType={design.setDrawingCableType}
              cableVertexCount={design.cableVertices.length}
              onRemoveCable={design.removeCable}
            />
          )}

          {streetViewLocation && (
            <StreetViewPanel
              lng={streetViewLocation.lng}
              lat={streetViewLocation.lat}
              onClose={() => setStreetViewLocation(null)}
              existingCaptures={streetViewCaptures}
              markers={
                design.elements.map((el) => ({
                  id: el.id,
                  lat: Number(el.lat),
                  lng: Number(el.lng),
                  label: el.label || el.element_type.replace("_", " "),
                  type: el.element_type,
                  color:
                    el.element_type === "feeder_pillar" ? "#2ecc71" :
                    el.element_type === "transformer" ? "#e74c3c" :
                    el.element_type === "rmu" ? "#3498db" :
                    el.element_type === "cutout" ? "#f39c12" :
                    el.element_type === "joint" ? "#9b59b6" :
                    el.element_type === "pole" ? "#1abc9c" :
                    el.element_type === "ev_charger" ? "#00b894" :
                    "#2ecc71",
                } as StreetViewMarker))
              }
              onCaptures={setStreetViewCaptures}
              onDeleteMarker={(id) => design.removeElement(id)}
              onAddMarker={(type, markerLat, markerLng) => {
                design.setPlacingType(type as any);
                setTimeout(() => {
                  design.placeElement(markerLng, markerLat);
                }, 50);
              }}
            />
          )}
        </>
      )}
    </div>
  );
};

export default MapView;
