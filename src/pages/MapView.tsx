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
import { fetchLayerGeoJSON, addLayerToMap, removeLayerFromMap } from "@/lib/mapLayers";
import { useToast } from "@/hooks/use-toast";

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
  const [loadingLayers, setLoadingLayers] = useState<Set<string>>(new Set());
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const { toast } = useToast();

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

  const handleLayerToggle = useCallback(
    async (layerId: string, visible: boolean) => {
      setLayers((prev) =>
        prev.map((l) => (l.id === layerId ? { ...l, visible } : l))
      );

      if (!map) return;

      if (visible) {
        // Fetch and render layer
        setLoadingLayers((prev) => new Set(prev).add(layerId));
        try {
          const geojson = await fetchLayerGeoJSON(layerId);
          const layer = layers.find((l) => l.id === layerId) || DEFAULT_LAYERS.find((l) => l.id === layerId);
          if (layer && map) {
            addLayerToMap(map, layerId, geojson, layer.color);

            // Add click handler for feature info
            map.on("click", layerId, (e) => {
              if (e.features && e.features.length > 0) {
                setSelectedFeature(e.features[0].properties as Record<string, unknown>);
                setSelectedLayerLabel(layer.label);
              }
            });
            map.on("mouseenter", layerId, () => {
              if (activeToolRef.current !== "pin") {
                map.getCanvas().style.cursor = "pointer";
              }
            });
            map.on("mouseleave", layerId, () => {
              if (activeToolRef.current !== "pin") {
                map.getCanvas().style.cursor = "";
              }
            });

            if (geojson.features.length === 0) {
              toast({ title: `${layer.label}`, description: "No data loaded for this layer yet." });
            }
          }
        } catch (err) {
          console.error(`Failed to load layer ${layerId}:`, err);
          toast({ title: "Layer load failed", description: `Could not load ${layerId}`, variant: "destructive" });
        } finally {
          setLoadingLayers((prev) => {
            const next = new Set(prev);
            next.delete(layerId);
            return next;
          });
        }
      } else {
        removeLayerFromMap(map, layerId);
      }
    },
    [map, layers, toast]
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
