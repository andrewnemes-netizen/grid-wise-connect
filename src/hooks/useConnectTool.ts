import { useState, useCallback, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { ConnectEndpoints } from "@/components/map/AssessmentPanel";
import type { RegistryLayer } from "@/components/map/LayerTogglePanel";
import { useToast } from "@/hooks/use-toast";

export function useConnectTool(
  map: maplibregl.Map | null,
  layerMap: Map<string, RegistryLayer>
) {
  const [connectSource, setConnectSource] = useState<ConnectEndpoints["source"] | null>(null);
  const [connectWaypoints, setConnectWaypoints] = useState<[number, number][]>([]);
  const [connectEndpoints, setConnectEndpoints] = useState<ConnectEndpoints | null>(null);
  const waypointMarkersRef = useRef<maplibregl.Marker[]>([]);
  const connectSrcMarkerRef = useRef<maplibregl.Marker | null>(null);
  const connectDstMarkerRef = useRef<maplibregl.Marker | null>(null);
  const { toast } = useToast();

  const clearWaypointMarkers = useCallback(() => {
    waypointMarkersRef.current.forEach((m) => m.remove());
    waypointMarkersRef.current = [];
  }, []);

  const clearConnectLine = useCallback(() => {
    if (!map) return;
    if (map.getLayer("connect-line")) map.removeLayer("connect-line");
    if (map.getSource("connect-line")) map.removeSource("connect-line");
  }, [map]);

  const handleConnectClick = useCallback(
    (e: maplibregl.MapMouseEvent) => {
      if (!map) return;
      const { lng, lat } = e.lngLat;

      if (!connectSource) {
        // First click: select source asset (or custom POC on empty space)
        const features = map.queryRenderedFeatures(e.point);
        const layerFeature = features.find((f) => f.layer.id.startsWith("layer-"));

        let coords: [number, number];
        let sourceProps: Record<string, unknown>;
        let sourceLabel: string;

        if (layerFeature) {
          const layerId = layerFeature.layer.id.replace("layer-", "");
          const regLayer = layerMap.get(layerId);
          coords = layerFeature.geometry.type === "Point"
            ? (layerFeature.geometry as GeoJSON.Point).coordinates as [number, number]
            : [lng, lat] as [number, number];
          sourceProps = (layerFeature.properties || {}) as Record<string, unknown>;
          sourceLabel = regLayer?.display_name || "Asset";
        } else {
          // No asset hit — allow custom POC placement
          coords = [lng, lat];
          sourceProps = {};
          sourceLabel = "Custom POC";
        }

        connectSrcMarkerRef.current?.remove();
        const srcMarker = new maplibregl.Marker({ color: "#3498db" })
          .setLngLat(coords)
          .addTo(map);
        connectSrcMarkerRef.current = srcMarker;

        setConnectSource({
          lngLat: coords,
          properties: sourceProps,
          layerLabel: sourceLabel,
        });
        setConnectWaypoints([]);
        toast({ title: `Source: ${sourceLabel}`, description: "Click to add route waypoints. Double-click to finish." });
      } else {
        // Subsequent clicks: add waypoint
        const newPoint: [number, number] = [lng, lat];
        const updatedWaypoints = [...connectWaypoints, newPoint];
        setConnectWaypoints(updatedWaypoints);

        const wpMarker = new maplibregl.Marker({ color: "#9b59b6", scale: 0.6 })
          .setLngLat(newPoint)
          .addTo(map);
        waypointMarkersRef.current.push(wpMarker);

        // Update polyline
        const allCoords = [connectSource.lngLat, ...updatedWaypoints];
        const lineId = "connect-line";
        if (map.getSource(lineId)) {
          (map.getSource(lineId) as maplibregl.GeoJSONSource).setData({
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: allCoords },
          });
        } else {
          map.addSource(lineId, {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: allCoords },
            },
          });
          map.addLayer({
            id: lineId,
            type: "line",
            source: lineId,
            paint: { "line-color": "#2ecc71", "line-width": 3, "line-dasharray": [4, 3] },
          });
        }
      }
    },
    [map, connectSource, connectWaypoints, layerMap, toast]
  );

  const finishRoute = useCallback(() => {
    if (!connectSource || connectWaypoints.length === 0 || !map) return;
    const lastPoint = connectWaypoints[connectWaypoints.length - 1];
    const allCoords: [number, number][] = [connectSource.lngLat, ...connectWaypoints];

    connectDstMarkerRef.current?.remove();
    const dstEl = document.createElement("div");
    dstEl.style.cssText = "width:18px;height:18px;background:#e74c3c;border:3px solid #fff;border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,0.5);";
    const dstMarker = new maplibregl.Marker({ element: dstEl })
      .setLngLat(lastPoint)
      .addTo(map);
    connectDstMarkerRef.current = dstMarker;

    setConnectEndpoints({
      source: connectSource,
      destination: { lngLat: lastPoint },
      routeCoords: allCoords,
    });
  }, [connectSource, connectWaypoints, map]);

  const handleDblClick = useCallback(
    (e: maplibregl.MapMouseEvent) => {
      if (!connectSource) return;
      e.preventDefault();
      if (connectWaypoints.length === 0) return;
      finishRoute();
    },
    [connectSource, connectWaypoints, finishRoute]
  );

  const undoWaypoint = useCallback(() => {
    if (!map || connectWaypoints.length === 0 || !connectSource) return;
    const updated = connectWaypoints.slice(0, -1);
    setConnectWaypoints(updated);

    const lastMarker = waypointMarkersRef.current.pop();
    lastMarker?.remove();

    const allCoords = [connectSource.lngLat, ...updated];
    const lineId = "connect-line";
    if (updated.length === 0) {
      if (map.getLayer(lineId)) map.removeLayer(lineId);
      if (map.getSource(lineId)) map.removeSource(lineId);
    } else if (map.getSource(lineId)) {
      (map.getSource(lineId) as maplibregl.GeoJSONSource).setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: allCoords },
      });
    }
  }, [connectSource, connectWaypoints, map]);

  const clearConnect = useCallback(() => {
    connectSrcMarkerRef.current?.remove();
    connectSrcMarkerRef.current = null;
    connectDstMarkerRef.current?.remove();
    connectDstMarkerRef.current = null;
    clearWaypointMarkers();
    clearConnectLine();
    setConnectSource(null);
    setConnectWaypoints([]);
    setConnectEndpoints(null);
  }, [clearWaypointMarkers, clearConnectLine]);

  return {
    connectSource,
    connectWaypoints,
    connectEndpoints,
    handleConnectClick,
    handleDblClick,
    finishRoute,
    undoWaypoint,
    clearConnect,
    setConnectEndpoints,
    setConnectSource,
  };
}
