

## Fix: GeoPackage Upload Crashes Edge Function

### Root Cause
The `ingest-geopackage` edge function imports `deno.land/x/sqlite` (native FFI bindings) and `deno.land/x/zip` (uses `Deno.Command`). Neither of these work in Supabase Edge Functions, which run in Deno Deploy's restricted isolate environment — no native modules, no `Deno.Command`, limited filesystem access. The function crashes on import, returning a 500 or connection error. The client-side code doesn't gracefully handle this, causing the ErrorBoundary to catch and reset the page.

### Solution: Parse GeoPackage client-side using sql.js (WebAssembly SQLite)

Instead of server-side parsing, we parse the GeoPackage in the browser:
1. Use `sql.js` (a WebAssembly build of SQLite that works in browsers) to open the `.gpkg` file
2. Extract features, parse GPB/WKB geometries to GeoJSON, reproject BNG to WGS84 — all client-side
3. Send the resulting GeoJSON features to the existing `ingest-geo-features` edge function in batches (already proven to work)

This eliminates the need for the broken edge function entirely.

### Steps

**1. Add `sql.js` dependency**
Install `sql.js` npm package for client-side SQLite reading.

**2. Create `src/lib/gpkgParser.ts`**
A new utility module that:
- Accepts a `File` (`.gpkg` or `.zip`)
- If ZIP, extracts the `.gpkg` using JSZip (already usable client-side)
- Opens the `.gpkg` with sql.js
- Reads `gpkg_contents` to find feature tables
- Reads `gpkg_geometry_columns` for geometry column name and SRS
- Iterates rows, parses GPB headers + WKB to GeoJSON coordinates
- Reprojects BNG (27700) to WGS84 using the existing `bngToWgs84` function from `gmlParser.ts`
- Returns a `FeatureCollection`

**3. Update `GeoFileUploader.tsx`**
- Remove the server-side edge function path for `.gpkg`/`.zip` files
- Instead, use the new `gpkgParser.ts` to parse client-side, then feed results through the existing batch upload path (same as GeoJSON/GML/Shapefile)

**4. Update `GasDatasetRegistry.tsx`**
- Change `handleGpkgUpload` to use client-side parsing + existing `ingest-geo-features` edge function
- Add proper error handling so failures show a toast instead of crashing

**5. Delete the broken edge function**
- Remove `supabase/functions/ingest-geopackage/index.ts`
- Remove its config entry from `supabase/config.toml`

### Technical details

sql.js loads a ~1MB WASM binary and can open SQLite databases from `Uint8Array`. GeoPackage Binary (GPB) format: 2-byte magic ("GP"), 1 byte version, 1 byte flags (envelope type in bits 1-3), 4-byte SRS ID, variable envelope, then standard WKB. The WKB parser and BNG reprojection logic already exist in `gmlParser.ts` — we'll extract/reuse the coordinate transform.

For ZIP extraction, we'll use JSZip (lightweight, browser-compatible) instead of the Deno-only zip module.

### Files changed
| File | Change |
|------|--------|
| `package.json` | Add `sql.js` and `jszip` dependencies |
| `src/lib/gpkgParser.ts` | New: client-side GeoPackage parser |
| `src/components/admin/GeoFileUploader.tsx` | Use client-side parsing for .gpkg/.zip |
| `src/components/admin/GasDatasetRegistry.tsx` | Use client-side parsing for upload handler |
| `supabase/functions/ingest-geopackage/index.ts` | Delete |
| `supabase/config.toml` | Remove ingest-geopackage entry |

