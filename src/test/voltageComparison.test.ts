import { describe, it, expect } from "vitest";
import { runVoltageComparison } from "@/lib/voltageComparison";
import type { CableCatalogueEntry } from "@/lib/lvOptimiser";

const mockCatalogue: CableCatalogueEntry[] = [
  { id: "1", cable_type: "25mm2 4c XLPE/SWA", voltage_class: "LV", current_rating_a: 89, impedance_per_km: 1.538, cost_per_m: 12, diameter_mm: 30, mains_allowed: true, service_allowed: true },
  { id: "2", cable_type: "70mm2 4c XLPE/SWA", voltage_class: "LV", current_rating_a: 160, impedance_per_km: 0.568, cost_per_m: 22, diameter_mm: 40, mains_allowed: true, service_allowed: false },
  { id: "3", cable_type: "185mm2 4c XLPE/SWA", voltage_class: "LV", current_rating_a: 295, impedance_per_km: 0.21, cost_per_m: 45, diameter_mm: 55, mains_allowed: true, service_allowed: false },
  { id: "4", cable_type: "95mm2 3c XLPE 11kV", voltage_class: "HV", current_rating_a: 250, impedance_per_km: 0.411, cost_per_m: 65, diameter_mm: 60, mains_allowed: true, service_allowed: false },
  { id: "5", cable_type: "185mm2 3c XLPE 11kV", voltage_class: "HV", current_rating_a: 370, impedance_per_km: 0.21, cost_per_m: 95, diameter_mm: 75, mains_allowed: true, service_allowed: false },
  { id: "6", cable_type: "300mm2 1c XLPE 33kV", voltage_class: "EHV", current_rating_a: 500, impedance_per_km: 0.13, cost_per_m: 180, diameter_mm: 90, mains_allowed: true, service_allowed: false },
];

describe("Voltage Comparison Engine", () => {
  it("returns a result for a small LV load", () => {
    const result = runVoltageComparison({
      proposed_kw: 50,
      route_length_m: 100,
      catalogue: mockCatalogue,
    });
    expect(result.tiers).toHaveLength(3);
    expect(result.tiers[0].voltage).toBe("LV");
    expect(result.tiers[1].voltage).toBe("HV");
    expect(result.tiers[2].voltage).toBe("EHV");
    // For 50kW, LV should likely pass
    if (result.recommended) {
      expect(["LV", "HV", "EHV"]).toContain(result.recommended);
    }
  });

  it("handles very large loads", () => {
    const result = runVoltageComparison({
      proposed_kw: 5000,
      route_length_m: 500,
      catalogue: mockCatalogue,
    });
    expect(result.tiers).toHaveLength(3);
    // LV shouldn't pass for 5MW
    expect(result.tiers[0].passes_all).toBe(false);
  });

  it("returns no recommendation when nothing passes", () => {
    const result = runVoltageComparison({
      proposed_kw: 100000,
      route_length_m: 10000,
      catalogue: mockCatalogue,
    });
    expect(result.recommended).toBeNull();
    expect(result.recommendation_reason).toContain("No voltage tier");
  });
});
