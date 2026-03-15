import "maplibre-gl/dist/maplibre-gl.css";
import { useRef, useState, useCallback, useEffect } from "react";
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
import { ConnectAssessmentPanel } from "@/components/map/ConnectAssessmentPanel";
import { DesignModePanel } from "@/components/map/DesignModePanel";
import { clearLayerCache, fetchLayerGeoJSON, addRegistryLayerToMap } from "@/lib/mapLayers";
import { EvHubPanel, type ConnectData } from "@/components/map/EvHubPanel";
import { StreetViewPanel, type StreetViewMarker, type StreetViewCapture } from "@/components/map/StreetViewPanel";
import { GridwisePanel } from "@/components/map/GridwisePanel";

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
  const { map, mapLoaded, setBasemap } = useMap(containerRef);
  const [basemapId, setBasemapId] = useState<BasemapId>("street");
  const [activeTool, setActiveTool] = useState<"pin" | "measure" | "polygon" | "connect" | "boundary" | "design" | "evhub" | "gridwise" | null>(null);
  const [streetViewLocation, setStreetViewLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [streetViewCaptures, setStreetViewCaptures] = useState<StreetViewCapture[]>([]);
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [selectedDno, setSelectedDno] = useState<string | null>(null);
  const [evHubLocation, setEvHubLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [gridwiseLocation, setGridwiseLocation] = useState<{ lng: number; lat: number } | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

  // Extracted hooks
  const {
    registryLayers, visibility, handleLayerToggle, loadingLayers,
    selectedFeature, selectedLayerLabel, closeFeatureInfo, layerMap,
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
      if (activeToolRef.current === "connect") {
        connect.handleConnectClick(e);
        return;
      }
      if (activeToolRef.current === "evhub") {
        setEvHubLocation({ lng: e.lngLat.lng, lat: e.lngLat.lat });
        setActiveTool(null);
        return;
      }
      // Street View tool removed - re-enable later with better positioning
      // if (activeToolRef.current === "streetview" || standaloneStreetViewRef.current) {
      //   setStreetViewLocation({ lng: e.lngLat.lng, lat: e.lngLat.lat });
      //   setActiveTool(null);
      //   setStandaloneStreetView(false);
      //   return;
      // }
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
      if (activeToolRef.current === "connect") {
        connect.handleDblClick(e);
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
      activeTool === "pin" || activeTool === "measure" || activeTool === "polygon" || activeTool === "connect" || activeTool === "boundary" || activeTool === "design"
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
    ["line-primary", "line-feeder", "line-cable"].forEach((id) => {
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
    ["line-primary", "line-feeder", "line-cable"].forEach((id) => {
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

  // Screenshot handler for ConnectAssessmentPanel
  const handleCaptureScreenshot = useCallback(async (): Promise<string | null> => {
    if (!connect.connectEndpoints) return null;
    return captureScreenshot(connect.connectEndpoints);
  }, [connect.connectEndpoints, captureScreenshot]);

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
              if (tool !== "connect") {
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

          {/* Route drawing controls */}
          {activeTool === "connect" && connect.connectSource && (
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
                onClick={() => { connect.finishRoute(); setActiveTool(null); }}
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
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={boundary.vertices.length === 0}
                onClick={boundary.undoPoint}
              >
                <Undo2 className="h-3 w-3 mr-1" />Undo
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => { boundary.clearBoundary(); setActiveTool(null); }}
              >
                <Trash2 className="h-3 w-3 mr-1" />Clear
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={boundary.vertices.length < 3}
                onClick={() => { boundary.finishBoundary(); setActiveTool(null); }}
              >
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
              onClose={() => { pin.closeSiteCheck(); clearConnectionLines(); }}
              onConnectionLines={handleConnectionLines}
            />
          )}

          {drawnPolygon && (
            <PolygonSearchResults
              polygon={drawnPolygon}
              onClose={() => { clearDrawing(); setActiveTool(null); }}
            />
          )}

          {connect.connectEndpoints && (
            <ConnectAssessmentPanel
              endpoints={connect.connectEndpoints}
              onCaptureMapScreenshot={handleCaptureScreenshot}
              onClose={() => { connect.clearConnect(); handleClear(); }}
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

          {evHubLocation && (
            <EvHubPanel
              lng={evHubLocation.lng}
              lat={evHubLocation.lat}
              onClose={() => setEvHubLocation(null)}
              connectData={connect.connectEndpoints ? {
                routeCoords: connect.connectEndpoints.routeCoords,
                routeLengthM: calcRouteLength(connect.connectEndpoints.routeCoords),
                sourceProperties: connect.connectEndpoints.source.properties,
                sourceLayerLabel: connect.connectEndpoints.source.layerLabel,
              } : null}
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
            />
          )}

          {/* Street View panel hidden - re-enable later with better positioning */}
          {/*
          <div className="absolute bottom-20 left-3 z-10">
            <Button
              size="sm"
              variant={standaloneStreetView ? "default" : "outline"}
              className="h-9 shadow-md bg-background/95 backdrop-blur gap-1.5"
              onClick={() => setStandaloneStreetView((v) => !v)}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className={`h-4 w-4 ${standaloneStreetView ? 'text-primary-foreground' : 'text-amber-500'}`}>
                <circle cx="12" cy="6" r="3" />
                <ellipse cx="12" cy="15" rx="4" ry="5" />
              </svg>
              <span className="text-xs font-medium">
                {standaloneStreetView ? "Click map…" : "Street View"}
              </span>
            </Button>
          </div>
          */}
        </>
      )}
    </div>
  );
};

export default MapView;
