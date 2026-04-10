import { useCallback } from "react";
import maplibregl from "maplibre-gl";
import type { ConnectEndpoints } from "@/components/map/ConnectAssessmentPanel";

export function useMapScreenshot(
  map: maplibregl.Map | null,
  setBasemap: (id: "street") => void,
  boundaryCoords?: [number, number][] | null
) {
  const captureScreenshot = useCallback(
    async (endpoints: ConnectEndpoints): Promise<string | null> => {
      if (!map) return null;

      // Switch to street basemap for roads/buildings visibility
      setBasemap("street");

      const coords = endpoints.routeCoords;
      const bounds = new maplibregl.LngLatBounds(coords[0], coords[0]);
      coords.forEach((c) => bounds.extend(c));

      // Also include boundary coords in bounds if they exist
      if (boundaryCoords && boundaryCoords.length > 0) {
        boundaryCoords.forEach((c) => bounds.extend(c));
      }

      // ~50m buffer — tight zoom for clear boundary/route visibility
      const BUFFER_DEG_LAT = 0.00045;
      const BUFFER_DEG_LNG = 0.0007;
      bounds.extend([bounds.getWest() - BUFFER_DEG_LNG, bounds.getSouth() - BUFFER_DEG_LAT]);
      bounds.extend([bounds.getEast() + BUFFER_DEG_LNG, bounds.getNorth() + BUFFER_DEG_LAT]);

      map.fitBounds(bounds, { padding: 40, duration: 0 });

      // Add temporary GeoJSON markers for start/end
      const startCoord = coords[0];
      const endCoord = coords[coords.length - 1];
      const markersSourceId = "screenshot-markers";
      const markersFillId = "screenshot-markers-fill";
      const markersStrokeId = "screenshot-markers-stroke";

      if (map.getLayer(markersFillId)) map.removeLayer(markersFillId);
      if (map.getLayer(markersStrokeId)) map.removeLayer(markersStrokeId);
      if (map.getSource(markersSourceId)) map.removeSource(markersSourceId);

      map.addSource(markersSourceId, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            { type: "Feature", properties: { role: "start" }, geometry: { type: "Point", coordinates: startCoord } },
            { type: "Feature", properties: { role: "end" }, geometry: { type: "Point", coordinates: endCoord } },
          ],
        },
      });
      map.addLayer({
        id: markersStrokeId,
        type: "circle",
        source: markersSourceId,
        paint: { "circle-radius": 10, "circle-color": "#ffffff", "circle-opacity": 1 },
      });
      map.addLayer({
        id: markersFillId,
        type: "circle",
        source: markersSourceId,
        paint: {
          "circle-radius": 7,
          "circle-color": ["match", ["get", "role"], "start", "#3498db", "#e74c3c"],
          "circle-opacity": 1,
        },
      });

      return new Promise((resolve) => {
        const capture = () => {
          try {
            const dataUrl = map.getCanvas().toDataURL("image/png");
            resolve(dataUrl);
          } catch (e) {
            console.warn("Map screenshot capture failed:", e);
            resolve(null);
          } finally {
            if (map.getLayer(markersFillId)) map.removeLayer(markersFillId);
            if (map.getLayer(markersStrokeId)) map.removeLayer(markersStrokeId);
            if (map.getSource(markersSourceId)) map.removeSource(markersSourceId);
          }
        };
        const waitForIdle = () => {
          if (map.areTilesLoaded()) {
            capture();
          } else {
            map.once("idle", capture);
          }
        };
        setTimeout(waitForIdle, 500);
      });
    },
    [map, setBasemap, boundaryCoords]
  );

  return { captureScreenshot };
}
