/**
 * Hook to auto-detect cable candidates, surface types, and crossings
 * along a drawn route using PostGIS spatial queries.
 */
import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface DetectedCable {
  id: string;
  asset_id: string | null;
  name: string | null;
  voltage_kv: number | null;
  capacity_flag: string | null;
  distance_m: number;
  layer_name: string | null;
  dno: string;
}

export interface DetectedSurface {
  segment_id: string;
  surface_type: "FOOTWAY" | "CARRIAGEWAY" | "VERGE";
  length_m: number;
  footway_width_m: number | null;
  carriageway_width_m: number | null;
  restriction_flag: string | null;
}

export interface DetectedCrossing {
  crossing_type: "CABLE" | "FEEDER";
  asset_name: string | null;
  voltage_kv: number | null;
  dno: string;
}

export interface RouteAutoDetectResult {
  cable_candidates: DetectedCable[];
  surface_segments: DetectedSurface[];
  crossings: DetectedCrossing[];
  errors: string[];
}

export function useRouteAutoDetect() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RouteAutoDetectResult | null>(null);

  const detect = useCallback(async (routeCoords: [number, number][], searchRadiusM = 200) => {
    if (routeCoords.length < 2) return null;

    setLoading(true);
    try {
      const res = await supabase.functions.invoke("route-auto-detect", {
        body: { route_coords: routeCoords, search_radius_m: searchRadiusM },
      });

      if (res.error) throw res.error;

      const data = res.data as RouteAutoDetectResult;
      setResult(data);

      if (data.errors?.length > 0) {
        toast({
          title: "Partial auto-detect",
          description: `Some queries failed: ${data.errors.join(", ")}`,
          variant: "destructive",
        });
      }

      const totalFound = data.cable_candidates.length + data.surface_segments.length + data.crossings.length;
      if (totalFound > 0) {
        toast({
          title: "Route auto-detect complete",
          description: `${data.cable_candidates.length} cables · ${data.surface_segments.length} surface segments · ${data.crossings.length} crossings`,
        });
      } else {
        toast({
          title: "No spatial data found",
          description: "No cables, surface data, or crossings detected along this route.",
        });
      }

      return data;
    } catch (err: any) {
      toast({ title: "Auto-detect failed", description: err.message, variant: "destructive" });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const clear = useCallback(() => setResult(null), []);

  return { detect, loading, result, clear };
}
