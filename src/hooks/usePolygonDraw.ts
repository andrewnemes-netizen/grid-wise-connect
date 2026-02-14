import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";

const POLYGON_SOURCE = "polygon-draw-source";
const POLYGON_FILL = "polygon-draw-fill";
const POLYGON_LINE = "polygon-draw-line";
const POLYGON_POINTS = "polygon-draw-points";

export interface PolygonDrawState {
  isDrawing: boolean;
  vertices: [number, number][];
  polygon: GeoJSON.Polygon | null;
}

export function usePolygonDraw(map: maplibregl.Map | null, active: boolean) {
  const [state, setState] = useState<PolygonDrawState>({
    isDrawing: false,
    vertices: [],
    polygon: null,
  });
  const verticesRef = useRef<[number, number][]>([]);
  const activeRef = useRef(active);
  activeRef.current = active;

  const updateMapLayers = useCallback(
    (verts: [number, number][], closed = false) => {
      if (!map) return;
      const coords = closed && verts.length >= 3 ? [...verts, verts[0]] : verts;

      const geojsonData: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [],
      };

      // Polygon fill (only if closed)
      if (closed && verts.length >= 3) {
        geojsonData.features.push({
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [coords] },
        });
      }
      // Line
      if (coords.length >= 2) {
        geojsonData.features.push({
          type: "Feature",
          properties: { _type: "line" },
          geometry: { type: "LineString", coordinates: coords },
        });
      }
      // Points
      verts.forEach((v, i) => {
        geojsonData.features.push({
          type: "Feature",
          properties: { _type: "point", index: i },
          geometry: { type: "Point", coordinates: v },
        });
      });

      const source = map.getSource(POLYGON_SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(geojsonData);
      } else {
        map.addSource(POLYGON_SOURCE, { type: "geojson", data: geojsonData });
        map.addLayer({
          id: POLYGON_FILL,
          type: "fill",
          source: POLYGON_SOURCE,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": "hsl(100, 38%, 30%)", "fill-opacity": 0.15 },
        });
        map.addLayer({
          id: POLYGON_LINE,
          type: "line",
          source: POLYGON_SOURCE,
          filter: ["any", ["==", ["geometry-type"], "LineString"], ["==", ["geometry-type"], "Polygon"]],
          paint: { "line-color": "hsl(100, 38%, 30%)", "line-width": 2, "line-dasharray": [3, 2] },
        });
        map.addLayer({
          id: POLYGON_POINTS,
          type: "circle",
          source: POLYGON_SOURCE,
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 5,
            "circle-color": "hsl(100, 38%, 30%)",
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 2,
          },
        });
      }
    },
    [map]
  );

  const clearDrawing = useCallback(() => {
    if (!map) return;
    [POLYGON_FILL, POLYGON_LINE, POLYGON_POINTS].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(POLYGON_SOURCE)) map.removeSource(POLYGON_SOURCE);
    verticesRef.current = [];
    setState({ isDrawing: false, vertices: [], polygon: null });
  }, [map]);

  useEffect(() => {
    if (!map) return;

    if (!active) return;

    verticesRef.current = [];
    setState({ isDrawing: true, vertices: [], polygon: null });

    const onClick = (e: maplibregl.MapMouseEvent) => {
      if (!activeRef.current) return;
      const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      verticesRef.current = [...verticesRef.current, coord];
      updateMapLayers(verticesRef.current, false);
      setState((s) => ({ ...s, vertices: [...verticesRef.current] }));
    };

    const onDblClick = (e: maplibregl.MapMouseEvent) => {
      if (!activeRef.current) return;
      e.preventDefault();
      if (verticesRef.current.length < 3) return;

      const closed = [...verticesRef.current, verticesRef.current[0]];
      const polygon: GeoJSON.Polygon = {
        type: "Polygon",
        coordinates: [closed],
      };
      updateMapLayers(verticesRef.current, true);
      setState({ isDrawing: false, vertices: [...verticesRef.current], polygon });
    };

    map.on("click", onClick);
    map.on("dblclick", onDblClick);
    map.doubleClickZoom.disable();

    return () => {
      map.off("click", onClick);
      map.off("dblclick", onDblClick);
      map.doubleClickZoom.enable();
    };
  }, [map, active, updateMapLayers]);

  return { ...state, clearDrawing };
}
