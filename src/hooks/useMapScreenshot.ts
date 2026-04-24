import { useCallback } from "react";
import maplibregl from "maplibre-gl";
import type { ConnectEndpoints } from "@/components/map/AssessmentPanel";

export function useMapScreenshot(
  map: maplibregl.Map | null,
  setBasemap: (id: "street") => void,
  boundaryCoords?: [number, number][] | null
) {
  const captureScreenshot = useCallback(
    async (endpoints: ConnectEndpoints | null): Promise<string | null> => {
      if (!map) return null;

      // Switch to street basemap for roads/buildings visibility
      setBasemap("street");

      // Determine framing — if we have a route, frame to it; otherwise use current map view.
      const coords = endpoints?.routeCoords ?? [];
      let startCoord: [number, number] | null = null;
      let endCoord: [number, number] | null = null;

      if (coords.length >= 2) {
        const bounds = new maplibregl.LngLatBounds(coords[0], coords[0]);
        coords.forEach((c) => bounds.extend(c));

        if (boundaryCoords && boundaryCoords.length > 0) {
          boundaryCoords.forEach((c) => bounds.extend(c));
        }

        // ~25m buffer — very tight zoom for maximum detail
        const BUFFER_DEG_LAT = 0.00022;
        const BUFFER_DEG_LNG = 0.00035;
        bounds.extend([bounds.getWest() - BUFFER_DEG_LNG, bounds.getSouth() - BUFFER_DEG_LAT]);
        bounds.extend([bounds.getEast() + BUFFER_DEG_LNG, bounds.getNorth() + BUFFER_DEG_LAT]);

        map.fitBounds(bounds, { padding: 40, duration: 0 });

        startCoord = coords[0];
        endCoord = coords[coords.length - 1];
      } else if (boundaryCoords && boundaryCoords.length > 0) {
        const bounds = new maplibregl.LngLatBounds(boundaryCoords[0], boundaryCoords[0]);
        boundaryCoords.forEach((c) => bounds.extend(c));
        map.fitBounds(bounds, { padding: 60, duration: 0 });
      }

      const markersSourceId = "screenshot-markers";
      const markersFillId = "screenshot-markers-fill";
      const markersStrokeId = "screenshot-markers-stroke";

      if (map.getLayer(markersFillId)) map.removeLayer(markersFillId);
      if (map.getLayer(markersStrokeId)) map.removeLayer(markersStrokeId);
      if (map.getSource(markersSourceId)) map.removeSource(markersSourceId);

      if (startCoord && endCoord) {
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
      }

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
