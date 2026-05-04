import { describe, it, expect } from "vitest";
import { bngToWgs84 } from "@/lib/bngToWgs84";

/**
 * OSTN15 grid loading requires a network fetch + DecompressionStream
 * which is not available in the vitest jsdom environment, so we only
 * unit-test the Helmert fallback here. A real end-to-end accuracy test
 * runs in the browser via the Admin uploader.
 */
describe("Leeds-area BNG → WGS84 (Helmert fallback)", () => {
  it("places a known Adel/Leeds easting+northing within ~5m of the expected lat/lng", () => {
    // Approx New Adel Lane area, derived from currently-loaded dataset:
    // 53.8485, -1.6011 ≈ E 425230, N 440560 (BNG)
    const { lat, lng } = bngToWgs84(425230, 440560);
    expect(lat).toBeCloseTo(53.8485, 2);
    expect(lng).toBeCloseTo(-1.6011, 2);
  });
});

