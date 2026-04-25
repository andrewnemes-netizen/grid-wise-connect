import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { DesignCable, DesignElement } from "@/hooks/useDesignMode";

interface DesignCableLabelsProps {
  map: maplibregl.Map | null;
  cables: DesignCable[];
  elements: DesignElement[];
  /** While true the bar's "live" pulse highlights the labels. */
  isLive?: boolean;
}

function midpoint(coords: [number, number][]): [number, number] {
  if (coords.length === 0) return [0, 0];
  if (coords.length === 1) return coords[0];
  // Find the centre point along the polyline.
  let total = 0;
  const segs: number[] = [];
  for (let i = 1; i < coords.length; i++) {
    const [x1, y1] = coords[i - 1];
    const [x2, y2] = coords[i];
    const d = Math.hypot(x2 - x1, y2 - y1);
    segs.push(d);
    total += d;
  }
  let target = total / 2;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]) {
      const t = segs[i] === 0 ? 0 : target / segs[i];
      const [x1, y1] = coords[i];
      const [x2, y2] = coords[i + 1];
      return [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t];
    }
    target -= segs[i];
  }
  return coords[Math.floor(coords.length / 2)];
}

function makeLabelEl(text: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "design-cable-label";
  el.style.cssText = `
    pointer-events: none;
    background: hsl(var(--background));
    color: hsl(var(--foreground));
    border: 1px solid hsl(var(--border));
    border-radius: 9999px;
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 600;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    box-shadow: 0 1px 3px rgba(0,0,0,0.18);
    white-space: nowrap;
    transform: translate(-50%, -50%);
  `;
  el.textContent = text;
  return el;
}

/**
 * Renders a small "12.89 m" pill at the midpoint of every design cable.
 * Mirrors the FlowEmo screenshot — purely informational, no interaction.
 *
 * Uses MapLibre Markers so labels track pan/zoom for free, and listens for
 * the `design:element-drag` custom event so they follow rubber-band moves.
 */
export function DesignCableLabels({ map, cables, elements }: DesignCableLabelsProps) {
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  // Latest in-memory coords per cable so we can update labels mid-drag without
  // round-tripping through React state.
  const liveCoordsRef = useRef<Map<string, [number, number][]>>(new Map());
  // Live element positions (updated by the design:element-drag event).
  const elementPosRef = useRef<Map<string, [number, number]>>(new Map());

  // Sync markers whenever the cable list changes.
  useEffect(() => {
    if (!map) return;
    // Refresh the element-position cache.
    elementPosRef.current = new Map(elements.map((el) => [el.id, [el.lng, el.lat] as [number, number]]));
    const ids = new Set(cables.map((c) => c.id));
    // Remove markers whose cable is gone.
    markersRef.current.forEach((m, id) => {
      if (!ids.has(id)) {
        m.remove();
        markersRef.current.delete(id);
        liveCoordsRef.current.delete(id);
      }
    });
    // Add / update markers.
    cables.forEach((cable) => {
      liveCoordsRef.current.set(cable.id, cable.coordinates);
      const text = `${cable.length_m.toFixed(2)} m`;
      const mid = midpoint(cable.coordinates);
      const existing = markersRef.current.get(cable.id);
      if (existing) {
        existing.setLngLat(mid);
        const el = existing.getElement();
        el.textContent = text;
        return;
      }
      const el = makeLabelEl(text);
      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat(mid)
        .addTo(map);
      markersRef.current.set(cable.id, marker);
    });
  }, [map, cables, elements]);

  // Rubber-band: when an element moves, recompute the pill position for any
  // cable whose `from_id` / `to_id` matches the element. We use the metadata
  // stamped on auto-cables (and any user-routed cable that adopts the same
  // convention) so this stays robust against multiple chargers stacked at
  // identical coords.
  useEffect(() => {
    if (!map) return;
    const onDrag = (e: Event) => {
      const { id: elementId, lng, lat } = (e as CustomEvent<{ id: string; lng: number; lat: number }>).detail;
      elementPosRef.current.set(elementId, [lng, lat]);
      cables.forEach((cable) => {
        const props = (cable.properties_json ?? {}) as { from_id?: string; to_id?: string };
        const fromId = props.from_id;
        const toId = props.to_id;
        if (fromId !== elementId && toId !== elementId) return;
        const baseCoords = liveCoordsRef.current.get(cable.id) ?? cable.coordinates;
        const next: [number, number][] = [...baseCoords];
        if (fromId === elementId) next[0] = [lng, lat];
        if (toId === elementId) next[next.length - 1] = [lng, lat];
        liveCoordsRef.current.set(cable.id, next);
        const m = markersRef.current.get(cable.id);
        if (!m) return;
        m.setLngLat(midpoint(next));
        let total = 0;
        for (let i = 1; i < next.length; i++) {
          const [lon1, lat1] = next[i - 1];
          const [lon2, lat2] = next[i];
          const R = 6371000;
          const dLat = ((lat2 - lat1) * Math.PI) / 180;
          const dLon = ((lon2 - lon1) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((lat1 * Math.PI) / 180) *
              Math.cos((lat2 * Math.PI) / 180) *
              Math.sin(dLon / 2) ** 2;
          total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
        m.getElement().textContent = `${total.toFixed(2)} m`;
      });
    };
    window.addEventListener("design:element-drag", onDrag as EventListener);
    return () => window.removeEventListener("design:element-drag", onDrag as EventListener);
  }, [map, cables]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      liveCoordsRef.current.clear();
    };
  }, []);

  return null;
}