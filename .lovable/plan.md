

## Ingest NGN Gas GeoPackage via Manual Upload

### Problem
You have a downloaded NGN GeoPackage ZIP file but no API key. The GeoFileUploader currently only supports GeoJSON, CSV, GML, and Shapefile — not GeoPackage (.gpkg) or ZIP archives.

### Approach

Since GeoPackage is an SQLite-based binary format, it cannot be parsed client-side in the browser easily. Instead, we'll handle this server-side with an edge function that accepts the ZIP upload, extracts the .gpkg file, reads features using a lightweight SQLite/GeoPackage parser, and ingests them into the database.

### Steps

**1. Add GeoPackage support via a new edge function `ingest-geopackage`**
- Accepts a multipart/form-data upload with the ZIP or .gpkg file, plus `layer_id` and `dno` parameters
- Unzips if needed, opens the .gpkg SQLite database using Deno's SQLite bindings
- Reads geometry (WKB) and properties from the feature table
- Converts WKB geometries to GeoJSON, reprojects BNG to WGS84 if detected
- Batch-inserts features via the existing `ingest_geo_features_v4` RPC
- Returns insert count

**2. Update GeoFileUploader to support .gpkg and .zip files**
- Add `.gpkg` and `.zip` to the accepted file extensions
- When a .gpkg or .zip file is detected, upload it directly to the edge function instead of trying to parse client-side
- Show progress indicator during upload and server-side processing

**3. Register NGN datasets in the Gas Dataset Registry**
- Add a manual upload button for NGN in the GasDatasetRegistry component (since `crawler: null`)
- Allow uploading .gpkg/.zip files directly from the NGN card, linked to the correct layer

**4. Create the target layer in layer_registry**
- Register an "NGN Distribution Mains" layer in `geo_feeders` (LineString) for West Yorkshire
- DNO key: `NGN`, category: `gas`

### Technical details

The edge function will use Deno's built-in SQLite support (`https://deno.land/x/sqlite/mod.ts`) to read the GeoPackage. GeoPackage stores geometries as GeoPackage Binary (GPB) which wraps standard WKB with an 8-byte header — we strip the header and parse the WKB to GeoJSON coordinates.

### Files changed
| File | Change |
|------|--------|
| `supabase/functions/ingest-geopackage/index.ts` | New edge function for .gpkg/.zip upload and ingestion |
| `src/components/admin/GeoFileUploader.tsx` | Add .gpkg/.zip support, route to edge function |
| `src/components/admin/GasDatasetRegistry.tsx` | Add manual upload option for NGN |
| Migration SQL | Create NGN layer in `layer_registry` |

