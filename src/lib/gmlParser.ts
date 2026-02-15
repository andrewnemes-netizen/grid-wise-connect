/**
 * GML (Geography Markup Language) to GeoJSON converter.
 * Handles common GML patterns including OS MasterMap, Highways, and generic GML files.
 * Supports .gml and .gml.gz (gzip compressed) files.
 */

/** Decompress a gzip ArrayBuffer using the browser's DecompressionStream API */
export async function decompressGzip(buffer: ArrayBuffer): Promise<string> {
  // Try native DecompressionStream first (modern browsers)
  if ("DecompressionStream" in window) {
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    writer.write(new Uint8Array(buffer));
    writer.close();

    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(merged);
  }

  throw new Error("Browser does not support DecompressionStream. Please decompress the .gz file first and upload the .gml file directly.");
}

/** Parse a GML XML string into a GeoJSON FeatureCollection */
export function gmlToGeoJSON(gmlText: string): GeoJSON.FeatureCollection {
  const parser = new DOMParser();
  const doc = parser.parseFromString(gmlText, "text/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    throw new Error("Invalid GML/XML file: " + parseError.textContent?.slice(0, 200));
  }

  const features: GeoJSON.Feature[] = [];

  // Find all feature member elements (various GML conventions)
  const memberElements = findFeatureMembers(doc);

  for (const member of memberElements) {
    try {
      const feature = parseFeatureMember(member);
      if (feature) features.push(feature);
    } catch {
      // Skip unparseable features
    }
  }

  if (features.length === 0) {
    throw new Error("No features with valid geometries found in GML file");
  }

  return { type: "FeatureCollection", features };
}

function findFeatureMembers(doc: Document): Element[] {
  const results: Element[] = [];

  // Common GML wrapper element names
  const memberTags = ["featureMember", "featureMembers", "member"];

  for (const tag of memberTags) {
    // Try with and without namespace
    const els = doc.getElementsByTagNameNS("*", tag);
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      // featureMembers (plural) wraps multiple children
      if (tag === "featureMembers") {
        for (let j = 0; j < el.children.length; j++) {
          results.push(el.children[j]);
        }
      } else {
        // featureMember wraps a single feature child
        if (el.children.length > 0) {
          results.push(el.children[0]);
        }
      }
    }
  }

  // If nothing found, try to find elements that contain geometry directly
  if (results.length === 0) {
    const geoEls = doc.getElementsByTagNameNS("*", "Point");
    const lineEls = doc.getElementsByTagNameNS("*", "LineString");
    const polyEls = doc.getElementsByTagNameNS("*", "Polygon");
    const all = [...Array.from(geoEls), ...Array.from(lineEls), ...Array.from(polyEls)];
    for (const el of all) {
      if (el.parentElement && el.parentElement !== doc.documentElement) {
        results.push(el.parentElement);
      }
    }
  }

  return results;
}

function parseFeatureMember(el: Element): GeoJSON.Feature | null {
  const geometry = extractGeometry(el);
  if (!geometry) return null;

  const properties: Record<string, string | number | null> = {};

  // Extract all text-content child elements as properties (skip geometry containers)
  extractProperties(el, properties, new Set());

  return { type: "Feature", geometry, properties };
}

const GEOM_LOCAL_NAMES = new Set([
  "Point", "LineString", "LinearRing", "Polygon", "MultiPoint",
  "MultiLineString", "MultiPolygon", "MultiCurve", "MultiSurface",
  "Curve", "Surface", "posList", "pos", "coordinates", "exterior",
  "interior", "outerBoundaryIs", "innerBoundaryIs", "segments",
  "LineStringSegment", "Arc", "Circle", "CompositeCurve",
  "CompositeSurface", "PolygonPatch", "patches",
]);

function extractProperties(el: Element, props: Record<string, string | number | null>, visited: Set<Element>) {
  if (visited.has(el)) return;
  visited.add(el);

  for (let i = 0; i < el.children.length; i++) {
    const child = el.children[i];
    const localName = child.localName;

    // Skip geometry elements
    if (GEOM_LOCAL_NAMES.has(localName)) continue;

    // Check if this child contains geometry deeper
    if (containsGeometry(child)) {
      // Don't add as property, but recurse to find sibling props
      continue;
    }

    // Leaf element with text content
    if (child.children.length === 0) {
      const text = child.textContent?.trim() || null;
      if (text !== null) {
        const num = Number(text);
        props[localName] = !isNaN(num) && text !== "" ? num : text;
      }
    } else {
      // Recurse into non-geometry children
      extractProperties(child, props, visited);
    }
  }
}

function containsGeometry(el: Element): boolean {
  if (GEOM_LOCAL_NAMES.has(el.localName)) return true;
  for (let i = 0; i < el.children.length; i++) {
    if (containsGeometry(el.children[i])) return true;
  }
  return false;
}

function extractGeometry(el: Element): GeoJSON.Geometry | null {
  // Look for known geometry elements within the feature
  const geomTypes = ["MultiSurface", "MultiCurve", "Polygon", "LineString", "Point", "MultiPolygon", "MultiLineString", "MultiPoint", "Surface", "Curve"];

  for (const gType of geomTypes) {
    const geomEls = el.getElementsByTagNameNS("*", gType);
    if (geomEls.length > 0) {
      const parsed = parseGeomElement(geomEls[0]);
      if (parsed) return parsed;
    }
  }

  return null;
}

function parseGeomElement(el: Element): GeoJSON.Geometry | null {
  const localName = el.localName;

  switch (localName) {
    case "Point":
      return parsePoint(el);
    case "LineString":
      return parseLineString(el);
    case "Polygon":
      return parsePolygon(el);
    case "MultiPoint":
      return parseMultiPoint(el);
    case "MultiLineString":
    case "MultiCurve":
      return parseMultiLineString(el);
    case "MultiPolygon":
    case "MultiSurface":
      return parseMultiPolygon(el);
    case "Curve":
      return parseCurve(el);
    case "Surface":
      return parseSurface(el);
    default:
      return null;
  }
}

function parseCoordinates(el: Element): [number, number][] {
  // Try <gml:posList>
  const posListEls = el.getElementsByTagNameNS("*", "posList");
  if (posListEls.length > 0) {
    return parsePosList(posListEls[0]);
  }

  // Try <gml:pos>
  const posEls = el.getElementsByTagNameNS("*", "pos");
  if (posEls.length > 0) {
    const coords: [number, number][] = [];
    for (let i = 0; i < posEls.length; i++) {
      const c = parsePosElement(posEls[i]);
      if (c) coords.push(c);
    }
    return coords;
  }

  // Try <gml:coordinates> (GML2 style)
  const coordsEls = el.getElementsByTagNameNS("*", "coordinates");
  if (coordsEls.length > 0) {
    return parseCoordinatesElement(coordsEls[0]);
  }

  return [];
}

function parsePosList(el: Element): [number, number][] {
  const text = el.textContent?.trim();
  if (!text) return [];

  const srsDimension = parseInt(el.getAttribute("srsDimension") || el.closest("[srsDimension]")?.getAttribute("srsDimension") || "2");
  const nums = text.split(/\s+/).map(Number).filter((n) => !isNaN(n));
  const coords: [number, number][] = [];

  for (let i = 0; i + srsDimension - 1 < nums.length; i += srsDimension) {
    // GML typically uses lat,lng or easting,northing order
    // Check SRS to determine order - for EPSG:4326 it's lat,lng; for BNG it's easting,northing
    const srs = findSRS(el);
    if (srs && (srs.includes("27700") || srs.includes("BNG"))) {
      // British National Grid → needs reprojection, store as-is for now
      // For simplicity, we'll do a rough BNG→WGS84 conversion
      const [e, n] = [nums[i], nums[i + 1]];
      const [lng, lat] = bngToWgs84(e, n);
      coords.push([lng, lat]);
    } else if (srs && srs.includes("4326")) {
      // EPSG:4326 in GML is lat,lng
      coords.push([nums[i + 1], nums[i]]);
    } else {
      // Default: assume easting, northing (common for UK data)
      const v0 = nums[i], v1 = nums[i + 1];
      if (Math.abs(v0) > 180 || Math.abs(v1) > 180) {
        // Likely projected coordinates (BNG)
        const [lng, lat] = bngToWgs84(v0, v1);
        coords.push([lng, lat]);
      } else {
        // Assume lng, lat
        coords.push([v0, v1]);
      }
    }
  }

  return coords;
}

function parsePosElement(el: Element): [number, number] | null {
  const text = el.textContent?.trim();
  if (!text) return null;
  const nums = text.split(/\s+/).map(Number);
  if (nums.length < 2) return null;

  const srs = findSRS(el);
  if (srs && (srs.includes("27700") || srs.includes("BNG"))) {
    return bngToWgs84(nums[0], nums[1]) as [number, number];
  }
  if (Math.abs(nums[0]) > 180 || Math.abs(nums[1]) > 180) {
    return bngToWgs84(nums[0], nums[1]) as [number, number];
  }
  return [nums[0], nums[1]];
}

function parseCoordinatesElement(el: Element): [number, number][] {
  const text = el.textContent?.trim();
  if (!text) return [];

  const cs = el.getAttribute("cs") || ",";
  const ts = el.getAttribute("ts") || " ";

  return text.split(ts).map((tuple) => {
    const parts = tuple.split(cs).map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return null;
    if (Math.abs(parts[0]) > 180 || Math.abs(parts[1]) > 180) {
      return bngToWgs84(parts[0], parts[1]) as [number, number];
    }
    return [parts[0], parts[1]] as [number, number];
  }).filter(Boolean) as [number, number][];
}

function findSRS(el: Element): string | null {
  let current: Element | null = el;
  while (current) {
    const srs = current.getAttribute("srsName") || current.getAttribute("srs");
    if (srs) return srs;
    current = current.parentElement;
  }
  return null;
}

function parsePoint(el: Element): GeoJSON.Point | null {
  const coords = parseCoordinates(el);
  if (coords.length === 0) return null;
  return { type: "Point", coordinates: coords[0] };
}

function parseLineString(el: Element): GeoJSON.LineString | null {
  const coords = parseCoordinates(el);
  if (coords.length < 2) return null;
  return { type: "LineString", coordinates: coords };
}

function parsePolygon(el: Element): GeoJSON.Polygon | null {
  const rings: [number, number][][] = [];

  // Outer ring
  const outerEls = el.getElementsByTagNameNS("*", "exterior");
  const outerElsAlt = el.getElementsByTagNameNS("*", "outerBoundaryIs");
  const outerEl = outerEls[0] || outerElsAlt[0];

  if (outerEl) {
    const coords = parseCoordinates(outerEl);
    if (coords.length < 3) return null;
    rings.push(coords);
  } else {
    // Direct coordinates on polygon
    const coords = parseCoordinates(el);
    if (coords.length < 3) return null;
    rings.push(coords);
  }

  // Inner rings (holes)
  const innerEls = el.getElementsByTagNameNS("*", "interior");
  const innerElsAlt = el.getElementsByTagNameNS("*", "innerBoundaryIs");
  const allInner = [...Array.from(innerEls), ...Array.from(innerElsAlt)];
  for (const inner of allInner) {
    const coords = parseCoordinates(inner);
    if (coords.length >= 3) rings.push(coords);
  }

  return { type: "Polygon", coordinates: rings };
}

function parseMultiPoint(el: Element): GeoJSON.MultiPoint | null {
  const points = el.getElementsByTagNameNS("*", "Point");
  const coords: [number, number][] = [];
  for (let i = 0; i < points.length; i++) {
    const c = parseCoordinates(points[i]);
    if (c.length > 0) coords.push(c[0]);
  }
  if (coords.length === 0) return null;
  return { type: "MultiPoint", coordinates: coords };
}

function parseMultiLineString(el: Element): GeoJSON.MultiLineString | null {
  const lines: [number, number][][] = [];

  // Try LineString children
  const lineEls = el.getElementsByTagNameNS("*", "LineString");
  for (let i = 0; i < lineEls.length; i++) {
    const coords = parseCoordinates(lineEls[i]);
    if (coords.length >= 2) lines.push(coords);
  }

  // Try Curve > segments > LineStringSegment
  if (lines.length === 0) {
    const segEls = el.getElementsByTagNameNS("*", "LineStringSegment");
    for (let i = 0; i < segEls.length; i++) {
      const coords = parseCoordinates(segEls[i]);
      if (coords.length >= 2) lines.push(coords);
    }
  }

  // Try curveMember > Curve
  if (lines.length === 0) {
    const curveEls = el.getElementsByTagNameNS("*", "Curve");
    for (let i = 0; i < curveEls.length; i++) {
      const parsed = parseCurve(curveEls[i]);
      if (parsed && parsed.type === "LineString") {
        lines.push(parsed.coordinates as [number, number][]);
      }
    }
  }

  if (lines.length === 0) return null;
  return { type: "MultiLineString", coordinates: lines };
}

function parseMultiPolygon(el: Element): GeoJSON.MultiPolygon | null {
  const polygons: [number, number][][][] = [];

  // Try Polygon children
  const polyEls = el.getElementsByTagNameNS("*", "Polygon");
  for (let i = 0; i < polyEls.length; i++) {
    const parsed = parsePolygon(polyEls[i]);
    if (parsed) polygons.push(parsed.coordinates as [number, number][][]);
  }

  // Try PolygonPatch
  if (polygons.length === 0) {
    const patchEls = el.getElementsByTagNameNS("*", "PolygonPatch");
    for (let i = 0; i < patchEls.length; i++) {
      const parsed = parsePolygon(patchEls[i]); // same structure as Polygon
      if (parsed) polygons.push(parsed.coordinates as [number, number][][]);
    }
  }

  if (polygons.length === 0) return null;
  return { type: "MultiPolygon", coordinates: polygons };
}

function parseCurve(el: Element): GeoJSON.LineString | null {
  const allCoords: [number, number][] = [];
  const segEls = el.getElementsByTagNameNS("*", "LineStringSegment");
  for (let i = 0; i < segEls.length; i++) {
    const coords = parseCoordinates(segEls[i]);
    allCoords.push(...coords);
  }
  if (allCoords.length === 0) {
    // Try direct posList on Curve
    const coords = parseCoordinates(el);
    allCoords.push(...coords);
  }
  if (allCoords.length < 2) return null;
  return { type: "LineString", coordinates: allCoords };
}

function parseSurface(el: Element): GeoJSON.Polygon | null {
  const patchEls = el.getElementsByTagNameNS("*", "PolygonPatch");
  if (patchEls.length > 0) {
    return parsePolygon(patchEls[0]);
  }
  return parsePolygon(el);
}

/**
 * Approximate British National Grid (EPSG:27700) to WGS84 (EPSG:4326) conversion.
 * Uses a simplified Helmert transformation — accuracy ~5m, sufficient for visualization.
 */
function bngToWgs84(easting: number, northing: number): [number, number] {
  // OSGB36 ellipsoid (Airy 1830)
  const a = 6377563.396, b = 6356256.909;
  const F0 = 0.9996012717;
  const lat0 = (49 * Math.PI) / 180;
  const lng0 = (-2 * Math.PI) / 180;
  const N0 = -100000, E0 = 400000;
  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b);

  let lat = ((northing - N0) / (a * F0)) + lat0;

  // Iterate to find latitude
  for (let i = 0; i < 10; i++) {
    const M = meridionalArc(lat, lat0, a, b, n, F0);
    if (Math.abs(northing - N0 - M) < 0.00001) break;
    lat = ((northing - N0 - M) / (a * F0)) + lat;
  }

  const sinLat = Math.sin(lat), cosLat = Math.cos(lat), tanLat = Math.tan(lat);
  const nu = a * F0 / Math.sqrt(1 - e2 * sinLat * sinLat);
  const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinLat * sinLat, 1.5);
  const eta2 = nu / rho - 1;

  const dE = easting - E0;
  const VII = tanLat / (2 * rho * nu);
  const VIII = tanLat / (24 * rho * nu * nu * nu) * (5 + 3 * tanLat * tanLat + eta2 - 9 * tanLat * tanLat * eta2);
  const IX = tanLat / (720 * rho * Math.pow(nu, 5)) * (61 + 90 * tanLat * tanLat + 45 * Math.pow(tanLat, 4));
  const X = 1 / (cosLat * nu);
  const XI = 1 / (6 * cosLat * nu * nu * nu) * (nu / rho + 2 * tanLat * tanLat);
  const XII = 1 / (120 * cosLat * Math.pow(nu, 5)) * (5 + 28 * tanLat * tanLat + 24 * Math.pow(tanLat, 4));

  const osgbLat = lat - VII * dE * dE + VIII * Math.pow(dE, 4) - IX * Math.pow(dE, 6);
  const osgbLng = lng0 + X * dE - XI * Math.pow(dE, 3) + XII * Math.pow(dE, 5);

  // Helmert transform OSGB36 → WGS84
  const [x, y, z] = latLngToCartesian(osgbLat, osgbLng, 0, a, b);

  const tx = 446.448, ty = -125.157, tz = 542.060;
  const s = -20.4894e-6;
  const rx = (0.1502 / 3600) * Math.PI / 180;
  const ry = (0.2470 / 3600) * Math.PI / 180;
  const rz = (0.8421 / 3600) * Math.PI / 180;

  const x2 = tx + (1 + s) * x + (-rz) * y + (ry) * z;
  const y2 = ty + (rz) * x + (1 + s) * y + (-rx) * z;
  const z2 = tz + (-ry) * x + (rx) * y + (1 + s) * z;

  const wgsA = 6378137, wgsB = 6356752.3142;
  const [wgsLat, wgsLng] = cartesianToLatLng(x2, y2, z2, wgsA, wgsB);

  return [wgsLng * 180 / Math.PI, wgsLat * 180 / Math.PI];
}

function meridionalArc(lat: number, lat0: number, a: number, b: number, n: number, F0: number): number {
  const n2 = n * n, n3 = n * n * n;
  const dLat = lat - lat0, sLat = lat + lat0;
  return b * F0 * (
    (1 + n + (5 / 4) * n2 + (5 / 4) * n3) * dLat
    - (3 * n + 3 * n2 + (21 / 8) * n3) * Math.sin(dLat) * Math.cos(sLat)
    + ((15 / 8) * n2 + (15 / 8) * n3) * Math.sin(2 * dLat) * Math.cos(2 * sLat)
    - ((35 / 24) * n3) * Math.sin(3 * dLat) * Math.cos(3 * sLat)
  );
}

function latLngToCartesian(lat: number, lng: number, h: number, a: number, b: number): [number, number, number] {
  const e2 = 1 - (b * b) / (a * a);
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
  const nu = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  return [
    (nu + h) * cosLat * Math.cos(lng),
    (nu + h) * cosLat * Math.sin(lng),
    ((1 - e2) * nu + h) * sinLat,
  ];
}

function cartesianToLatLng(x: number, y: number, z: number, a: number, b: number): [number, number] {
  const e2 = 1 - (b * b) / (a * a);
  const lng = Math.atan2(y, x);
  const p = Math.sqrt(x * x + y * y);
  let lat = Math.atan2(z, p * (1 - e2));

  for (let i = 0; i < 10; i++) {
    const sinLat = Math.sin(lat);
    const nu = a / Math.sqrt(1 - e2 * sinLat * sinLat);
    lat = Math.atan2(z + e2 * nu * sinLat, p);
  }

  return [lat, lng];
}
