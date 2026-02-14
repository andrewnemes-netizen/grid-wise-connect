import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";

interface MeasureState {
  points: [number, number][];
  totalDistance: number;
}

/** Haversine distance in metres */
function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

const SOURCE_ID = "measure-line";
const LAYER_ID = "measure-line-layer";
const LABEL_LAYER_ID = "measure-label-layer";

export function useMeasure(
  map: maplibregl.Map | null,
  active: boolean
) {
  const [state, setState] = useState<MeasureState>({ points: [], totalDistance: 0 });
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const clearMeasure = useCallback(() => {
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    popupRef.current?.remove();
    popupRef.current = null;
    if (map) {
      if (map.getLayer(LABEL_LAYER_ID)) map.removeLayer(LABEL_LAYER_ID);
      if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    }
    setState({ points: [], totalDistance: 0 });
  }, [map]);

  useEffect(() => {
    if (!map || !active) return;

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      setState((prev) => {
        const newPoints = [...prev.points, coord];

        // Add marker dot
        const el = document.createElement("div");
        el.style.cssText =
          "width:10px;height:10px;border-radius:50%;background:#e74c3c;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)";
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat(coord)
          .addTo(map);
        markersRef.current.push(marker);

        // Calculate total distance
        let total = 0;
        for (let i = 1; i < newPoints.length; i++) {
          total += haversineM(newPoints[i - 1], newPoints[i]);
        }

        // Update line on map
        const geojson: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: newPoints.length >= 2
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "LineString", coordinates: newPoints },
                },
              ]
            : [],
        };

        if (map.getSource(SOURCE_ID)) {
          (map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource).setData(geojson);
        } else {
          map.addSource(SOURCE_ID, { type: "geojson", data: geojson });
          map.addLayer({
            id: LAYER_ID,
            type: "line",
            source: SOURCE_ID,
            paint: {
              "line-color": "#e74c3c",
              "line-width": 2.5,
              "line-dasharray": [4, 3],
            },
          });
        }

        // Show distance popup at latest point
        if (newPoints.length >= 2) {
          popupRef.current?.remove();
          const popup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            offset: 12,
            className: "measure-popup",
          })
            .setLngLat(coord)
            .setHTML(
              `<div style="font-size:12px;font-weight:600;padding:2px 6px">${formatDistance(total)}</div>`
            )
            .addTo(map);
          popupRef.current = popup;
        }

        return { points: newPoints, totalDistance: total };
      });
    };

    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map, active]);

  // Clean up when deactivated
  useEffect(() => {
    if (!active) {
      clearMeasure();
    }
  }, [active, clearMeasure]);

  return { measureState: state, clearMeasure };
}
