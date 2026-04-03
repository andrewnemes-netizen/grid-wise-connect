import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import { decompress } from "https://deno.land/x/zip@v1.2.5/decompress.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Auth ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await userClient.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Admin role required" }, 403);

    // ── Parse multipart form ──
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const layerId = formData.get("layer_id") as string;
    const dno = formData.get("dno") as string;

    if (!file || !layerId || !dno) {
      return json({ error: "file, layer_id, and dno are required" }, 400);
    }

    console.log(`[gpkg] Received file: ${file.name} (${file.size} bytes), layer_id=${layerId}, dno=${dno}`);

    // ── Look up layer ──
    const { data: layerRow, error: layerErr } = await supabase
      .from("layer_registry")
      .select("storage_table, geometry_type")
      .eq("id", layerId)
      .single();
    if (layerErr || !layerRow) return json({ error: "Layer not found in registry" }, 404);

    const storageTable = layerRow.storage_table;

    // ── Extract .gpkg from ZIP or use directly ──
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    let gpkgBytes: Uint8Array;

    const isZip = file.name.toLowerCase().endsWith(".zip") ||
      (fileBytes[0] === 0x50 && fileBytes[1] === 0x4B);

    if (isZip) {
      console.log("[gpkg] Detected ZIP archive, extracting…");
      const tmpZip = "/tmp/_upload.zip";
      const tmpDir = "/tmp/_gpkg_extract";
      await Deno.writeFile(tmpZip, fileBytes);

      try { await Deno.remove(tmpDir, { recursive: true }); } catch { /* ok */ }
      await decompress(tmpZip, tmpDir);

      // Find first .gpkg file recursively
      let gpkgPath: string | null = null;
      for await (const entry of walkDir(tmpDir)) {
        if (entry.toLowerCase().endsWith(".gpkg")) {
          gpkgPath = entry;
          break;
        }
      }
      if (!gpkgPath) return json({ error: "No .gpkg file found in ZIP archive" }, 400);
      console.log(`[gpkg] Found: ${gpkgPath}`);
      gpkgBytes = await Deno.readFile(gpkgPath);

      // Cleanup
      try { await Deno.remove(tmpDir, { recursive: true }); } catch { /* ok */ }
      try { await Deno.remove(tmpZip); } catch { /* ok */ }
    } else {
      gpkgBytes = fileBytes;
    }

    // ── Open SQLite / GeoPackage ──
    const tmpGpkg = "/tmp/_current.gpkg";
    await Deno.writeFile(tmpGpkg, gpkgBytes);
    const db = new DB(tmpGpkg);

    // Find the feature table name from gpkg_contents
    const contentsRows = db.query<[string, string]>(
      "SELECT table_name, data_type FROM gpkg_contents WHERE data_type IN ('features', 'tiles') LIMIT 10"
    );
    const featureTable = contentsRows.find(r => r[1] === "features")?.[0];
    if (!featureTable) {
      db.close();
      return json({ error: "No feature table found in GeoPackage" }, 400);
    }
    console.log(`[gpkg] Feature table: ${featureTable}`);

    // Get the geometry column name
    const geomColRows = db.query<[string]>(
      "SELECT column_name FROM gpkg_geometry_columns WHERE table_name = ?",
      [featureTable]
    );
    const geomCol = geomColRows[0]?.[0] || "geom";

    // Get SRS
    const srsRows = db.query<[number]>(
      "SELECT srs_id FROM gpkg_geometry_columns WHERE table_name = ?",
      [featureTable]
    );
    const srsId = srsRows[0]?.[0] ?? 4326;
    const isBNG = srsId === 27700;
    console.log(`[gpkg] SRS ID: ${srsId}, isBNG: ${isBNG}, geomCol: ${geomCol}`);

    // Get all column names (excluding the geometry column)
    const colInfoRows = db.query<[number, string, string]>(
      `PRAGMA table_info(${featureTable})`
    );
    const propColumns = colInfoRows
      .map(r => r[1])
      .filter(name => name !== geomCol && name.toLowerCase() !== "fid" && name.toLowerCase() !== "id");

    // ── Read features ──
    const selectCols = propColumns.map(c => `"${c}"`).join(", ");
    const query = `SELECT "${geomCol}", ${selectCols} FROM "${featureTable}"`;
    const allRows = db.query(query);
    console.log(`[gpkg] Total rows: ${allRows.length}`);

    const BATCH_SIZE = 500;
    let totalInserted = 0;
    let skipped = 0;

    for (let b = 0; b < allRows.length; b += BATCH_SIZE) {
      const batch = allRows.slice(b, b + BATCH_SIZE);
      const mappedFeatures: any[] = [];

      for (const row of batch) {
        const gpbBlob = row[0] as Uint8Array | null;
        if (!gpbBlob || gpbBlob.length < 8) { skipped++; continue; }

        let geojsonGeom: any;
        try {
          geojsonGeom = gpbToGeoJSON(gpbBlob, isBNG);
        } catch (e) {
          console.warn(`[gpkg] Failed to parse geometry: ${e}`);
          skipped++;
          continue;
        }

        if (!geojsonGeom) { skipped++; continue; }

        // Auto-promote to Multi for tables that expect it
        if (geojsonGeom.type === "LineString" && storageTable.includes("feeder")) {
          geojsonGeom = { type: "MultiLineString", coordinates: [geojsonGeom.coordinates] };
        }
        if (geojsonGeom.type === "Polygon" && storageTable.includes("polygon")) {
          geojsonGeom = { type: "MultiPolygon", coordinates: [geojsonGeom.coordinates] };
        }

        // Build properties
        const props: Record<string, any> = {};
        propColumns.forEach((col, idx) => {
          props[col] = row[idx + 1] ?? null;
        });

        mappedFeatures.push({
          geom_geojson: JSON.stringify(geojsonGeom),
          layer_id: layerId,
          dno,
          name: props.name || props.Name || props.PIPE_NAME || props.pipe_name || null,
          asset_id: props.asset_id || props.ASSET_ID || props.pipe_id || props.PIPE_ID || props.ogc_fid || null,
          attrs_json: props,
          status: props.status || "unknown",
          voltage_kv: null,
          feeder_ref: null,
          capacity_value: null,
          capacity_unit: null,
          capacity_flag: "unknown",
        });
      }

      if (mappedFeatures.length === 0) continue;

      const { data: inserted, error: rpcErr } = await supabase.rpc("batch_insert_geo_features", {
        _table_name: storageTable,
        _features_json: JSON.stringify(mappedFeatures),
      });

      if (rpcErr) {
        console.error(`[gpkg] RPC error at batch ${b}:`, rpcErr);
        db.close();
        return json({ error: rpcErr.message, inserted_so_far: totalInserted }, 500);
      }
      totalInserted += inserted ?? mappedFeatures.length;
      console.log(`[gpkg] Batch ${b}-${b + batch.length}: inserted ${inserted}`);
    }

    db.close();
    try { await Deno.remove(tmpGpkg); } catch { /* ok */ }

    // Update feature count
    const { count } = await supabase
      .from(storageTable)
      .select("*", { count: "exact", head: true })
      .eq("layer_id", layerId);

    await supabase
      .from("layer_registry")
      .update({ feature_count: count ?? 0, updated_at: new Date().toISOString() })
      .eq("id", layerId);

    console.log(`[gpkg] Done. Inserted: ${totalInserted}, skipped: ${skipped}`);
    return json({ inserted: totalInserted, skipped, total_in_layer: count });
  } catch (err) {
    console.error("[gpkg] Fatal error:", err);
    return json({ error: String(err) }, 500);
  }
});

// ── Helpers ──

async function* walkDir(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      yield* walkDir(path);
    } else {
      yield path;
    }
  }
}

/**
 * Parse GeoPackage Binary (GPB) to GeoJSON geometry.
 * GPB format:
 *   bytes 0-1: "GP" magic
 *   byte 2: version
 *   byte 3: flags (bits 1-3 = envelope type, bit 0 = byte order)
 *   bytes 4-7: SRS ID (int32)
 *   then envelope (variable size based on flags)
 *   then standard WKB
 */
function gpbToGeoJSON(gpb: Uint8Array, isBNG: boolean): any {
  if (gpb[0] !== 0x47 || gpb[1] !== 0x50) {
    // Not GPB — try parsing as raw WKB
    return wkbToGeoJSON(gpb, 0, isBNG).geom;
  }

  const flags = gpb[3];
  const byteOrder = flags & 0x01; // 0 = big-endian, 1 = little-endian
  const envelopeType = (flags >> 1) & 0x07;

  // Envelope sizes: 0=none, 1=32bytes(minx,maxx,miny,maxy), 2=48bytes(+minz,maxz), 3=48bytes(+minm,maxm), 4=64bytes(+minz,maxz,minm,maxm)
  const envelopeSizes: Record<number, number> = { 0: 0, 1: 32, 2: 48, 3: 48, 4: 64 };
  const envSize = envelopeSizes[envelopeType] ?? 0;

  const wkbOffset = 8 + envSize;
  if (wkbOffset >= gpb.length) return null;

  return wkbToGeoJSON(gpb, wkbOffset, isBNG).geom;
}

function wkbToGeoJSON(buf: Uint8Array, offset: number, isBNG: boolean): { geom: any; end: number } {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const le = buf[offset] === 1;
  offset += 1;

  const rawType = le ? view.getUint32(offset, true) : view.getUint32(offset, false);
  offset += 4;

  // Extract base type (lower byte) and check for Z/M flags
  const baseType = rawType % 1000;
  const hasZ = rawType >= 1000 && rawType < 2000 || rawType >= 3000;

  const coordSize = hasZ ? 3 : 2;

  function readCoord(): number[] {
    const x = le ? view.getFloat64(offset, true) : view.getFloat64(offset, false);
    offset += 8;
    const y = le ? view.getFloat64(offset, true) : view.getFloat64(offset, false);
    offset += 8;
    if (hasZ) offset += 8; // skip Z

    if (isBNG) {
      const { lat, lng } = bngToWgs84(x, y);
      return [lng, lat];
    }
    return [x, y];
  }

  function readRing(): number[][] {
    const count = le ? view.getUint32(offset, true) : view.getUint32(offset, false);
    offset += 4;
    const coords: number[][] = [];
    for (let i = 0; i < count; i++) coords.push(readCoord());
    return coords;
  }

  switch (baseType) {
    case 1: { // Point
      const coord = readCoord();
      return { geom: { type: "Point", coordinates: coord }, end: offset };
    }
    case 2: { // LineString
      const ring = readRing();
      return { geom: { type: "LineString", coordinates: ring }, end: offset };
    }
    case 3: { // Polygon
      const numRings = le ? view.getUint32(offset, true) : view.getUint32(offset, false);
      offset += 4;
      const rings: number[][][] = [];
      for (let i = 0; i < numRings; i++) rings.push(readRing());
      return { geom: { type: "Polygon", coordinates: rings }, end: offset };
    }
    case 4: { // MultiPoint
      const numGeoms = le ? view.getUint32(offset, true) : view.getUint32(offset, false);
      offset += 4;
      const coords: number[][] = [];
      for (let i = 0; i < numGeoms; i++) {
        const r = wkbToGeoJSON(buf, offset, isBNG);
        coords.push(r.geom.coordinates);
        offset = r.end;
      }
      return { geom: { type: "MultiPoint", coordinates: coords }, end: offset };
    }
    case 5: { // MultiLineString
      const numGeoms = le ? view.getUint32(offset, true) : view.getUint32(offset, false);
      offset += 4;
      const lines: number[][][] = [];
      for (let i = 0; i < numGeoms; i++) {
        const r = wkbToGeoJSON(buf, offset, isBNG);
        lines.push(r.geom.coordinates);
        offset = r.end;
      }
      return { geom: { type: "MultiLineString", coordinates: lines }, end: offset };
    }
    case 6: { // MultiPolygon
      const numGeoms = le ? view.getUint32(offset, true) : view.getUint32(offset, false);
      offset += 4;
      const polys: number[][][][] = [];
      for (let i = 0; i < numGeoms; i++) {
        const r = wkbToGeoJSON(buf, offset, isBNG);
        polys.push(r.geom.coordinates);
        offset = r.end;
      }
      return { geom: { type: "MultiPolygon", coordinates: polys }, end: offset };
    }
    default:
      throw new Error(`Unsupported WKB type: ${rawType}`);
  }
}

/**
 * BNG (OSGB36) to WGS84 conversion using full Helmert 7-parameter transformation.
 */
function bngToWgs84(easting: number, northing: number): { lat: number; lng: number } {
  const a = 6377563.396;
  const b = 6356256.909;
  const e2 = 1 - (b * b) / (a * a);
  const N0 = -100000, E0 = 400000, F0 = 0.9996012717;
  const phi0 = (49 * Math.PI) / 180;
  const lambda0 = (-2 * Math.PI) / 180;

  const n = (a - b) / (a + b);
  const n2 = n * n, n3 = n * n * n;

  let phi = ((northing - N0) / (a * F0)) + phi0;
  for (let i = 0; i < 10; i++) {
    const M = b * F0 *
      ((1 + n + (5/4)*n2 + (5/4)*n3) * (phi - phi0) -
       (3*n + 3*n2 + (21/8)*n3) * Math.sin(phi - phi0) * Math.cos(phi + phi0) +
       ((15/8)*n2 + (15/8)*n3) * Math.sin(2*(phi - phi0)) * Math.cos(2*(phi + phi0)) -
       (35/24)*n3 * Math.sin(3*(phi - phi0)) * Math.cos(3*(phi + phi0)));
    phi = ((northing - N0 - M) / (a * F0)) + phi;
    if (Math.abs(northing - N0 - M) < 0.001) break;
  }

  const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi), tanPhi = Math.tan(phi);
  const nu = a * F0 / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sinPhi * sinPhi, 1.5);
  const eta2 = nu / rho - 1;
  const dE = easting - E0;

  const VII = tanPhi / (2 * rho * nu);
  const VIII = tanPhi / (24 * rho * nu**3) * (5 + 3*tanPhi**2 + eta2 - 9*tanPhi**2*eta2);
  const IX = tanPhi / (720 * rho * nu**5) * (61 + 90*tanPhi**2 + 45*tanPhi**4);
  const X = 1 / (cosPhi * nu);
  const XI = 1 / (6 * cosPhi * nu**3) * (nu/rho + 2*tanPhi**2);
  const XII = 1 / (120 * cosPhi * nu**5) * (5 + 28*tanPhi**2 + 24*tanPhi**4);

  const osgbLat = phi - VII*dE**2 + VIII*dE**4 - IX*dE**6;
  const osgbLng = lambda0 + X*dE - XI*dE**3 + XII*dE**5;

  const sinLat = Math.sin(osgbLat), cosLat = Math.cos(osgbLat);
  const sinLng = Math.sin(osgbLng), cosLng = Math.cos(osgbLng);
  const nuCart = a / Math.sqrt(1 - e2 * sinLat * sinLat);

  const x1 = nuCart * cosLat * cosLng;
  const y1 = nuCart * cosLat * sinLng;
  const z1 = nuCart * (1 - e2) * sinLat;

  const tx = 446.448, ty = -125.157, tz = 542.060;
  const s = -20.4894e-6;
  const rx = (0.1502/3600)*(Math.PI/180);
  const ry = (0.2470/3600)*(Math.PI/180);
  const rz = (0.8421/3600)*(Math.PI/180);

  const x2 = tx + (1+s)*x1 + (-rz)*y1 + ry*z1;
  const y2 = ty + rz*x1 + (1+s)*y1 + (-rx)*z1;
  const z2 = tz + (-ry)*x1 + rx*y1 + (1+s)*z1;

  const aWgs = 6378137.0, bWgs = 6356752.3142;
  const e2Wgs = 1 - (bWgs*bWgs)/(aWgs*aWgs);
  const p = Math.sqrt(x2*x2 + y2*y2);
  let lat = Math.atan2(z2, p*(1-e2Wgs));
  for (let i = 0; i < 10; i++) {
    const nuWgs = aWgs / Math.sqrt(1 - e2Wgs*Math.sin(lat)*Math.sin(lat));
    lat = Math.atan2(z2 + e2Wgs*nuWgs*Math.sin(lat), p);
  }
  const lng = Math.atan2(y2, x2);
  return { lat: lat*(180/Math.PI), lng: lng*(180/Math.PI) };
}
