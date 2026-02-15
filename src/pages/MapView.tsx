import "maplibre-gl/dist/maplibre-gl.css";
import { useRef, useState, useCallback, useEffect } from "react";
import maplibregl from "maplibre-gl";
import { Undo2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMap } from "@/hooks/useMap";
import { useLayerManager } from "@/hooks/useLayerManager";
import { useConnectTool } from "@/hooks/useConnectTool";
import { usePinDrop } from "@/hooks/usePinDrop";
import { useMapScreenshot } from "@/hooks/useMapScreenshot";
import { usePolygonDraw } from "@/hooks/usePolygonDraw";
import { useMeasure } from "@/hooks/useMeasure";
import { BasemapSwitcher, type BasemapId } from "@/components/map/BasemapSwitcher";
import { PostcodeSearch } from "@/components/map/PostcodeSearch";
import { LayerTogglePanel } from "@/components/map/LayerTogglePanel";
import { FeatureInfoPanel } from "@/components/map/FeatureInfoPanel";
import { MapLegend } from "@/components/map/MapLegend";
import { MapToolbar } from "@/components/map/MapToolbar";
import { SiteCheckPanel, type ConnectionLine } from "@/components/map/SiteCheckPanel";
import { PolygonSearchResults } from "@/components/map/PolygonSearchResults";
import { ConnectAssessmentPanel } from "@/components/map/ConnectAssessmentPanel";
import { clearLayerCache, fetchLayerGeoJSON, addRegistryLayerToMap } from "@/lib/mapLayers";

const UK_CENTER: [number, number] = [-1.5, 54.0];

const MapView = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map, mapLoaded, setBasemap } = useMap(containerRef);
  const [basemapId, setBasemapId] = useState<BasemapId>("street");
  const [activeTool, setActiveTool] = useState<"pin" | "measure" | "polygon" | "connect" | null>(null);
  const [heatmapMode, setHeatmapMode] = useState(false);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

  // Extracted hooks
  const {
    registryLayers, visibility, handleLayerToggle, loadingLayers,
    selectedFeature, selectedLayerLabel, closeFeatureInfo, layerMap,
  } = useLayerManager(map, mapLoaded, heatmapMode);

  const connect = useConnectTool(map, layerMap);
  const pin = usePinDrop(map);
  const { captureScreenshot } = useMapScreenshot(map, setBasemap);
  const { isDrawing, polygon: drawnPolygon, clearDrawing } = usePolygonDraw(map, activeTool === "polygon");
  const { clearMeasure } = useMeasure(map, activeTool === "measure");

  // Map click dispatcher
  useEffect(() => {
    if (!map) return;
    const handler = (e: maplibregl.MapMouseEvent) => {
      if (activeToolRef.current === "connect") {
        connect.handleConnectClick(e);
        return;
      }
      if (activeToolRef.current === "pin") {
        pin.handlePinClick(e);
        setActiveTool(null);
        return;
      }
    };
    const dblHandler = (e: maplibregl.MapMouseEvent) => {
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
  }, [map, connect, pin]);

  // Cursor for active tools
  useEffect(() => {
    if (!map) return;
    map.getCanvas().style.cursor =
      activeTool === "pin" || activeTool === "measure" || activeTool === "polygon" || activeTool === "connect"
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
  }, [pin, connect, closeFeatureInfo, clearConnectionLines, clearDrawing, clearMeasure]);

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
          />
          <MapLegend
            registryLayers={registryLayers}
            visibility={visibility}
            heatmapMode={heatmapMode}
          />
          <FeatureInfoPanel
            feature={selectedFeature}
            layerLabel={selectedLayerLabel}
            onClose={closeFeatureInfo}
          />
          <MapToolbar
            activeTool={activeTool}
            onToolChange={(tool) => {
              if (tool !== "connect") {
                connect.setConnectSource(null);
                connect.clearConnect();
              }
              setActiveTool(tool);
            }}
            onClear={handleClear}
            onZoomToUK={handleZoomToUK}
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

          {pin.showSiteCheck && pin.pinLocation && (
            <SiteCheckPanel
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
            />
          )}
        </>
      )}
    </div>
  );
};

export default MapView;
