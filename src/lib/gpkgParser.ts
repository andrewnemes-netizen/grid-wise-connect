/**
 * Client-side GeoPackage (.gpkg) parser using sql.js (WebAssembly SQLite).
 * Handles .gpkg files directly or .zip archives containing .gpkg files.
 * Parses GeoPackage Binary (GPB) geometry → GeoJSON with BNG reprojection.
 */
import initSqlJs, { type Database } from "sql.js";
import JSZip from "jszip";
import { bngToWgs84 } from "@/lib/gmlParser";

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function getSql() {
  if (!SQL) {
    SQL = await initSqlJs({
      locateFile: (file: string) =>
        `https://sql.js.org/dist/${file}`,
    });
  }
  return SQL;
}

/**
 * Parse a .gpkg or .zip file into a GeoJSON FeatureCollection.
 */
export async function parseGeoPackage(
  file: File,
  onProgress?: (msg: string) => void
): Promise<GeoJSON.FeatureCollection> {
  onProgress?.("Loading GeoPackage parser…");

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  let gpkgBytes: Uint8Array;

  // Extract .gpkg from ZIP if needed
  const isZip =
    file.name.toLowerCase().endsWith(".zip") ||
    (fileBytes[0] === 0x50 && fileBytes[1] === 0x4b);

  if (isZip) {
    onProgress?.("Extracting .gpkg from ZIP…");
    const zip = await JSZip.loadAsync(fileBytes);
    let gpkgEntry: JSZip.JSZipObject | null = null;

    zip.forEach((path, entry) => {
      if (!gpkgEntry && path.toLowerCase().endsWith(".gpkg") && !entry.dir) {
        gpkgEntry = entry;
      }
    });

    if (!gpkgEntry) throw new Error("No .gpkg file found in ZIP archive");
    gpkgBytes = new Uint8Array(await (gpkgEntry as JSZip.JSZipObject).async("uint8array"));
  } else {
    gpkgBytes = fileBytes;
  }

  onProgress?.("Opening GeoPackage database…");
  const SqlJs = await getSql();
  const db: Database = new SqlJs.Database(gpkgBytes);

  try {
    // Find the feature table
    const contentsRows = db.exec(
      "SELECT table_name, data_type FROM gpkg_contents WHERE data_type IN ('features','tiles') LIMIT 10"
    );
    if (!contentsRows.length || !contentsRows[0].values.length) {
      throw new Error("No feature table found in GeoPackage");
    }

    const featureTable = contentsRows[0].values.find(
      (r) => r[1] === "features"
    )?.[0] as string;
    if (!featureTable) throw new Error("No feature table found in GeoPackage");

    // Get geometry column name + SRS
    const geomColRows = db.exec(
      `SELECT column_name, srs_id FROM gpkg_geometry_columns WHERE table_name = '${featureTable}'`
    );
    const geomCol = (geomColRows[0]?.values[0]?.[0] as string) || "geom";
    const srsId = (geomColRows[0]?.values[0]?.[1] as number) ?? 4326;
    const isBNG = srsId === 27700;

    // Get all column names excluding geometry + fid
    const colInfoRows = db.exec(`PRAGMA table_info("${featureTable}")`);
    const propColumns = colInfoRows[0]?.values
      .map((r) => r[1] as string)
      .filter(
        (name) =>
          name !== geomCol &&
          name.toLowerCase() !== "fid" &&
          name.toLowerCase() !== "id"
      ) ?? [];

    // Read all rows
    const selectCols = propColumns.map((c) => `"${c}"`).join(", ");
    const query = selectCols
      ? `SELECT "${geomCol}", ${selectCols} FROM "${featureTable}"`
      : `SELECT "${geomCol}" FROM "${featureTable}"`;

    const dataRows = db.exec(query);
    if (!dataRows.length) {
      return { type: "FeatureCollection", features: [] };
    }

    const allValues = dataRows[0].values;
    onProgress?.(`Parsing ${allValues.length.toLocaleString()} features…`);

    const features: GeoJSON.Feature[] = [];
    let skipped = 0;

    for (const row of allValues) {
      const gpbBlob = row[0] as Uint8Array | null;
      if (!gpbBlob || gpbBlob.length < 8) {
        skipped++;
        continue;
      }

      let geojsonGeom: any;
      try {
        geojsonGeom = gpbToGeoJSON(gpbBlob, isBNG);
      } catch {
        skipped++;
        continue;
      }

      if (!geojsonGeom) {
        skipped++;
        continue;
      }

      const props: Record<string, any> = {};
      propColumns.forEach((col, idx) => {
        props[col] = row[idx + 1] ?? null;
      });

      features.push({
        type: "Feature",
        geometry: geojsonGeom,
        properties: props,
      });
    }

    onProgress?.(
      `Parsed ${features.length.toLocaleString()} features (${skipped} skipped)`
    );

    return { type: "FeatureCollection", features };
  } finally {
    db.close();
  }
}

// ── GPB / WKB Parsing ──

function gpbToGeoJSON(gpb: Uint8Array, isBNG: boolean): any {
  if (gpb[0] !== 0x47 || gpb[1] !== 0x50) {
    // Not GPB — try parsing as raw WKB
    return wkbToGeoJSON(gpb, 0, isBNG).geom;
  }

  const flags = gpb[3];
  const envelopeType = (flags >> 1) & 0x07;
  const envelopeSizes: Record<number, number> = {
    0: 0, 1: 32, 2: 48, 3: 48, 4: 64,
  };
  const envSize = envelopeSizes[envelopeType] ?? 0;
  const wkbOffset = 8 + envSize;
  if (wkbOffset >= gpb.length) return null;

  return wkbToGeoJSON(gpb, wkbOffset, isBNG).geom;
}

function wkbToGeoJSON(
  buf: Uint8Array,
  offset: number,
  isBNG: boolean
): { geom: any; end: number } {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const le = buf[offset] === 1;
  offset += 1;

  const rawType = le
    ? view.getUint32(offset, true)
    : view.getUint32(offset, false);
  offset += 4;

  const baseType = rawType % 1000;
  const hasZ = (rawType >= 1000 && rawType < 2000) || rawType >= 3000;

  function readCoord(): number[] {
    const x = le ? view.getFloat64(offset, true) : view.getFloat64(offset, false);
    offset += 8;
    const y = le ? view.getFloat64(offset, true) : view.getFloat64(offset, false);
    offset += 8;
    if (hasZ) offset += 8;

    if (isBNG) {
      const [lng, lat] = bngToWgs84(x, y);
      return [lng, lat];
    }
    return [x, y];
  }

  function readRing(): number[][] {
    const count = le
      ? view.getUint32(offset, true)
      : view.getUint32(offset, false);
    offset += 4;
    const coords: number[][] = [];
    for (let i = 0; i < count; i++) coords.push(readCoord());
    return coords;
  }

  switch (baseType) {
    case 1: {
      const coord = readCoord();
      return { geom: { type: "Point", coordinates: coord }, end: offset };
    }
    case 2: {
      const ring = readRing();
      return {
        geom: { type: "LineString", coordinates: ring },
        end: offset,
      };
    }
    case 3: {
      const numRings = le
        ? view.getUint32(offset, true)
        : view.getUint32(offset, false);
      offset += 4;
      const rings: number[][][] = [];
      for (let i = 0; i < numRings; i++) rings.push(readRing());
      return { geom: { type: "Polygon", coordinates: rings }, end: offset };
    }
    case 4: {
      const numGeoms = le
        ? view.getUint32(offset, true)
        : view.getUint32(offset, false);
      offset += 4;
      const coords: number[][] = [];
      for (let i = 0; i < numGeoms; i++) {
        const r = wkbToGeoJSON(buf, offset, isBNG);
        coords.push(r.geom.coordinates);
        offset = r.end;
      }
      return {
        geom: { type: "MultiPoint", coordinates: coords },
        end: offset,
      };
    }
    case 5: {
      const numGeoms = le
        ? view.getUint32(offset, true)
        : view.getUint32(offset, false);
      offset += 4;
      const lines: number[][][] = [];
      for (let i = 0; i < numGeoms; i++) {
        const r = wkbToGeoJSON(buf, offset, isBNG);
        lines.push(r.geom.coordinates);
        offset = r.end;
      }
      return {
        geom: { type: "MultiLineString", coordinates: lines },
        end: offset,
      };
    }
    case 6: {
      const numGeoms = le
        ? view.getUint32(offset, true)
        : view.getUint32(offset, false);
      offset += 4;
      const polys: number[][][][] = [];
      for (let i = 0; i < numGeoms; i++) {
        const r = wkbToGeoJSON(buf, offset, isBNG);
        polys.push(r.geom.coordinates);
        offset = r.end;
      }
      return {
        geom: { type: "MultiPolygon", coordinates: polys },
        end: offset,
      };
    }
    default:
      throw new Error(`Unsupported WKB type: ${rawType}`);
  }
}
