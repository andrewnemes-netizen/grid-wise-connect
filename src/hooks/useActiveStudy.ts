import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";
import { estimateConnectionCost, generateBom } from "@/lib/connectionCosts";
import type { VoltageOverride } from "@/lib/connectionCosts";
import { useUnitRates } from "@/hooks/useUnitRates";

export interface ActiveStudy {
  id: string;
  study_name: string;
  mode: string;
  status: string;
  boundary_geojson: Json | null;
  route_geojson: Json | null;
  proposed_kw: number | null;
  dno: string | null;
  voltage_level: string | null;
  ruleset_version: string | null;
  engine_input_json: Json | null;
  engine_output_json: Json | null;
  cost_estimate_json: Json | null;
  bom_json: Json | null;
}

export function useActiveStudy() {
  const [searchParams] = useSearchParams();
  const studyId = searchParams.get("study");
  const [study, setStudy] = useState<ActiveStudy | null>(null);
  const [loading, setLoading] = useState(false);
  const { data: unitRates } = useUnitRates();

  useEffect(() => {
    if (!studyId) {
      setStudy(null);
      return;
    }
    setLoading(true);
    supabase
      .from("studies")
      .select("*")
      .eq("id", studyId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          toast.error("Failed to load study");
          console.error(error);
        }
        setStudy(data as ActiveStudy | null);
        setLoading(false);
      });
  }, [studyId]);

  const saveBoundary = useCallback(
    async (polygon: GeoJSON.Polygon) => {
      if (!study) return;
      const { error } = await supabase
        .from("studies")
        .update({ boundary_geojson: polygon as unknown as Json })
        .eq("id", study.id);
      if (error) {
        toast.error("Failed to save boundary");
        return;
      }
      setStudy((s) => s ? { ...s, boundary_geojson: polygon as unknown as Json } : s);
      toast.success("Boundary saved to study");
    },
    [study]
  );

  const saveRoute = useCallback(
    async (routeGeoJson: GeoJSON.LineString, dno?: string, voltageLevel?: string) => {
      if (!study) return;
      const updates: Record<string, unknown> = {
        route_geojson: routeGeoJson as unknown as Json,
      };
      if (dno) updates.dno = dno;
      if (voltageLevel) updates.voltage_level = voltageLevel;

      const { error } = await supabase
        .from("studies")
        .update(updates)
        .eq("id", study.id);
      if (error) {
        toast.error("Failed to save route");
        return;
      }
      setStudy((s) =>
        s
          ? {
              ...s,
              route_geojson: routeGeoJson as unknown as Json,
              ...(dno ? { dno } : {}),
              ...(voltageLevel ? { voltage_level: voltageLevel } : {}),
            }
          : s
      );
      toast.success("Route saved to study");

      // Auto-run rules engine
      runRulesEngine(routeGeoJson, dno || study.dno || "UK_ALL", voltageLevel || study.voltage_level || "LV");

      // Auto-compute and save cost estimate if proposed_kw is set
      const kw = study.proposed_kw;
      if (kw && kw > 0) {
        const routeLen = computeRouteLength(routeGeoJson);
        const distances = { primary_m: routeLen, feeder_m: routeLen, capacity_segment_m: routeLen };
        const vOverride = (voltageLevel || study.voltage_level || "Auto") as VoltageOverride;
        const costEst = estimateConnectionCost({ proposed_kw: kw, distances, voltage_override: vOverride }, unitRates);
        const bomItems = generateBom({ proposed_kw: kw, distances, voltage_override: vOverride }, unitRates);
        await supabase
          .from("studies")
          .update({
            cost_estimate_json: costEst as unknown as Json,
            bom_json: bomItems as unknown as Json,
          })
          .eq("id", study.id);
        setStudy((s) =>
          s ? { ...s, cost_estimate_json: costEst as unknown as Json, bom_json: bomItems as unknown as Json } : s
        );
        toast.success("Cost estimate saved to study");
      }
    },
    [study, unitRates]
  );

  const runRulesEngine = useCallback(
    async (route: GeoJSON.LineString, dnoCode: string, voltageLevel: string) => {
      if (!study) return;

      // Calculate route length
      let routeLengthM = 0;
      const coords = route.coordinates;
      for (let i = 1; i < coords.length; i++) {
        routeLengthM += haversineM(
          coords[i - 1] as [number, number],
          coords[i] as [number, number]
        );
      }

      try {
        const res = await supabase.functions.invoke("apply-dno-rules", {
          body: {
            dno_code: dnoCode,
            voltage_level: voltageLevel,
            route_length_m: Math.round(routeLengthM),
            cable_count: 1,
          },
        });
        if (res.error) throw res.error;

        const engineOutput = res.data;
        await supabase
          .from("studies")
          .update({
            engine_output_json: engineOutput as unknown as Json,
            ruleset_version: engineOutput.ruleset_version,
          })
          .eq("id", study.id);

        setStudy((s) =>
          s
            ? {
                ...s,
                engine_output_json: engineOutput as unknown as Json,
                ruleset_version: engineOutput.ruleset_version,
              }
            : s
        );
        toast.success("DNO rules applied automatically");
      } catch (err: any) {
        console.error("Rules engine error:", err);
        toast.error("Failed to apply DNO rules");
      }
    },
    [study]
  );

  const saveResults = useCallback(
    async (data: {
      engine_input_json?: Json;
      engine_output_json?: Json;
      cost_estimate_json?: Json;
      bom_json?: Json;
      status?: string;
      dno?: string;
      voltage_level?: string;
      proposed_kw?: number;
    }) => {
      if (!study) return;
      const { error } = await supabase
        .from("studies")
        .update(data)
        .eq("id", study.id);
      if (error) {
        toast.error("Failed to save results");
        return;
      }
      setStudy((s) => (s ? { ...s, ...data } : s));
    },
    [study]
  );

  return { study, studyId, loading, saveBoundary, saveRoute, saveResults };
}

function computeRouteLength(route: GeoJSON.LineString): number {
  let total = 0;
  const coords = route.coordinates;
  for (let i = 1; i < coords.length; i++) {
    total += haversineM(coords[i - 1] as [number, number], coords[i] as [number, number]);
  }
  return Math.round(total);
}

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
