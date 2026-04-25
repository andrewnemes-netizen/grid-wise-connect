import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { DesignCable } from "@/hooks/useDesignMode";

interface DesignCableLabelsProps {
  map: maplibregl.Map | null;
  cables: DesignCable[];
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
export function DesignCableLabels({ map, cables }: DesignCableLabelsProps) {
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  // Keep a copy of the latest coords per cable so the rubber-band handler can
  // mutate them without going through React state.
  const liveCoordsRef = useRef<Map<string, [number, number][]>>(new Map());

  // Sync markers whenever the cable list changes.
  useEffect(() => {
    if (!map) return;
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
  }, [map, cables]);

  // Rubber-band: when an element moves, recompute the pill position for any
  // cable whose endpoint matched the original location of that element.
  useEffect(() => {
    if (!map) return;
    const onDrag = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string; lng: number; lat: number }>).detail;
      cables.forEach((cable) => {
        const live = liveCoordsRef.current.get(cable.id);
        if (!live) return;
        // Two endpoints to check: index 0 and last.
        const orig = cable.coordinates;
        let touched = false;
        const next: [number, number][] = orig.map((pt, i) => {
          // Endpoints only — auto-cables are 2-point lines today.
          if (i !== 0 && i !== orig.length - 1) return live[i] ?? pt;
          // Match on the last-known live coord (handles successive drags).
          const cmp = live[i] ?? pt;
          if (
            Math.abs(cmp[0] - (orig[i][0])) < 1e-7 &&
            Math.abs(cmp[1] - (orig[i][1])) < 1e-7 &&
            i === (orig.length - 1)
              ? false
              : false
          ) {
            // (placeholder — rubber-band uses event-driven matching below)
          }
          return cmp;
        });
        // The actual rubber-band match: if either endpoint of the cable was the
        // dragged element, replace it with the new lng/lat.
        for (let i = 0; i < next.length; i++) {
          if (i !== 0 && i !== next.length - 1) continue;
          const original = orig[i];
          if (
            Math.abs(original[0] - (live[i]?.[0] ?? original[0])) < 1e-7 &&
            Math.abs(original[1] - (live[i]?.[1] ?? original[1])) < 1e-7
          ) {
            // No-op; we don't know which endpoint corresponds to the element
            // without extra metadata, so we update both possibilities below.
          }
        }
        // Simpler: always test both endpoints against the current live anchor.
        const tryUpdate = (i: number) => {
          const cur = live[i];
          if (!cur) return;
          // We can't know the element ID per endpoint without metadata, so
          // accept any endpoint within ~1m of the previous live coord and move
          // it. The cable rubber-band in useDesignDragDrop already constrains
          // this to endpoints connected to the dragged marker.
          const dragLng = detail.lng;
          const dragLat = detail.lat;
          // Heuristic: nudge whichever endpoint is currently closest to the
          // drag pointer's previous frame.
          // (For 2-point auto-cables, only one endpoint will match.)
          const dx = cur[0] - dragLng;
          const dy = cur[1] - dragLat;
          if (Math.hypot(dx, dy) < 1e-3) {
            next[i] = [dragLng, dragLat];
            touched = true;
          }
        };
        tryUpdate(0);
        tryUpdate(next.length - 1);
        if (!touched) return;
        liveCoordsRef.current.set(cable.id, next);
        const m = markersRef.current.get(cable.id);
        if (!m) return;
        m.setLngLat(midpoint(next));
        // Recompute length on the fly for the pill.
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