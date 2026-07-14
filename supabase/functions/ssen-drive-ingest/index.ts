// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import * as shapefile from "npm:shapefile@0.6.6";
import proj4 from "npm:proj4@2.11.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Config ──────────────────────────────────────────────────────────────────

const REGION_FOLDERS: Record<"SEPD" | "SHEPD", string> = {
  SHEPD: "1YeeeAbmBqIgstoowREm73GMyHen6Jh_h",
  SEPD: "17sNRRhjUcvXLVc0tzp0FSqYNwiTii1v6",
};

// BNG (EPSG:27700) → WGS84 (EPSG:4326). Uses the standard OSTN02 Helmert
// approximation — accurate to ~2–5 m across GB. Sub-metre accuracy would
// require the OSTN15 NTv2 grid (browser-side only in this project).
proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 " +
  "+ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs",
);
const bngToWgs = proj4("EPSG:27700", "EPSG:4326");

// ─── HTTP handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (action === "list") {
      const catalogue = await buildCatalogue();
      return json({ layers: catalogue });
    }

    if (action === "sync-registry") {
      const catalogue = await buildCatalogue();
      const result = await syncRegistry(sb, catalogue);
      return json({ synced: result.synced, layers: catalogue.length });
    }

    if (action === "ingest") {
      const { region, layer_base } = body;
      if (!region || !layer_base) return json({ error: "region and layer_base required" }, 400);
      // Kick off in background — full shapefile parse can exceed the 2s CPU
      // budget of a single request/response cycle. Client polls
      // layer_registry.feature_count to observe progress.
      // @ts-ignore EdgeRuntime is available in Supabase edge runtime
      EdgeRuntime.waitUntil(
        ingestLayer(sb, region, layer_base).catch((e) =>
          console.error(`ingest ${region}/${layer_base} failed:`, e)
        ),
      );
      return json({ started: true, region, layer_base });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    console.error("ssen-drive-ingest error:", e);
    return json({ error: (e as Error).message, stack: (e as Error).stack }, 500);
  }
});

// ─── Google Drive helpers ────────────────────────────────────────────────────

const GATEWAY = "https://connector-gateway.lovable.dev/google_drive/drive/v3";

function driveHeaders(): HeadersInit {
  const lk = Deno.env.get("LOVABLE_API_KEY");
  const gk = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  if (!lk || !gk) throw new Error("Missing LOVABLE_API_KEY or GOOGLE_DRIVE_API_KEY");
  return { Authorization: `Bearer ${lk}`, "X-Connection-Api-Key": gk };
}

async function listFolder(folderId: string) {
  const files: Array<{ id: string; name: string; size?: string }> = [];
  let pageToken: string | undefined;
  do {
    const q = new URLSearchParams({
      q: `'${folderId}' in parents`,
      fields: "nextPageToken,files(id,name,mimeType,size)",
      pageSize: "1000",
    });
    if (pageToken) q.set("pageToken", pageToken);
    const res = await fetch(`${GATEWAY}/files?${q}`, { headers: driveHeaders() });
    if (!res.ok) throw new Error(`Drive list failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    files.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return files;
}

async function downloadFile(fileId: string): Promise<Uint8Array> {
  const res = await fetch(`${GATEWAY}/files/${fileId}?alt=media`, { headers: driveHeaders() });
  if (!res.ok) throw new Error(`Drive download ${fileId} failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// ─── Catalogue ────────────────────────────────────────────────────────────────

type LayerEntry = {
  region: "SEPD" | "SHEPD";
  base: string;
  files: Record<string, { id: string; size: number }>; // ext → file
  size_bytes: number;
  is_annotation: boolean;
};

async function buildCatalogue(): Promise<LayerEntry[]> {
  const out: LayerEntry[] = [];
  for (const region of ["SEPD", "SHEPD"] as const) {
    const files = await listFolder(REGION_FOLDERS[region]);
    const byBase = new Map<string, LayerEntry>();
    for (const f of files) {
      const m = f.name.match(/^(.+)\.([A-Za-z0-9]+)$/);
      if (!m) continue;
      const base = m[1];
      const ext = m[2].toLowerCase();
      let entry = byBase.get(base);
      if (!entry) {
        entry = {
          region,
          base,
          files: {},
          size_bytes: 0,
          is_annotation: /_annotation_|_sc_anno_/i.test(base),
        };
        byBase.set(base, entry);
      }
      entry.files[ext] = { id: f.id, size: Number(f.size || 0) };
      entry.size_bytes += Number(f.size || 0);
    }
    // Only keep entries with a .shp file (real geometry layers)
    for (const e of byBase.values()) if (e.files.shp) out.push(e);
  }
  return out.sort((a, b) => a.region.localeCompare(b.region) || a.base.localeCompare(b.base));
}

// ─── Naming & classification ─────────────────────────────────────────────────

function classify(base: string): {
  slug: string;
  display_name: string;
  category: string;
  subcategory: string;
  voltage_class: string | null;
  status: "existing" | "abandoned" | null;
} {
  const lower = base.toLowerCase();
  const voltage =
    /_ehvp[_.]/i.test(lower) ? "EHVP" :
    /_ehv[_.]/i.test(lower) ? "EHV" :
    /_hv[_.]/i.test(lower) ? "HV" :
    /_lv[_.]/i.test(lower) ? "LV" : null;
  const status: "existing" | "abandoned" | null =
    /_aba_|_abandoned_/i.test(lower) ? "abandoned" :
    /_exi_|_existing_/i.test(lower) ? "existing" : null;

  let subcategory = "Other";
  if (/_wire_/.test(lower)) subcategory = "Overhead Wires";
  else if (/_cable_/.test(lower)) subcategory = "Cables";
  else if (/_tower_/.test(lower)) subcategory = "Towers";
  else if (/_cabinet_/.test(lower)) subcategory = "Cabinets";
  else if (/_duct_/.test(lower)) subcategory = "Ducts";
  else if (/_fiber_optic|_fibre_optic/.test(lower)) subcategory = "Fibre Optic";
  else if (/_isolating_eqpt/.test(lower)) subcategory = "Isolating Equipment";
  else if (/_service_point/.test(lower)) subcategory = "Service Points";
  else if (/_substation/.test(lower)) subcategory = "Substations";

  const parts = [
    "SSEN Drive",
    subcategory,
    voltage,
    status === "abandoned" ? "(abandoned)" : null,
    /_shepd$/i.test(base) ? "SHEPD" : "SEPD",
  ].filter(Boolean);
  const display_name = parts.join(" · ");

  return {
    slug: `ssen-drive-${base}`.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
    display_name,
    category: "Electrical Assets",
    subcategory,
    voltage_class: voltage,
    status,
  };
}

// ─── Registry sync ───────────────────────────────────────────────────────────

async function syncRegistry(sb: any, catalogue: LayerEntry[]) {
  const usable = catalogue;
  let synced = 0;

  for (const entry of usable) {
    const cls = classify(entry.base);
    const category = entry.is_annotation ? "Annotations" : cls.category;
    const geometry_type = await peekGeometryType(entry.files.shp.id);
    const storage_table =
      geometry_type === "Point" ? "geo_points" :
      geometry_type === "Polygon" ? "geo_polygons" :
      "geo_cables";

    const { data: existing } = await sb
      .from("layer_registry")
      .select("id")
      .eq("slug", cls.slug)
      .maybeSingle();

    if (existing) continue;

    const { error } = await sb.from("layer_registry").insert({
      slug: cls.slug,
      display_name: cls.display_name,
      dno: "SSEN",
      category,
      subcategory: cls.subcategory,
      geometry_type,
      storage_table,
      source_type: "drive_shapefile",
      enabled: true,
      visible_by_default: false,
      min_zoom: entry.is_annotation ? 13 : 10,
      attribution: "SSEN GIS export (Google Drive)",
      style_json: styleFor(cls, geometry_type),
    });
    if (error) throw new Error(`registry insert failed for ${cls.slug}: ${error.message}`);
    synced++;
  }
  return { synced };
}

function styleFor(cls: ReturnType<typeof classify>, geom: string): any {
  const colour =
    cls.voltage_class === "EHV" || cls.voltage_class === "EHVP" ? "#DC2626" :
    cls.voltage_class === "HV" ? "#F59E0B" :
    cls.voltage_class === "LV" ? "#3B82F6" :
    "#8B5CF6";
  if (geom === "Point") {
    return { paint: { "circle-color": colour, "circle-radius": 3, "circle-stroke-color": "#fff", "circle-stroke-width": 1 } };
  }
  const dash = cls.status === "abandoned" ? { "line-dasharray": [2, 2] } : {};
  return { paint: { "line-color": colour, "line-width": 2, "line-opacity": 0.9, ...dash } };
}

// Read the shape type from the first 100 bytes of a .shp file (byte 32-35 LE)
async function peekGeometryType(fileId: string): Promise<"Point" | "LineString" | "Polygon"> {
  // Range request via Drive API (alt=media honours Range headers)
  const res = await fetch(`${GATEWAY}/files/${fileId}?alt=media`, {
    headers: { ...driveHeaders(), Range: "bytes=0-99" },
  });
  const buf = new Uint8Array(await res.arrayBuffer());
  const dv = new DataView(buf.buffer);
  const shapeType = dv.getInt32(32, true);
  if (shapeType === 1 || shapeType === 8 || shapeType === 11 || shapeType === 21) return "Point";
  if (shapeType === 3 || shapeType === 13 || shapeType === 23) return "LineString";
  if (shapeType === 5 || shapeType === 15 || shapeType === 25) return "Polygon";
  return "LineString";
}

// ─── Ingestion ────────────────────────────────────────────────────────────────

async function ingestLayer(sb: any, region: string, layer_base: string) {
  const catalogue = await buildCatalogue();
  const entry = catalogue.find((e) => e.region === region && e.base === layer_base);
  if (!entry) throw new Error(`Layer not found in Drive: ${region}/${layer_base}`);
    if (!entry.files.shp || !entry.files.dbf) {
    throw new Error(`Layer missing .shp or .dbf: ${layer_base}`);
  }

  const cls = classify(layer_base);
  const { data: reg } = await sb
    .from("layer_registry")
    .select("id, storage_table, geometry_type")
    .eq("slug", cls.slug)
    .maybeSingle();
  if (!reg) throw new Error(`Registry row missing for ${cls.slug}. Run sync-registry first.`);

  // Wipe previous rows for this layer
  await sb.from(reg.storage_table).delete().eq("layer_id", reg.id);
  await sb.from("layer_registry").update({ feature_count: 0 }).eq("id", reg.id);

  const [shp, dbf] = await Promise.all([
    downloadFile(entry.files.shp.id),
    downloadFile(entry.files.dbf.id),
  ]);

  const source = await shapefile.open(shp, dbf);

  let [minLng, minLat, maxLng, maxLat] = [180, 90, -180, -90];

  const CHUNK = 1000;
  let buffer: any[] = [];
  let processed = 0;

  const flush = async () => {
    if (buffer.length === 0) return;
    const { error } = await sb.from(reg.storage_table).insert(buffer);
    if (error) throw new Error(`insert error at ${processed}: ${error.message}`);
    processed += buffer.length;
    buffer = [];
  };

  while (true) {
    const rec = await source.read();
    if (rec.done) break;

    const g = reproject(rec.value.geometry);
    if (g) {
      updateBbox(g, (lng, lat) => {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      });
      buffer.push({
        layer_id: reg.id,
        dno: "SSEN",
        name: (rec.value.properties?.name || rec.value.properties?.NAME || null),
        attrs_json: rec.value.properties || {},
        geom: `SRID=4326;${geomToWkt(promoteMulti(g, reg.storage_table))}`,
      });
      if (buffer.length >= CHUNK) {
        await flush();
        await sb.from("layer_registry").update({ feature_count: processed }).eq("id", reg.id);
      }
    }
  }
  await flush();

  const bbox = (minLng < maxLng && minLat < maxLat)
    ? [minLng, minLat, maxLng, maxLat]
    : null;

  await sb.from("layer_registry").update({
    bbox,
    feature_count: processed,
    source_date: new Date().toISOString().slice(0, 10),
  }).eq("id", reg.id);

  return {
    layer_id: reg.id,
    done: true,
    features_total: processed,
    bbox,
  };
}

// ─── Geometry helpers ────────────────────────────────────────────────────────

function reprojectCoord(c: number[]): number[] {
  const [lng, lat] = bngToWgs.forward([c[0], c[1]]);
  return [lng, lat];
}

function reproject(g: any): any | null {
  if (!g || !g.type) return null;
  switch (g.type) {
    case "Point": return { type: "Point", coordinates: reprojectCoord(g.coordinates) };
    case "MultiPoint": return { type: "MultiPoint", coordinates: g.coordinates.map(reprojectCoord) };
    case "LineString": return { type: "LineString", coordinates: g.coordinates.map(reprojectCoord) };
    case "MultiLineString": return { type: "MultiLineString", coordinates: g.coordinates.map((l: any) => l.map(reprojectCoord)) };
    case "Polygon": return { type: "Polygon", coordinates: g.coordinates.map((r: any) => r.map(reprojectCoord)) };
    case "MultiPolygon": return { type: "MultiPolygon", coordinates: g.coordinates.map((p: any) => p.map((r: any) => r.map(reprojectCoord))) };
  }
  return null;
}

function updateBbox(g: any, cb: (lng: number, lat: number) => void) {
  const walk = (c: any) => {
    if (typeof c[0] === "number") cb(c[0], c[1]);
    else for (const cc of c) walk(cc);
  };
  walk(g.coordinates);
}

function coordWkt(c: number[]): string {
  return `${c[0]} ${c[1]}`;
}
function ringWkt(r: number[][]): string {
  return `(${r.map(coordWkt).join(",")})`;
}
function geomToWkt(g: any): string {
  return _geomToWkt(g);
}

function promoteMulti(g: any, storageTable: string): any {
  if (storageTable === "geo_cables") {
    if (g.type === "LineString") return { type: "MultiLineString", coordinates: [g.coordinates] };
  }
  if (storageTable === "geo_polygons") {
    if (g.type === "Polygon") return { type: "MultiPolygon", coordinates: [g.coordinates] };
  }
  return g;
}

function _geomToWkt(g: any): string {
  switch (g.type) {
    case "Point": return `POINT(${coordWkt(g.coordinates)})`;
    case "MultiPoint": return `MULTIPOINT(${g.coordinates.map((c: number[]) => `(${coordWkt(c)})`).join(",")})`;
    case "LineString": return `LINESTRING(${g.coordinates.map(coordWkt).join(",")})`;
    case "MultiLineString": return `MULTILINESTRING(${g.coordinates.map(ringWkt).join(",")})`;
    case "Polygon": return `POLYGON(${g.coordinates.map(ringWkt).join(",")})`;
    case "MultiPolygon": return `MULTIPOLYGON(${g.coordinates.map((p: number[][][]) => `(${p.map(ringWkt).join(",")})`).join(",")})`;
  }
  throw new Error(`unsupported geom ${g.type}`);
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}