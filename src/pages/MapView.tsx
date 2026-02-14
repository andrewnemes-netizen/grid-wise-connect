import "maplibre-gl/dist/maplibre-gl.css";
import { useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";
import { useMap } from "@/hooks/useMap";
import { PostcodeSearch } from "@/components/map/PostcodeSearch";
import { LayerTogglePanel, DEFAULT_LAYERS, type LayerConfig } from "@/components/map/LayerTogglePanel";
import { FeatureInfoPanel } from "@/components/map/FeatureInfoPanel";
import { MapLegend } from "@/components/map/MapLegend";

const MapView = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { map, mapLoaded } = useMap(containerRef);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const [layers, setLayers] = useState<LayerConfig[]>(DEFAULT_LAYERS);
  const [selectedFeature, setSelectedFeature] = useState<Record<string, unknown> | null>(null);
  const [selectedLayerLabel, setSelectedLayerLabel] = useState("");

  const handleSearchResult = useCallback(
    (lng: number, lat: number, label: string) => {
      if (!map) return;

      // Remove old marker
      markerRef.current?.remove();

      // Fly to location
      map.flyTo({ center: [lng, lat], zoom: 15, duration: 1500 });

      // Drop a pin
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

      // Toggle visibility on map if the source/layer exists
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
        </>
      )}
    </div>
  );
};

export default MapView;
