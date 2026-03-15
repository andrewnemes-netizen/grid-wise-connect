/**
 * BNG (OSGB36) to WGS84 conversion using full Helmert 7-parameter transformation.
 * Based on OS recommended parameters. Accurate to ~1m.
 */
export function bngToWgs84(easting: number, northing: number): { lat: number; lng: number } {
  // ── Step 1: BNG → OSGB36 lat/lng ──
  const a = 6377563.396;     // Airy 1830 semi-major
  const b = 6356256.909;     // Airy 1830 semi-minor
  const e2 = 1 - (b * b) / (a * a);
  const N0 = -100000;
  const E0 = 400000;
  const F0 = 0.9996012717;
  const phi0 = (49 * Math.PI) / 180;
  const lambda0 = (-2 * Math.PI) / 180;

  const n = (a - b) / (a + b);
  const n2 = n * n;
  const n3 = n * n * n;

  let phi = ((northing - N0) / (a * F0)) + phi0;

  for (let i = 0; i < 10; i++) {
    const M =
      b * F0 *
      ((1 + n + (5 / 4) * n2 + (5 / 4) * n3) * (phi - phi0) -
       (3 * n + 3 * n2 + (21 / 8) * n3) * Math.sin(phi - phi0) * Math.cos(phi + phi0) +
       ((15 / 8) * n2 + (15 / 8) * n3) * Math.sin(2 * (phi - phi0)) * Math.cos(2 * (phi + phi0)) -
       (35 / 24) * n3 * Math.sin(3 * (phi - phi0)) * Math.cos(3 * (phi + phi0)));

    phi = ((northing - N0 - M) / (a * F0)) + phi;

    if (Math.abs(northing - N0 - M) < 0.001) break;
  }

  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const tanPhi = Math.tan(phi);
  const nu = a * F0 / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
  const eta2 = nu / rho - 1;

  const dE = easting - E0;
  const VII = tanPhi / (2 * rho * nu);
  const VIII = tanPhi / (24 * rho * nu * nu * nu) * (5 + 3 * tanPhi * tanPhi + eta2 - 9 * tanPhi * tanPhi * eta2);
  const IX = tanPhi / (720 * rho * Math.pow(nu, 5)) * (61 + 90 * tanPhi * tanPhi + 45 * Math.pow(tanPhi, 4));
  const X = 1 / (cosPhi * nu);
  const XI = 1 / (6 * cosPhi * nu * nu * nu) * (nu / rho + 2 * tanPhi * tanPhi);
  const XII = 1 / (120 * cosPhi * Math.pow(nu, 5)) * (5 + 28 * tanPhi * tanPhi + 24 * Math.pow(tanPhi, 4));

  const osgbLat = phi - VII * dE * dE + VIII * Math.pow(dE, 4) - IX * Math.pow(dE, 6);
  const osgbLng = lambda0 + X * dE - XI * Math.pow(dE, 3) + XII * Math.pow(dE, 5);

  // ── Step 2: OSGB36 lat/lng → OSGB36 cartesian ──
  const sinLat = Math.sin(osgbLat);
  const cosLat = Math.cos(osgbLat);
  const sinLng = Math.sin(osgbLng);
  const cosLng = Math.cos(osgbLng);

  const nuCart = a / Math.sqrt(1 - e2 * sinLat * sinLat);

  const x1 = nuCart * cosLat * cosLng;
  const y1 = nuCart * cosLat * sinLng;
  const z1 = nuCart * (1 - e2) * sinLat;

  // ── Step 3: Helmert 7-parameter transform OSGB36 → WGS84 ──
  // OS recommended parameters
  const tx = 446.448;      // metres
  const ty = -125.157;
  const tz = 542.060;
  const s = -20.4894e-6;   // scale factor (ppm → unitless)
  const rx = (0.1502 / 3600) * (Math.PI / 180);  // seconds → radians
  const ry = (0.2470 / 3600) * (Math.PI / 180);
  const rz = (0.8421 / 3600) * (Math.PI / 180);

  const x2 = tx + (1 + s) * x1 + (-rz) * y1 + (ry) * z1;
  const y2 = ty + (rz) * x1 + (1 + s) * y1 + (-rx) * z1;
  const z2 = tz + (-ry) * x1 + (rx) * y1 + (1 + s) * z1;

  // ── Step 4: WGS84 cartesian → WGS84 lat/lng ──
  const aWgs = 6378137.0;
  const bWgs = 6356752.3142;
  const e2Wgs = 1 - (bWgs * bWgs) / (aWgs * aWgs);

  const p = Math.sqrt(x2 * x2 + y2 * y2);
  let lat = Math.atan2(z2, p * (1 - e2Wgs));

  for (let i = 0; i < 10; i++) {
    const nuWgs = aWgs / Math.sqrt(1 - e2Wgs * Math.sin(lat) * Math.sin(lat));
    lat = Math.atan2(z2 + e2Wgs * nuWgs * Math.sin(lat), p);
  }

  const lng = Math.atan2(y2, x2);

  return {
    lat: lat * (180 / Math.PI),
    lng: lng * (180 / Math.PI),
  };
}
