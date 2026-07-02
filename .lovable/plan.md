## What's in the Drive folder

I listed the folder via the Google Drive connector. It is **not 1 GB** — the two subfolders (SEPD + SHEPD) hold **~322 files, ~31 MB total**, all Esri Shapefile sidecars (.shp/.shx/.dbf/.prj/.cpg) in BNG (EPSG:27700). That decodes to **~51 unique GIS layers**:

**SHEPD (27 layers)** and **SEPD (24 layers)**, grouped by theme:
- **Wires / overhead lines** — existing + abandoned, EHV / EHVP / HV / LV
- **Cables** — existing + abandoned, EHV / EHVP / HV / LV
- **Towers** — locations + label anno
- **Cabinets** (SHEPD only) — location + label anno
- **Isolating equipment** — locations + symbols + anno
- **Ducts** (SHEPD only)
- **Fibre optic joints** — locations + anno
- **Service points** (anno only)
- **`*_sc_anno_annotation_*` / `*_annotation_*`** = pure text labels (skip for map)

Small gaps in the SEPD export (missing existing LV wires/cables, existing HV wires) — I'll flag those in the UI so you can chase SSEN, not silently drop them.

## Plan

### 1. Reusable Drive → GIS pipeline (edge function `ssen-drive-ingest`)
Input: `{ region: 'SEPD'|'SHEPD', layer_base: '<shapefile-basename>' }`.
Steps:
1. Query Google Drive via connector gateway for the 4 sidecar files matching `layer_base.{shp,shx,dbf,prj}` in the region folder (folder IDs already known).
2. Download each via `?alt=media` into memory.
3. Parse with `shapefile` npm library (streaming, works in Deno via `npm:` specifier) → features with WKT geometry + `attrs_json`.
4. Reproject BNG → WGS84 using the existing precise `ostn15` helper (already used for Leeds street lights, sub-metre accuracy).
5. Bulk insert into `geo_points` / `geo_cables` / `geo_polygons` keyed by `layer_id`.
6. Auto-populate `layer_registry.bbox` from feature extent.

Skip annotation-only layers by default (checkbox in admin if you ever want them).

### 2. New layer group in `layer_registry`
Create one registry row per usable shapefile (est. ~30 rows after excluding pure annotation), grouped under two new categories:
- `SSEN — SEPD (South England)`
- `SSEN — SHEPD (North Scotland)`

Sub-grouped in the Layer panel by asset type (Wires, Cables, Towers, Cabinets, Isolating Equipment, Ducts, Fibre). Voltage class encoded as coloured styling (EHV red, HV orange, LV blue; abandoned = dashed / grey).

### 3. Admin UI: `SsenDriveIngest.tsx`
New card in **Admin → DNO Datasets** showing all 51 layers with per-row **Ingest** button + status (pending / running / rows loaded / bbox). Bulk "Ingest all SEPD" / "Ingest all SHEPD" buttons that queue ingests sequentially (self-continuing pattern already used for `npg-dataset-ingest` to avoid CPU timeout on the larger cable/wire layers).

### 4. Map integration
No changes needed in `mapLayers.ts` / `FeatureInfoPanel.tsx` — the existing registry-driven renderer picks these up automatically once rows land in `geo_*` tables and the registry entries exist. Popups will show `attrs_json` fields (voltage, install date, feeder, etc.) via the generic renderer.

### 5. Verification
1. Ingest a small layer first: `electric_et_tower_location_shepd` (~7 KB, ~90 towers) — confirm points land in Scotland with correct BNG→WGS84 offsets (<1 m).
2. Ingest a medium wire layer (`electric_eo_wire_segment_inst_route_exi_hv_shepd`) — confirm line features render.
3. Toggle a layer on/off in the panel; confirm map fly-to uses the auto-computed bbox.
4. Click a tower feature → popup shows `attrs_json` attributes.

## Technical details

- **Google Drive access**: gateway URL `https://connector-gateway.lovable.dev/google_drive/drive/v3/files/{id}?alt=media`. Connector already linked; secrets `LOVABLE_API_KEY` + `GOOGLE_DRIVE_API_KEY` present.
- **Shapefile parser**: `npm:shapefile@0.6.6` (pure JS, Deno-compatible). Handles .shp+.dbf streaming.
- **Projection**: reuse `src/lib/ostn15.ts` but port the minimum needed constants into the edge function (Deno context — no `src/` imports). Same OSTN15 grid-shift already validated for Leeds street lights.
- **Storage routing**:
  - Point geometry → `geo_points` (towers, cabinets, isolating equipment, fibre joints)
  - Line geometry → `geo_cables` (wires, cables, ducts)
  - Polygon geometry (none expected in this export, but guard anyway) → `geo_polygons`
- **Annotation layers** (`*_annotation_*`, `*_sc_anno_*`): skipped by default — they're rendered labels, not primary geometry.
- **File-format guarantee**: I've already inspected the folder — everything is `.shp/.shx/.dbf/.prj/.cpg`. No PDFs, no XLSX, no zips. So the pipeline can be single-purpose (no format detection needed).

## Out of scope
- The LTDS capacity/headroom pipeline (already live for SSEN via `ssen-ltds-ingest`) — untouched.
- CIM EQ Profile ingestion.
- Any files added to the Drive folder after ingest (would need re-run, no live sync).
