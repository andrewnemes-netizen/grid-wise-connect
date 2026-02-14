import "maplibre-gl/dist/maplibre-gl.css";
import { useRef, useState, useCallback, useEffect } from "react";
import maplibregl from "maplibre-gl";
import { useMap } from "@/hooks/useMap";
import { PostcodeSearch } from "@/components/map/PostcodeSearch";
import { LayerTogglePanel, DEFAULT_LAYERS, type LayerConfig } from "@/components/map/LayerTogglePanel";
import { FeatureInfoPanel } from "@/components/map/FeatureInfoPanel";
import { MapLegend } from "@/components/map/MapLegend";
import { MapToolbar } from "@/components/map/MapToolbar";
import { SiteCheckPanel } from "@/components/map/SiteCheckPanel";

const MapView = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map, mapLoaded } = useMap(containerRef);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const pinMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [layers, setLayers] = useState<LayerConfig[]>(DEFAULT_LAYERS);
  const [selectedFeature, setSelectedFeature] = useState<Record<string, unknown> | null>(null);
  const [selectedLayerLabel, setSelectedLayerLabel] = useState("");
  const [activeTool, setActiveTool] = useState<"pin" | null>(null);
  const [pinLocation, setPinLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [showSiteCheck, setShowSiteCheck] = useState(false);
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

  const handleSearchResult = useCallback(
    (lng: number, lat: number, label: string) => {
      if (!map) return;
      markerRef.current?.remove();
      map.flyTo({ center: [lng, lat], zoom: 15, duration: 1500 });
      const marker = new maplibregl.Marker({ color: "hsl(152, 60%, 36%)" })
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

  const handleLayerToggle = useCallback(
    (layerId: string, visible: boolean) => {
      setLayers((prev) =>
        prev.map((l) => (l.id === layerId ? { ...l, visible } : l))
      );
      if (map && map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
      }
    },
    [map]
  );

  const handleCloseFeatureInfo = useCallback(() => {
    setSelectedFeature(null);
    setSelectedLayerLabel("");
  }, []);

  // Pin drop via map click
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
  }, []);

  // Set cursor when pin tool active
  useEffect(() => {
    if (!map) return;
    map.getCanvas().style.cursor = activeTool === "pin" ? "crosshair" : "";
  }, [map, activeTool]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {mapLoaded && (
        <>
          <PostcodeSearch onResult={handleSearchResult} />
          <LayerTogglePanel layers={layers} onToggle={handleLayerToggle} />
          <MapLegend layers={layers} />
          <FeatureInfoPanel
            feature={selectedFeature}
            layerLabel={selectedLayerLabel}
            onClose={handleCloseFeatureInfo}
          />
          <MapToolbar
            activeTool={activeTool}
            onToolChange={setActiveTool}
            onClear={handleClear}
          />
          {showSiteCheck && pinLocation && (
            <SiteCheckPanel
              lng={pinLocation.lng}
              lat={pinLocation.lat}
              onClose={() => setShowSiteCheck(false)}
            />
          )}
        </>
      )}
    </div>
  );
};

export default MapView;
