import { useState, useCallback, useRef, useEffect } from "react";
import maplibregl from "maplibre-gl";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type EquipmentType = "transformer" | "rmu" | "feeder_pillar" | "cutout" | "joint" | "pole";

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

const EQUIPMENT_CONFIG: Record<EquipmentType, { color: string; symbol: string; label: string }> = {
  transformer: { color: "#e74c3c", symbol: "T", label: "Transformer" },
  rmu: { color: "#3498db", symbol: "R", label: "Ring Main Unit" },
  feeder_pillar: { color: "#2ecc71", symbol: "F", label: "Feeder Pillar" },
  cutout: { color: "#f39c12", symbol: "C", label: "Cutout" },
  joint: { color: "#9b59b6", symbol: "J", label: "Joint" },
  pole: { color: "#1abc9c", symbol: "P", label: "Pole" },
};

export { EQUIPMENT_CONFIG };

export function useDesignMode(map: maplibregl.Map | null, studyId: string | null) {
  const [elements, setElements] = useState<DesignElement[]>([]);
  const [placingType, setPlacingType] = useState<EquipmentType | null>(null);
  const [loading, setLoading] = useState(false);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  // Load existing elements when study changes
  useEffect(() => {
    if (!studyId) {
      setElements([]);
      return;
    }
    setLoading(true);
    supabase
      .from("design_elements")
      .select("*")
      .eq("study_id", studyId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.error("Failed to load design elements", error);
        }
        setElements((data as DesignElement[]) || []);
        setLoading(false);
      });
  }, [studyId]);

  // Sync markers to map
  useEffect(() => {
    if (!map) return;
    const currentIds = new Set(elements.map((e) => e.id));

    // Remove markers for deleted elements
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Add/update markers for existing elements
    elements.forEach((el) => {
      if (markersRef.current.has(el.id)) return;
      const cfg = EQUIPMENT_CONFIG[el.element_type];
      const markerEl = document.createElement("div");
      markerEl.style.cssText = `
        width: 24px; height: 24px; border-radius: 50%;
        background: ${cfg.color}; border: 2px solid #fff;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 700; color: #fff; cursor: pointer;
      `;
      markerEl.textContent = cfg.symbol;
      markerEl.title = el.label || cfg.label;

      const marker = new maplibregl.Marker({ element: markerEl })
        .setLngLat([el.lng, el.lat])
        .addTo(map);
      markersRef.current.set(el.id, marker);
    });

    return () => {
      // Cleanup all on unmount
    };
  }, [map, elements]);

  // Cleanup all markers on unmount
  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
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

  const removeElement = useCallback(
    async (id: string) => {
      const { error } = await supabase
        .from("design_elements")
        .delete()
        .eq("id", id);

      if (error) {
        toast.error("Failed to remove element");
        return;
      }

      const marker = markersRef.current.get(id);
      marker?.remove();
      markersRef.current.delete(id);
      setElements((prev) => prev.filter((e) => e.id !== id));
    },
    []
  );

  const clearAll = useCallback(
    async () => {
      if (!studyId) return;
      const { error } = await supabase
        .from("design_elements")
        .delete()
        .eq("study_id", studyId);

      if (error) {
        toast.error("Failed to clear elements");
        return;
      }

      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      setElements([]);
      toast.success("Design cleared");
    },
    [studyId]
  );

  return {
    elements,
    placingType,
    setPlacingType,
    placeElement,
    removeElement,
    clearAll,
    loading,
  };
}
