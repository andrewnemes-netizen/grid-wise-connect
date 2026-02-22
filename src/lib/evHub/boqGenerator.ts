/**
 * Module H: Split BOQ Generator
 * Engineering outputs only quantities — no pricing.
 */
import type { SplitBoq, BoqItem, RouteQuantities, ElectricalSizingResult, EarthingResult, EvHubRules } from "./types";

export function generateSplitBoq(
  route: RouteQuantities,
  electrical: ElectricalSizingResult,
  earthing: EarthingResult,
  chargerCount: number,
  rules?: EvHubRules
): SplitBoq {
  const maxServiceLength = (rules?.max_service_length_m?.value as number) ?? 25;
  const needsMainExtension = route.total_length_m > maxServiceLength;
  const elec: BoqItem[] = [];
  const civils: BoqItem[] = [];
  const traffic: BoqItem[] = [];
  const fees: BoqItem[] = [];

  // ── Electrical items ──
  if (electrical.service_cable !== "PENDING") {
    elec.push({
      item_code: "E001",
      description: `Service cable (${electrical.service_cable})`,
      unit: "m",
      quantity: needsMainExtension ? maxServiceLength : route.total_length_m,
      category: "electrical",
    });
  }

  if (electrical.lv_main_cable !== "PENDING") {
    elec.push({
      item_code: "E002",
      description: `LV main cable (${electrical.lv_main_cable})`,
      unit: "m",
      quantity: route.total_length_m,
      category: "electrical",
    });
  }

  // LV main extension when route exceeds max service length
  if (needsMainExtension) {
    elec.push({
      item_code: "E007",
      description: "LV main cable extension",
      unit: "m",
      quantity: route.total_length_m - maxServiceLength,
      category: "electrical",
    });
    elec.push({
      item_code: "E008",
      description: "Service/main cable joint",
      unit: "ea",
      quantity: 1,
      category: "electrical",
    });
  }

  // Terminations (2 per cable run — source + destination)
  elec.push({
    item_code: "E003",
    description: "Cable termination",
    unit: "ea",
    quantity: 2,
    category: "electrical",
  });

  // Feeder pillar / cutout
  elec.push({
    item_code: "E004",
    description: "Feeder pillar",
    unit: "ea",
    quantity: 1,
    category: "electrical",
  });

  // Earthing
  if (earthing.review_required) {
    elec.push({
      item_code: "E005",
      description: "Earthing installation (type TBC post-review)",
      unit: "lot",
      quantity: 1,
      category: "electrical",
    });
  } else {
    elec.push({
      item_code: "E005",
      description: "Earth electrode & bonding",
      unit: "lot",
      quantity: 1,
      category: "electrical",
    });
  }

  // Metering
  elec.push({
    item_code: "E006",
    description: "CT metering",
    unit: "ea",
    quantity: 1,
    category: "electrical",
  });

  // Earthing allowance for non-standard review
  if (earthing.review_required && earthing.selected === "UNCONFIRMED") {
    elec.push({
      item_code: "E009",
      description: "Earthing allowance (non-standard, TBC)",
      unit: "lot",
      quantity: 1,
      category: "electrical",
    });
  }

  // ── Civils items ──
  for (const seg of route.segments) {
    civils.push({
      item_code: `C${seg.segment_id}`,
      description: `Excavation — ${seg.surface_type} (${seg.cover_depth_mm}mm depth)`,
      unit: "m",
      quantity: seg.length_m,
      category: "civils",
    });
  }

  // Duct
  civils.push({
    item_code: "C_DUCT",
    description: "HDPE duct",
    unit: "m",
    quantity: route.total_length_m,
    category: "civils",
  });

  // Cable marker tape
  civils.push({
    item_code: "C_TAPE",
    description: "Cable marker tape",
    unit: "m",
    quantity: route.total_length_m,
    category: "civils",
  });

  // Crossings
  for (const cr of route.crossings) {
    civils.push({
      item_code: `C_${cr.crossing_id}`,
      description: `${cr.crossing_type} crossing (${cr.method}) — ${cr.width_m}m`,
      unit: "ea",
      quantity: 1,
      category: "civils",
    });
  }

  // ── Traffic Management ──
  if (route.traffic_management_required) {
    const carriagewaySegments = route.segments.filter((s) => s.surface_type === "CARRIAGEWAY");
    const tmLength = carriagewaySegments.reduce((sum, s) => sum + s.length_m, 0);

    traffic.push({
      item_code: "TM001",
      description: "Traffic management setup",
      unit: "ea",
      quantity: 1,
      category: "traffic_mgmt",
    });

    if (tmLength > 0) {
      traffic.push({
        item_code: "TM002",
        description: "Traffic management — carriageway works",
        unit: "m",
        quantity: tmLength,
        category: "traffic_mgmt",
      });
    }
  }

  // ── Fees (placeholders — quantities only) ──
  fees.push({
    item_code: "F001",
    description: "Design fee",
    unit: "lot",
    quantity: 1,
    category: "fees",
  });

  fees.push({
    item_code: "F002",
    description: "Project management",
    unit: "lot",
    quantity: 1,
    category: "fees",
  });

  fees.push({
    item_code: "F003",
    description: "Contingency",
    unit: "lot",
    quantity: 1,
    category: "fees",
  });

  return {
    electrical: elec,
    civils,
    traffic_mgmt: traffic,
    fees,
  };
}
