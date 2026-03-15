/**
 * Connect → Design Conversion
 * 
 * Transforms a completed GridwiseProject into Design Mode elements
 * (cables + equipment), persisting them to the design_cables and
 * design_elements tables for a given study.
 */
import { supabase } from "@/integrations/supabase/client";
import type { GridwiseProject } from "@/lib/gridwise/types";
import type { CableType, EquipmentType } from "@/hooks/useDesignMode";

export interface ConversionResult {
  cablesCreated: number;
  elementsCreated: number;
  warnings: string[];
}

/**
 * Determine the appropriate cable type from feasibility state.
 */
function inferCableType(project: GridwiseProject): CableType {
  const state = project.feasibility.feasibility_state;
  if (state === "HV_CONNECTION_REQUIRED") return "hv_cable";
  return "lv_main";
}

/**
 * Extract route coordinates from the project's route GeoJSON.
 */
function extractRouteCoordinates(project: GridwiseProject): [number, number][] | null {
  const route = project.site.route_geojson;
  if (!route || route.type !== "LineString" || !route.coordinates?.length) return null;
  return route.coordinates.map(c => [c[0], c[1]] as [number, number]);
}

/**
 * Calculate haversine distance for a coordinate array.
 */
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

/**
 * Determine which equipment to place based on engine outputs.
 */
function inferEquipment(project: GridwiseProject): {
  type: EquipmentType;
  label: string;
  lat: number;
  lng: number;
  properties: Record<string, unknown>;
}[] {
  const equipment: {
    type: EquipmentType;
    label: string;
    lat: number;
    lng: number;
    properties: Record<string, unknown>;
  }[] = [];

  const siteLat = project.site.lat;
  const siteLng = project.site.lng;
  const routeCoords = extractRouteCoordinates(project);

  // POC end of route (or site location)
  const pocLat = routeCoords ? routeCoords[routeCoords.length - 1][1] : siteLat;
  const pocLng = routeCoords ? routeCoords[routeCoords.length - 1][0] : siteLng;

  // Start of route (supply/charger end)
  const supplyLat = routeCoords ? routeCoords[0][1] : siteLat;
  const supplyLng = routeCoords ? routeCoords[0][0] : siteLng;

  // Always place a cutout at the supply point
  equipment.push({
    type: "cutout",
    label: "Cutout (Supply Point)",
    lat: supplyLat,
    lng: supplyLng,
    properties: {
      source: "gridwise_connect",
      run_id: project.run_id,
    },
  });

  // Always place a feeder pillar at POC end
  equipment.push({
    type: "feeder_pillar",
    label: "Feeder Pillar (POC)",
    lat: pocLat,
    lng: pocLng,
    properties: {
      source: "gridwise_connect",
      run_id: project.run_id,
    },
  });

  // Place EV chargers at site location
  if (project.site.charger_count > 0) {
    equipment.push({
      type: "ev_charger",
      label: `EV Charger Array (${project.site.charger_count}× ${project.site.charger_kw_each}kW)`,
      lat: siteLat,
      lng: siteLng,
      properties: {
        source: "gridwise_connect",
        run_id: project.run_id,
        charger_count: project.site.charger_count,
        charger_kw_each: project.site.charger_kw_each,
      },
    });
  }

  // Place transformer if reinforcement or HV required
  const state = project.feasibility.feasibility_state;
  if (
    state === "LV_REINFORCEMENT_REQUIRED" ||
    state === "HV_CONNECTION_REQUIRED"
  ) {
    // Place transformer near the POC, slightly offset
    const offsetLat = pocLat + 0.00005;
    const offsetLng = pocLng + 0.00005;
    equipment.push({
      type: "transformer",
      label: "Transformer (Reinforcement)",
      lat: offsetLat,
      lng: offsetLng,
      properties: {
        source: "gridwise_connect",
        run_id: project.run_id,
        reinforcement_state: state,
      },
    });
  }

  // Place RMU for HV connections
  if (state === "HV_CONNECTION_REQUIRED") {
    const offsetLat = pocLat - 0.00005;
    const offsetLng = pocLng + 0.00005;
    equipment.push({
      type: "rmu",
      label: "Ring Main Unit",
      lat: offsetLat,
      lng: offsetLng,
      properties: {
        source: "gridwise_connect",
        run_id: project.run_id,
      },
    });
  }

  // Place joints based on route length (every ~200m)
  if (routeCoords && routeCoords.length >= 2) {
    const totalLength = haversineDistance(routeCoords);
    const jointSpacing = 200; // metres
    const numJoints = Math.floor(totalLength / jointSpacing);
    
    if (numJoints > 0) {
      // Place joints at evenly spaced intervals along the route
      for (let j = 1; j <= numJoints && j <= 5; j++) {
        const fraction = j / (numJoints + 1);
        const idx = Math.floor(fraction * (routeCoords.length - 1));
        const coord = routeCoords[Math.min(idx, routeCoords.length - 1)];
        equipment.push({
          type: "joint",
          label: `Joint ${j}`,
          lat: coord[1],
          lng: coord[0],
          properties: {
            source: "gridwise_connect",
            run_id: project.run_id,
          },
        });
      }
    }
  }

  return equipment;
}

/**
 * Convert a completed GridwiseProject into Design Mode elements.
 * 
 * Creates design_cables and design_elements records for the given study.
 * Returns the number of items created and any warnings.
 */
export async function convertConnectToDesign(
  project: GridwiseProject,
  studyId: string,
  userId: string,
): Promise<ConversionResult> {
  const warnings: string[] = [];
  let cablesCreated = 0;
  let elementsCreated = 0;

  // ── 1. Convert route to design cable ──
  const routeCoords = extractRouteCoordinates(project);
  if (routeCoords && routeCoords.length >= 2) {
    const cableType = inferCableType(project);
    const length_m = Math.round(haversineDistance(routeCoords) * 10) / 10;

    const { error } = await supabase.from("design_cables").insert({
      study_id: studyId,
      cable_type: cableType,
      label: `${cableType === "hv_cable" ? "HV Cable" : "LV Main"} (from Connect)`,
      coordinates: routeCoords as any,
      length_m,
      created_by: userId,
      properties_json: {
        source: "gridwise_connect",
        run_id: project.run_id,
        feasibility_state: project.feasibility.feasibility_state,
        viability_index: project.feasibility.viability_index,
      },
    } as any);

    if (error) {
      warnings.push(`Failed to create cable: ${error.message}`);
    } else {
      cablesCreated++;
    }

    // If HV required, also create a pilot cable along the same route
    if (cableType === "hv_cable") {
      const { error: pilotError } = await supabase.from("design_cables").insert({
        study_id: studyId,
        cable_type: "pilot_cable" as CableType,
        label: "Pilot Cable (from Connect)",
        coordinates: routeCoords as any,
        length_m,
        created_by: userId,
        properties_json: {
          source: "gridwise_connect",
          run_id: project.run_id,
        },
      } as any);

      if (pilotError) {
        warnings.push(`Failed to create pilot cable: ${pilotError.message}`);
      } else {
        cablesCreated++;
      }
    }
  } else {
    warnings.push("No route geometry found — cable not created. Draw a route first for full conversion.");
  }

  // ── 2. Place equipment ──
  const equipmentList = inferEquipment(project);

  for (const eq of equipmentList) {
    const { error } = await supabase.from("design_elements").insert({
      study_id: studyId,
      element_type: eq.type,
      label: eq.label,
      lat: eq.lat,
      lng: eq.lng,
      created_by: userId,
      properties_json: eq.properties,
    } as any);

    if (error) {
      warnings.push(`Failed to place ${eq.label}: ${error.message}`);
    } else {
      elementsCreated++;
    }
  }

  return { cablesCreated, elementsCreated, warnings };
}
