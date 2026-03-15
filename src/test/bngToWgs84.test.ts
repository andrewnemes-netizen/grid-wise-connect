import { describe, it, expect } from "vitest";
import { bngToWgs84 } from "@/lib/bngToWgs84";

describe("bngToWgs84", () => {
  it("converts London (Big Ben) BNG to approximately correct WGS84", () => {
    // Big Ben: E 530050, N 179645 → ~51.5007, -0.1246
    const { lat, lng } = bngToWgs84(530050, 179645);
    expect(lat).toBeCloseTo(51.5007, 1);
    expect(lng).toBeCloseTo(-0.1246, 1);
  });

  it("converts Edinburgh Castle BNG to approximately correct WGS84", () => {
    // Edinburgh Castle: E 325200, N 673500 → ~55.9486, -3.1999
    const { lat, lng } = bngToWgs84(325200, 673500);
    expect(lat).toBeCloseTo(55.9486, 1);
    expect(lng).toBeCloseTo(-3.1999, 1);
  });

  it("converts Land's End BNG to approximately correct WGS84", () => {
    // Land's End: E 134200, N 25000 → ~50.065, -5.713
    const { lat, lng } = bngToWgs84(134200, 25000);
    expect(lat).toBeCloseTo(50.065, 0);
    expect(lng).toBeCloseTo(-5.713, 0);
  });
});
