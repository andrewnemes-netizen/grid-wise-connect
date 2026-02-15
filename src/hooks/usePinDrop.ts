import { useState, useCallback, useRef } from "react";
import maplibregl from "maplibre-gl";

export function usePinDrop(map: maplibregl.Map | null) {
  const [pinLocation, setPinLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [showSiteCheck, setShowSiteCheck] = useState(false);
  const pinMarkerRef = useRef<maplibregl.Marker | null>(null);

  const handlePinClick = useCallback(
    (e: maplibregl.MapMouseEvent) => {
      if (!map) return;
      const { lng, lat } = e.lngLat;
      pinMarkerRef.current?.remove();
      const marker = new maplibregl.Marker({ color: "#e74c3c" })
        .setLngLat([lng, lat])
        .addTo(map);
      pinMarkerRef.current = marker;
      setPinLocation({ lng, lat });
      setShowSiteCheck(true);
    },
    [map]
  );

  const clearPin = useCallback(() => {
    pinMarkerRef.current?.remove();
    pinMarkerRef.current = null;
    setPinLocation(null);
    setShowSiteCheck(false);
  }, []);

  const closeSiteCheck = useCallback(() => {
    setShowSiteCheck(false);
  }, []);

  return {
    pinLocation,
    showSiteCheck,
    handlePinClick,
    clearPin,
    closeSiteCheck,
  };
}
