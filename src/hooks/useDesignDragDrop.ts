import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type {
  CableType,
  DesignCable,
  DesignElement,
  EquipmentType,
} from "@/hooks/useDesignMode";
import { EQUIPMENT_CONFIG } from "@/hooks/useDesignMode";
import { findNearestPoc, straightCableTo } from "@/lib/designAutoCable";

const DRAG_MIME = "application/x-gridwise-equipment";

interface UseDesignDragDropArgs {
  map: maplibregl.Map | null;
  containerRef: React.RefObject<HTMLDivElement>;
  elements: DesignElement[];
  cables: DesignCable[];
  active: boolean;
  autoCable: boolean;
  dropElement: (
    type: EquipmentType,
    lng: number,
    lat: number
  ) => Promise<DesignElement | null>;
  insertAutoCable: (
    type: CableType,
    coordinates: [number, number][],
    label?: string
  ) => Promise<DesignCable | null>;
  updateElementPosition: (id: string, lng: number, lat: number) => Promise<void>;
  updateCableCoordinates: (id: string, coords: [number, number][]) => Promise<void>;
}

/**
 * Drag-and-drop site designer hook.
 *
 * Wires up:
 *   • Palette card → map drop zone (creates a new element + optional auto-cable)
 *   • Ghost cursor that follows the pointer while dragging from the palette
 *   • In-flight rubber-banding of cables attached to a placed marker that the
 *     user is currently dragging on the map (events come from useDesignMode).
 */
export function useDesignDragDrop({
  map,
  containerRef,
  elements,
  cables,
  active,
  autoCable,
  dropElement,
  insertAutoCable,
  updateElementPosition,
  updateCableCoordinates,
}: UseDesignDragDropArgs) {
  const [draggingType, setDraggingType] = useState<EquipmentType | null>(null);
  const [ghostCoord, setGhostCoord] = useState<[number, number] | null>(null);
  const ghostElRef = useRef<HTMLDivElement | null>(null);

  // Live drag of an existing marker — track which element is being dragged so
 // the totals bar can show "live" delta and we can patch attached cables.
  const [draggingElementId, setDraggingElementId] = useState<string | null>(null);
  const [livePosition, setLivePosition] = useState<{ id: string; lng: number; lat: number } | null>(null);
  const originalPositionsRef = useRef<Map<string, [number, number]>>(new Map());

  // ── Palette card helpers ──────────────────────────────────────────────
  const onPaletteDragStart = useCallback((type: EquipmentType, e: React.DragEvent) => {
    setDraggingType(type);
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData(DRAG_MIME, type);
    // Hide the default browser drag image — we draw our own ghost on the map.
    const img = new Image();
    img.src =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    e.dataTransfer.setDragImage(img, 0, 0);
  }, []);

  const onPaletteDragEnd = useCallback(() => {
    setDraggingType(null);
    setGhostCoord(null);
  }, []);

  // ── Map drop zone ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !map) return;
    const node = containerRef.current;
    if (!node) return;

    const handleDragOver = (e: DragEvent) => {
      // Only accept our own MIME so we don't conflict with file drops.
      const types = e.dataTransfer?.types;
      if (!types || (!types.includes(DRAG_MIME) && !draggingType)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      const rect = node.getBoundingClientRect();
      const point: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
      const ll = map.unproject(point);
      setGhostCoord([ll.lng, ll.lat]);
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      const type =
        (e.dataTransfer?.getData(DRAG_MIME) as EquipmentType | "") ||
        draggingType ||
        null;
      setDraggingType(null);
      setGhostCoord(null);
      if (!type) return;
      const rect = node.getBoundingClientRect();
      const ll = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
      const inserted = await dropElement(type as EquipmentType, ll.lng, ll.lat);
      if (inserted && autoCable && type === "ev_charger") {
        const poc = findNearestPoc([ll.lng, ll.lat], elements);
        if (poc) {
          const coords = straightCableTo([ll.lng, ll.lat], poc.element);
          await insertAutoCable("lv_service", coords, `Auto-service ${inserted.label ?? ""}`.trim());
        }
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      // Hide ghost if the cursor leaves the map container.
      if (e.relatedTarget && node.contains(e.relatedTarget as Node)) return;
      setGhostCoord(null);
    };

    node.addEventListener("dragover", handleDragOver);
    node.addEventListener("drop", handleDrop);
    node.addEventListener("dragleave", handleDragLeave);
    return () => {
      node.removeEventListener("dragover", handleDragOver);
      node.removeEventListener("drop", handleDrop);
      node.removeEventListener("dragleave", handleDragLeave);
    };
  }, [active, map, containerRef, draggingType, dropElement, autoCable, elements, insertAutoCable]);

  // ── Render the ghost marker on the map ────────────────────────────────
  useEffect(() => {
    if (!map) return;
    if (!ghostCoord || !draggingType) {
      ghostElRef.current?.remove();
      ghostElRef.current = null;
      return;
    }
    const cfg = EQUIPMENT_CONFIG[draggingType];
    if (!ghostElRef.current) {
      const el = document.createElement("div");
      el.style.cssText = `
        position: absolute; pointer-events: none; z-index: 50;
        width: 36px; height: 36px; border-radius: 50%;
        background: ${cfg.color}; opacity: 0.65;
        border: 2px dashed #fff;
        box-shadow: 0 0 0 6px ${cfg.color}33;
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; font-weight: 800; color: #fff;
        transform: translate(-50%, -50%);
      `;
      el.textContent = cfg.symbol;
      const overlay = map.getCanvasContainer();
      overlay.appendChild(el);
      ghostElRef.current = el;
    } else {
      ghostElRef.current.style.background = cfg.color;
      ghostElRef.current.style.boxShadow = `0 0 0 6px ${cfg.color}33`;
      ghostElRef.current.textContent = cfg.symbol;
    }
    const px = map.project(ghostCoord);
    if (ghostElRef.current) {
      ghostElRef.current.style.left = `${px.x}px`;
      ghostElRef.current.style.top = `${px.y}px`;
    }
  }, [map, ghostCoord, draggingType]);

  // Cleanup ghost on unmount.
  useEffect(() => {
    return () => {
      ghostElRef.current?.remove();
      ghostElRef.current = null;
    };
  }, []);

  // ── Live rubber-band when an existing marker is being dragged ─────────
  // Marker drag events are emitted from useDesignMode via window CustomEvents
  // so this hook stays decoupled from MapLibre marker creation.
  useEffect(() => {
    if (!map) return;

    const onStart = (e: Event) => {
      const id = (e as CustomEvent<{ id: string }>).detail.id;
      const el = elements.find((x) => x.id === id);
      if (!el) return;
      originalPositionsRef.current.set(id, [el.lng, el.lat]);
      setDraggingElementId(id);
    };

    const onDrag = (e: Event) => {
      const { id, lng, lat } = (e as CustomEvent<{ id: string; lng: number; lat: number }>).detail;
      setLivePosition({ id, lng, lat });
      // Rubber-band any cable whose endpoint matches the original position.
      const orig = originalPositionsRef.current.get(id);
      if (!orig) return;
      cables.forEach((cable) => {
        let touched = false;
        const next: [number, number][] = cable.coordinates.map((pt) => {
          if (Math.abs(pt[0] - orig[0]) < 1e-7 && Math.abs(pt[1] - orig[1]) < 1e-7) {
            touched = true;
            return [lng, lat];
          }
          return pt;
        });
        if (!touched) return;
        const srcId = `design-cable-${cable.id}`;
        const src = map.getSource(srcId) as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData({
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: next },
          });
        }
      });
    };

    const onEnd = (e: Event) => {
      const { id, lng, lat } = (e as CustomEvent<{ id: string; lng: number; lat: number }>).detail;
      const orig = originalPositionsRef.current.get(id);
      originalPositionsRef.current.delete(id);
      setDraggingElementId(null);
      setLivePosition(null);
      // Persist the new element position.
      void updateElementPosition(id, lng, lat);
      // Persist any cable that was rubber-banded to this element.
      if (orig) {
        cables.forEach((cable) => {
          let touched = false;
          const next: [number, number][] = cable.coordinates.map((pt) => {
            if (Math.abs(pt[0] - orig[0]) < 1e-7 && Math.abs(pt[1] - orig[1]) < 1e-7) {
              touched = true;
              return [lng, lat];
            }
            return pt;
          });
          if (touched) void updateCableCoordinates(cable.id, next);
        });
      }
    };

    window.addEventListener("design:element-dragstart", onStart as EventListener);
    window.addEventListener("design:element-drag", onDrag as EventListener);
    window.addEventListener("design:element-dragend", onEnd as EventListener);
    return () => {
      window.removeEventListener("design:element-dragstart", onStart as EventListener);
      window.removeEventListener("design:element-drag", onDrag as EventListener);
      window.removeEventListener("design:element-dragend", onEnd as EventListener);
    };
  }, [map, elements, cables, updateElementPosition, updateCableCoordinates]);

  // Esc cancels an in-flight palette drag.
  useEffect(() => {
    if (!draggingType) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDraggingType(null);
        setGhostCoord(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draggingType]);

  return {
    draggingType,
    onPaletteDragStart,
    onPaletteDragEnd,
    draggingElementId,
    livePosition,
  };
}