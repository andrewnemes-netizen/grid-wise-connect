import { useState, useCallback, useRef, useEffect } from "react";
import maplibregl from "maplibre-gl";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type EquipmentType = "transformer" | "rmu" | "feeder_pillar" | "cutout" | "joint" | "pole" | "ev_charger";
export type CableType = "lv_main" | "lv_service" | "hv_cable" | "pilot_cable";

export interface DesignElement {
  id: string;
  study_id: string;
  element_type: EquipmentType;
  label: string | null;
  lng: number;
  lat: number;
  properties_json: Record<string, unknown>;
  created_at: string;
}

export interface DesignCable {
  id: string;
  study_id: string;
  cable_type: CableType;
  label: string | null;
  coordinates: [number, number][];
  length_m: number;
  properties_json: Record<string, unknown>;
  created_by: string;
  created_at: string;
}

const EQUIPMENT_CONFIG: Record<EquipmentType, { color: string; symbol: string; label: string }> = {
  transformer: { color: "#e74c3c", symbol: "T", label: "Transformer" },
  rmu: { color: "#3498db", symbol: "R", label: "Ring Main Unit" },
  feeder_pillar: { color: "#2ecc71", symbol: "F", label: "Feeder Pillar" },
  cutout: { color: "#f39c12", symbol: "C", label: "Cutout" },
  joint: { color: "#9b59b6", symbol: "J", label: "Joint" },
  pole: { color: "#1abc9c", symbol: "P", label: "Pole" },
  ev_charger: { color: "#00b894", symbol: "E", label: "EV Charger" },
};

const CABLE_CONFIG: Record<CableType, { color: string; label: string; dasharray: number[] }> = {
  lv_main: { color: "#e74c3c", label: "LV Main", dasharray: [] },
  lv_service: { color: "#3498db", label: "LV Service", dasharray: [6, 4] },
  hv_cable: { color: "#f39c12", label: "HV Cable", dasharray: [] },
  pilot_cable: { color: "#9b59b6", label: "Pilot Cable", dasharray: [2, 3] },
};

export { EQUIPMENT_CONFIG, CABLE_CONFIG };

function haversineDistance(coords: [number, number][]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return total;
}

function removeLayerAndSource(map: maplibregl.Map, id: string) {
  try {
    if (map.getLayer(id)) map.removeLayer(id);
  } catch {
    // Style might be reloading
  }
  try {
    if (map.getSource(id)) map.removeSource(id);
  } catch {
    // Style might be reloading
  }
}

export function useDesignMode(map: maplibregl.Map | null, studyId: string | null) {
  const [elements, setElements] = useState<DesignElement[]>([]);
  const [placingType, setPlacingType] = useState<EquipmentType | null>(null);
  const [loading, setLoading] = useState(false);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  // Cable state
  const [cables, setCables] = useState<DesignCable[]>([]);
  const [drawingCableType, setDrawingCableType] = useState<CableType | null>(null);
  const [cableVertices, setCableVertices] = useState<[number, number][]>([]);
  const vertexMarkersRef = useRef<maplibregl.Marker[]>([]);

  // Mutually exclusive: selecting cable deselects equipment and vice versa
  const selectPlacingType = useCallback((type: EquipmentType | null) => {
    setPlacingType(type);
    if (type) setDrawingCableType(null);
  }, []);

  const selectCableType = useCallback((type: CableType | null) => {
    setDrawingCableType(type);
    if (type) setPlacingType(null);
    // Clear any in-progress vertices when switching
    setCableVertices([]);
    vertexMarkersRef.current.forEach((m) => m.remove());
    vertexMarkersRef.current = [];
    if (map) {
      removeLayerAndSource(map, "design-cable-drawing");
    }
  }, [map]);

  // Load existing elements when study changes
  useEffect(() => {
    if (!studyId) {
      setElements([]);
      setCables([]);
      return;
    }
    setLoading(true);
    Promise.all([
      supabase
        .from("design_elements")
        .select("*")
        .eq("study_id", studyId)
        .order("created_at", { ascending: true }),
      supabase
        .from("design_cables")
        .select("*")
        .eq("study_id", studyId)
        .order("created_at", { ascending: true }),
    ]).then(([elemResult, cableResult]) => {
      if (elemResult.error) console.error("Failed to load design elements", elemResult.error);
      if (cableResult.error) console.error("Failed to load design cables", cableResult.error);
      setElements((elemResult.data as DesignElement[]) || []);
      setCables((cableResult.data as DesignCable[]) || []);
      setLoading(false);
    });
  }, [studyId]);

  // Sync equipment markers to map
  useEffect(() => {
    if (!map) return;
    const currentIds = new Set(elements.map((e) => e.id));

    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    elements.forEach((el) => {
      if (markersRef.current.has(el.id)) return;
      const cfg = EQUIPMENT_CONFIG[el.element_type];
      const markerEl = document.createElement("div");
      markerEl.style.cssText = `
        width: 24px; height: 24px; border-radius: 50%;
        background: ${cfg.color}; border: 2px solid #fff;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 700; color: #fff; cursor: grab;
      `;
      markerEl.textContent = cfg.symbol;
      markerEl.title = el.label || cfg.label;

      const marker = new maplibregl.Marker({ element: markerEl, draggable: true })
        .setLngLat([el.lng, el.lat])
        .addTo(map);

      marker.on("dragstart", () => {
        markerEl.style.cursor = "grabbing";
        // Notify any subscribers (live totals bar uses this to pulse).
        window.dispatchEvent(new CustomEvent("design:element-dragstart", { detail: { id: el.id } }));
      });
      marker.on("drag", () => {
        const ll = marker.getLngLat();
        // Live patch in-memory for cable rubber-banding & live totals.
        window.dispatchEvent(
          new CustomEvent("design:element-drag", {
            detail: { id: el.id, lng: ll.lng, lat: ll.lat },
          })
        );
      });
      marker.on("dragend", () => {
        markerEl.style.cursor = "grab";
        const ll = marker.getLngLat();
        window.dispatchEvent(
          new CustomEvent("design:element-dragend", {
            detail: { id: el.id, lng: ll.lng, lat: ll.lat },
          })
        );
      });
      markersRef.current.set(el.id, marker);
    });
  }, [map, elements]);

  // Sync cable lines to map
  useEffect(() => {
    if (!map) return;

    try {
      const style = map.getStyle();
      if (!style?.sources) return;

      // Remove old cable layers
      const existingSources = Object.keys(style.sources).filter((s) => s.startsWith("design-cable-"));
      existingSources.forEach((srcId) => {
        if (srcId === "design-cable-drawing") return;
        removeLayerAndSource(map, srcId);
      });

      cables.forEach((cable) => {
        const srcId = `design-cable-${cable.id}`;
        const cfg = CABLE_CONFIG[cable.cable_type as CableType] || CABLE_CONFIG.lv_main;

        if (map.getSource(srcId)) return;

        map.addSource(srcId, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: { label: cable.label, length_m: cable.length_m },
            geometry: { type: "LineString", coordinates: cable.coordinates },
          },
        });

        const paint: Record<string, unknown> = {
          "line-color": cfg.color,
          "line-width": 3,
          "line-opacity": 0.9,
        };
        if (cfg.dasharray.length > 0) {
          paint["line-dasharray"] = cfg.dasharray;
        }

        map.addLayer({
          id: srcId,
          type: "line",
          source: srcId,
          paint: paint as any,
        });
      });
    } catch (error) {
      console.warn("Skipped cable sync while map style was unavailable", error);
    }
  }, [map, cables]);

  // Cleanup all markers on unmount
  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      vertexMarkersRef.current.forEach((m) => m.remove());
      vertexMarkersRef.current = [];
    };
  }, []);

  const placeElement = useCallback(
    async (lng: number, lat: number) => {
      if (!placingType || !studyId) return;

      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast.error("You must be logged in");
        return;
      }

      const cfg = EQUIPMENT_CONFIG[placingType];
      const label = `${cfg.label} ${elements.filter((e) => e.element_type === placingType).length + 1}`;

      const { data, error } = await supabase
        .from("design_elements")
        .insert({
          study_id: studyId,
          element_type: placingType,
          label,
          lng,
          lat,
          created_by: user.user.id,
        })
        .select()
        .single();

      if (error) {
        toast.error("Failed to place equipment");
        console.error(error);
        return;
      }

      setElements((prev) => [...prev, data as DesignElement]);
      toast.success(`Placed ${label}`);
    },
    [placingType, studyId, elements]
  );

  const removeElement = useCallback(async (id: string) => {
    const { error } = await supabase.from("design_elements").delete().eq("id", id);
    if (error) {
      toast.error("Failed to remove element");
      return;
    }
    const marker = markersRef.current.get(id);
    marker?.remove();
    markersRef.current.delete(id);
    setElements((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const clearAll = useCallback(async () => {
    if (!studyId) return;
    const { error } = await supabase.from("design_elements").delete().eq("study_id", studyId);
    if (error) {
      toast.error("Failed to clear elements");
      return;
    }
    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();
    setElements([]);

    // Also clear cables
    const { error: cableError } = await supabase.from("design_cables").delete().eq("study_id", studyId);
    if (cableError) {
      toast.error("Failed to clear cables");
      return;
    }
    // Remove cable layers from map
    if (map) {
      cables.forEach((cable) => {
        removeLayerAndSource(map, `design-cable-${cable.id}`);
      });
    }
    setCables([]);
    toast.success("Design cleared");
  }, [studyId, map, cables]);

  // Cable drawing functions
  const addCableVertex = useCallback(
    (lng: number, lat: number) => {
      if (!drawingCableType || !map) return;
      const newPoint: [number, number] = [lng, lat];
      const updated = [...cableVertices, newPoint];
      setCableVertices(updated);

      // Add vertex marker
      const el = document.createElement("div");
      el.style.cssText = "width:8px;height:8px;background:#fff;border:2px solid #333;border-radius:50%;";
      const m = new maplibregl.Marker({ element: el }).setLngLat(newPoint).addTo(map);
      vertexMarkersRef.current.push(m);

      // Update drawing line
      const cfg = CABLE_CONFIG[drawingCableType];
      const lineId = "design-cable-drawing";
      if (updated.length >= 2) {
        try {
          if (map.getSource(lineId)) {
            (map.getSource(lineId) as maplibregl.GeoJSONSource).setData({
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: updated },
            });
          } else {
            map.addSource(lineId, {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: updated },
              },
            });
            const paint: Record<string, unknown> = {
              "line-color": cfg.color,
              "line-width": 3,
              "line-opacity": 0.7,
            };
            if (cfg.dasharray.length > 0) {
              paint["line-dasharray"] = cfg.dasharray;
            }
            map.addLayer({
              id: lineId,
              type: "line",
              source: lineId,
              paint: paint as any,
            });
          }
        } catch (error) {
          console.warn("Skipping temporary cable draw update while style reloads", error);
        }
      }
    },
    [drawingCableType, cableVertices, map]
  );

  const undoCableVertex = useCallback(() => {
    if (!map || cableVertices.length === 0) return;
    const updated = cableVertices.slice(0, -1);
    setCableVertices(updated);

    const lastMarker = vertexMarkersRef.current.pop();
    lastMarker?.remove();

    const lineId = "design-cable-drawing";
    if (updated.length < 2) {
      removeLayerAndSource(map, lineId);
    } else if (map.getSource(lineId)) {
      (map.getSource(lineId) as maplibregl.GeoJSONSource).setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: updated },
      });
    }
  }, [cableVertices, map]);

  const finishCable = useCallback(async () => {
    if (!drawingCableType || !studyId || cableVertices.length < 2) return;

    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      toast.error("You must be logged in");
      return;
    }

    const cfg = CABLE_CONFIG[drawingCableType];
    const length_m = Math.round(haversineDistance(cableVertices) * 10) / 10;
    const label = `${cfg.label} ${cables.filter((c) => c.cable_type === drawingCableType).length + 1}`;

    const { data, error } = await supabase
      .from("design_cables")
      .insert({
        study_id: studyId,
        cable_type: drawingCableType,
        label,
        coordinates: cableVertices as any,
        length_m,
        created_by: user.user.id,
      } as any)
      .select()
      .single();

    if (error) {
      toast.error("Failed to save cable");
      console.error(error);
      return;
    }

    setCables((prev) => [...prev, data as unknown as DesignCable]);
    toast.success(`${label} — ${length_m.toLocaleString()}m`);

    // Clean up drawing state
    setCableVertices([]);
    vertexMarkersRef.current.forEach((m) => m.remove());
    vertexMarkersRef.current = [];
    if (map) {
      removeLayerAndSource(map, "design-cable-drawing");
    }
  }, [drawingCableType, studyId, cableVertices, cables, map]);

  const removeCable = useCallback(
    async (id: string) => {
      const { error } = await supabase.from("design_cables").delete().eq("id", id);
      if (error) {
        toast.error("Failed to remove cable");
        return;
      }
      if (map) {
        removeLayerAndSource(map, `design-cable-${id}`);
      }
      setCables((prev) => prev.filter((c) => c.id !== id));
    },
    [map]
  );

  /**
   * Persist a new position for an existing element (used by the live
   * drag-and-drop designer when the user drags a placed marker).
   */
  const updateElementPosition = useCallback(
    async (id: string, lng: number, lat: number) => {
      // Optimistic local update so the UI ticks immediately.
      setElements((prev) => prev.map((e) => (e.id === id ? { ...e, lng, lat } : e)));
      const { error } = await supabase
        .from("design_elements")
        .update({ lng, lat })
        .eq("id", id);
      if (error) {
        toast.error("Failed to save new position");
        console.error(error);
      }
    },
    []
  );

  /**
   * Persist a fresh coordinate path + recomputed length for an existing cable.
   * Used by rubber-band updates while a connected element is being dragged.
   */
  const updateCableCoordinates = useCallback(
    async (id: string, coordinates: [number, number][]) => {
      const length_m = Math.round(haversineDistance(coordinates) * 10) / 10;
      setCables((prev) =>
        prev.map((c) => (c.id === id ? { ...c, coordinates, length_m } : c))
      );
      // Refresh the on-map line immediately.
      if (map) {
        const srcId = `design-cable-${id}`;
        const src = map.getSource(srcId) as maplibregl.GeoJSONSource | undefined;
        if (src) {
          src.setData({
            type: "Feature",
            properties: { length_m },
            geometry: { type: "LineString", coordinates },
          });
        }
      }
      const { error } = await supabase
        .from("design_cables")
        .update({ coordinates: coordinates as any, length_m })
        .eq("id", id);
      if (error) {
        toast.error("Failed to save cable");
        console.error(error);
      }
    },
    [map]
  );

  /**
   * Drop a new equipment item from a drag-and-drop palette (no `placingType`
   * pre-selection required) and return the inserted row so callers can chain
   * an auto-cable insert.
   */
  const dropElement = useCallback(
    async (
      type: EquipmentType,
      lng: number,
      lat: number
    ): Promise<DesignElement | null> => {
      if (!studyId) {
        toast.error("Open a study first to design");
        return null;
      }
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast.error("You must be logged in");
        return null;
      }
      const cfg = EQUIPMENT_CONFIG[type];
      const label = `${cfg.label} ${elements.filter((e) => e.element_type === type).length + 1}`;
      const { data, error } = await supabase
        .from("design_elements")
        .insert({
          study_id: studyId,
          element_type: type,
          label,
          lng,
          lat,
          created_by: user.user.id,
        })
        .select()
        .single();
      if (error || !data) {
        toast.error("Failed to drop equipment");
        console.error(error);
        return null;
      }
      const inserted = data as DesignElement;
      setElements((prev) => [...prev, inserted]);
      toast.success(`Dropped ${label}`);
      return inserted;
    },
    [studyId, elements]
  );

  /** Insert an auto-routed cable (used by drag-and-drop auto-cable on drop). */
  const insertAutoCable = useCallback(
    async (
      type: CableType,
      coordinates: [number, number][],
      label?: string
    ): Promise<DesignCable | null> => {
      if (!studyId || coordinates.length < 2) return null;
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return null;
      const cfg = CABLE_CONFIG[type];
      const length_m = Math.round(haversineDistance(coordinates) * 10) / 10;
      const { data, error } = await supabase
        .from("design_cables")
        .insert({
          study_id: studyId,
          cable_type: type,
          label: label || `${cfg.label} ${cables.filter((c) => c.cable_type === type).length + 1}`,
          coordinates: coordinates as any,
          length_m,
          created_by: user.user.id,
        } as any)
        .select()
        .single();
      if (error || !data) {
        console.error(error);
        return null;
      }
      const inserted = data as unknown as DesignCable;
      setCables((prev) => [...prev, inserted]);
      return inserted;
    },
    [studyId, cables]
  );

  /**
   * Bulk-insert elements and cables from an external source (e.g. Gridwise Connect bridge).
   * Returns the number of items successfully created.
   */
  const bulkInsert = useCallback(
    async (
      newElements: { element_type: EquipmentType; label: string; lng: number; lat: number; properties_json: Record<string, unknown> }[],
      newCables: { cable_type: CableType; label: string; coordinates: [number, number][] }[]
    ): Promise<number> => {
      if (!studyId) return 0;
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        toast.error("You must be logged in");
        return 0;
      }

      let count = 0;

      // Insert elements
      if (newElements.length > 0) {
        const rows = newElements.map((el) => ({
          study_id: studyId,
          element_type: el.element_type,
          label: el.label,
          lng: el.lng,
          lat: el.lat,
          properties_json: el.properties_json as any,
          created_by: user.user!.id,
        }));
        const { data, error } = await supabase
          .from("design_elements")
          .insert(rows)
          .select();
        if (error) {
          toast.error("Failed to insert design elements");
          console.error(error);
        } else if (data) {
          setElements((prev) => [...prev, ...(data as DesignElement[])]);
          count += data.length;
        }
      }

      // Insert cables
      for (const cable of newCables) {
        const length_m = Math.round(haversineDistance(cable.coordinates) * 10) / 10;
        const { data, error } = await supabase
          .from("design_cables")
          .insert({
            study_id: studyId,
            cable_type: cable.cable_type,
            label: cable.label,
            coordinates: cable.coordinates as any,
            length_m,
            created_by: user.user!.id,
          } as any)
          .select()
          .single();
        if (error) {
          toast.error(`Failed to insert cable: ${cable.label}`);
          console.error(error);
        } else if (data) {
          setCables((prev) => [...prev, data as unknown as DesignCable]);
          count++;
        }
      }

      return count;
    },
    [studyId]
  );

  return {
    elements,
    placingType,
    setPlacingType: selectPlacingType,
    placeElement,
    removeElement,
    clearAll,
    loading,
    // Cable API
    cables,
    drawingCableType,
    setDrawingCableType: selectCableType,
    cableVertices,
    addCableVertex,
    undoCableVertex,
    finishCable,
    removeCable,
    // Live drag-and-drop API
    updateElementPosition,
    updateCableCoordinates,
    dropElement,
    insertAutoCable,
    // Bulk API (for Connect → Design bridge)
    bulkInsert,
  };
}
