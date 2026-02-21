import { useEffect, useRef, useState, useCallback } from "react";
import maplibregl from "maplibre-gl";

const SOURCE = "boundary-draw-source";
const FILL = "boundary-draw-fill";
const LINE = "boundary-draw-line";
const POINTS = "boundary-draw-points";

export interface BoundaryDrawState {
  isDrawing: boolean;
  vertices: [number, number][];
  polygon: GeoJSON.Polygon | null;
}

export function useBoundaryDraw(map: maplibregl.Map | null, active: boolean) {
  const [state, setState] = useState<BoundaryDrawState>({
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

      if (closed && verts.length >= 3) {
        geojsonData.features.push({
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates: [coords] },
        });
      }
      if (coords.length >= 2) {
        geojsonData.features.push({
          type: "Feature",
          properties: { _type: "line" },
          geometry: { type: "LineString", coordinates: coords },
        });
      }
      verts.forEach((v, i) => {
        geojsonData.features.push({
          type: "Feature",
          properties: { _type: "point", index: i },
          geometry: { type: "Point", coordinates: v },
        });
      });

      const source = map.getSource(SOURCE) as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(geojsonData);
      } else {
        map.addSource(SOURCE, { type: "geojson", data: geojsonData });
        map.addLayer({
          id: FILL,
          type: "fill",
          source: SOURCE,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": "#dc2626", "fill-opacity": 0.12 },
        });
        map.addLayer({
          id: LINE,
          type: "line",
          source: SOURCE,
          filter: ["any", ["==", ["geometry-type"], "LineString"], ["==", ["geometry-type"], "Polygon"]],
          paint: { "line-color": "#dc2626", "line-width": 3 },
        });
        map.addLayer({
          id: POINTS,
          type: "circle",
          source: SOURCE,
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 5,
            "circle-color": "#dc2626",
            "circle-stroke-color": "#fff",
            "circle-stroke-width": 2,
          },
        });
      }
    },
    [map]
  );

  const clearBoundary = useCallback(() => {
    if (!map) return;
    [FILL, LINE, POINTS].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    verticesRef.current = [];
    setState({ isDrawing: false, vertices: [], polygon: null });
  }, [map]);

  const undoPoint = useCallback(() => {
    if (verticesRef.current.length === 0) return;
    verticesRef.current = verticesRef.current.slice(0, -1);
    updateMapLayers(verticesRef.current, false);
    setState((s) => ({ ...s, vertices: [...verticesRef.current] }));
  }, [updateMapLayers]);

  const finishBoundary = useCallback(() => {
    if (verticesRef.current.length < 3) return;
    const closed = [...verticesRef.current, verticesRef.current[0]];
    const polygon: GeoJSON.Polygon = { type: "Polygon", coordinates: [closed] };
    updateMapLayers(verticesRef.current, true);
    setState({ isDrawing: false, vertices: [...verticesRef.current], polygon });
  }, [updateMapLayers]);

  const handleBoundaryClick = useCallback((e: maplibregl.MapMouseEvent) => {
    if (!activeRef.current) return;
    const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat];
    verticesRef.current = [...verticesRef.current, coord];
    updateMapLayers(verticesRef.current, false);
    setState((s) => ({ ...s, vertices: [...verticesRef.current] }));
  }, [updateMapLayers]);

  const handleBoundaryDblClick = useCallback((e: maplibregl.MapMouseEvent) => {
    if (!activeRef.current) return;
    e.preventDefault();
    if (verticesRef.current.length < 3) return;
    finishBoundary();
  }, [finishBoundary]);

  // When activated, start fresh drawing; when deactivated, keep boundary
  useEffect(() => {
    if (!map || !active) return;

    // Clear previous and start fresh
    [FILL, LINE, POINTS].forEach((id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(SOURCE)) map.removeSource(SOURCE);
    verticesRef.current = [];
    setState({ isDrawing: true, vertices: [], polygon: null });

    map.doubleClickZoom.disable();
    return () => {
      map.doubleClickZoom.enable();
    };
  }, [map, active]);

  return {
    ...state,
    clearBoundary,
    undoPoint,
    finishBoundary,
    handleBoundaryClick,
    handleBoundaryDblClick,
  };
}
