import type { EquipmentType } from "@/hooks/useDesignMode";

export interface TemplateAssetSpec {
  type: EquipmentType;
  /** Offset from the anchor point in metres (east, north). */
  east_m: number;
  north_m: number;
  label?: string;
}

export interface DesignTemplate {
  id: string;
  name: string;
  description: string;
  assets: TemplateAssetSpec[];
}

/**
 * Standard layouts users can drop in one click. Coordinates are offsets in
 * metres from a single anchor point (the click location). The caller converts
 * them into lng/lat with a small equirectangular approximation.
 */
export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    id: "fp_2_chargers",
    name: "Feeder Pillar + 2 Chargers",
    description: "1 feeder pillar with 2 EV chargers spaced 6m apart.",
    assets: [
      { type: "feeder_pillar", east_m: 0, north_m: 0, label: "Feeder Pillar" },
      { type: "ev_charger", east_m: 6, north_m: 0, label: "Charger 1" },
      { type: "ev_charger", east_m: 12, north_m: 0, label: "Charger 2" },
    ],
  },
  {
    id: "fp_4_chargers",
    name: "Feeder Pillar + 4 Chargers",
    description: "1 feeder pillar with 4 EV chargers in a row.",
    assets: [
      { type: "feeder_pillar", east_m: 0, north_m: 0, label: "Feeder Pillar" },
      { type: "ev_charger", east_m: 6, north_m: 0, label: "Charger 1" },
      { type: "ev_charger", east_m: 12, north_m: 0, label: "Charger 2" },
      { type: "ev_charger", east_m: 18, north_m: 0, label: "Charger 3" },
      { type: "ev_charger", east_m: 24, north_m: 0, label: "Charger 4" },
    ],
  },
  {
    id: "onstreet_4_socket",
    name: "4-Socket On-Street Layout",
    description: "On-street arrangement with 4 chargers and a feeder pillar.",
    assets: [
      { type: "feeder_pillar", east_m: 0, north_m: 0 },
      { type: "ev_charger", east_m: 8, north_m: 2 },
      { type: "ev_charger", east_m: 16, north_m: 2 },
      { type: "ev_charger", east_m: 24, north_m: 2 },
      { type: "ev_charger", east_m: 32, north_m: 2 },
    ],
  },
  {
    id: "onstreet_6_socket",
    name: "6-Socket On-Street Layout",
    description: "On-street arrangement with 6 chargers and a feeder pillar.",
    assets: [
      { type: "feeder_pillar", east_m: 0, north_m: 0 },
      { type: "ev_charger", east_m: 8, north_m: 2 },
      { type: "ev_charger", east_m: 16, north_m: 2 },
      { type: "ev_charger", east_m: 24, north_m: 2 },
      { type: "ev_charger", east_m: 32, north_m: 2 },
      { type: "ev_charger", east_m: 40, north_m: 2 },
      { type: "ev_charger", east_m: 48, north_m: 2 },
    ],
  },
  {
    id: "dc_micro_hub_47",
    name: "47kW DC Micro Hub",
    description: "Compact DC charging hub with 2 chargers.",
    assets: [
      { type: "transformer", east_m: 0, north_m: 0, label: "Hub Transformer" },
      { type: "feeder_pillar", east_m: 5, north_m: 0 },
      { type: "ev_charger", east_m: 10, north_m: 3 },
      { type: "ev_charger", east_m: 10, north_m: -3 },
    ],
  },
  {
    id: "building_supply_split",
    name: "Building Supply Split",
    description: "Split building supply: cutout, joint and pillar serving 2 chargers.",
    assets: [
      { type: "cutout", east_m: 0, north_m: 0, label: "Building Cutout" },
      { type: "joint", east_m: 4, north_m: 0 },
      { type: "feeder_pillar", east_m: 8, north_m: 0 },
      { type: "ev_charger", east_m: 14, north_m: 0 },
      { type: "ev_charger", east_m: 20, north_m: 0 },
    ],
  },
  {
    id: "new_dno_connection",
    name: "New DNO Connection",
    description: "RMU + transformer + pillar for a brand-new connection.",
    assets: [
      { type: "rmu", east_m: 0, north_m: 0, label: "Network RMU" },
      { type: "transformer", east_m: 6, north_m: 0, label: "Site Transformer" },
      { type: "feeder_pillar", east_m: 12, north_m: 0 },
    ],
  },
];

/**
 * Convert a template's metre offsets into lng/lat coordinates around an anchor.
 * Uses an equirectangular approximation — accurate to a few cm at street scale.
 */
export function templateToCoords(
  template: DesignTemplate,
  anchor: { lng: number; lat: number }
): Array<{ type: EquipmentType; lng: number; lat: number; label?: string }> {
  const M_PER_DEG_LAT = 111_320;
  const cosLat = Math.cos((anchor.lat * Math.PI) / 180);
  const M_PER_DEG_LNG = 111_320 * cosLat;
  return template.assets.map((a) => ({
    type: a.type,
    lng: anchor.lng + a.east_m / M_PER_DEG_LNG,
    lat: anchor.lat + a.north_m / M_PER_DEG_LAT,
    label: a.label,
  }));
}