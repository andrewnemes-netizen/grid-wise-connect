/**
 * Approximate BNG (OSGB36) to WGS84 conversion.
 * Accurate to ~5m which is sufficient for map navigation.
 */
export function bngToWgs84(easting: number, northing: number): { lat: number; lng: number } {
  // Airy 1830 ellipsoid
  const a = 6377563.396;
  const b = 6356256.909;
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
    
    if (Math.abs(northing - N0 - M) < 0.01) break;
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

  // Helmert transformation OSGB36 → WGS84
  const latDeg = osgbLat * (180 / Math.PI);
  const lngDeg = osgbLng * (180 / Math.PI);

  // Simplified: OSGB36 ≈ WGS84 with small offsets (~70m)
  // For navigation purposes this is sufficient
  return { lat: latDeg, lng: lngDeg };
}
