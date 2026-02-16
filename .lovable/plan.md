

## Auto-Detect Geometry Type During Layer Upload

### What Changes

Currently, the admin must manually choose the geometry type (Point, Polygon, etc.) when registering a layer. This plan adds automatic geometry detection during file upload so the system scans each file, reports what it found, and updates the layer registry accordingly.

### How It Works

1. **File Scan Phase** -- After parsing each file in `GeoFileUploader`, the uploader inspects the first N features to determine the geometry type(s) present (Point, LineString, Polygon, etc.).

2. **Per-File Geometry Badge** -- Each queued file shows a detected geometry badge (e.g., "Point", "Polygon", "Mixed") in the file list before uploading, so admins can verify at a glance.

3. **Auto-Update Layer Registry** -- When uploading to a layer whose `geometry_type` is set to the generic "Geometry" (or mismatched), the system automatically updates the `geometry_type` in `layer_registry` to match what was detected. If multiple geometry types are found across files, it keeps the most common one or warns the user.

4. **Multi-File Summary** -- For batches of 5+ files with mixed types, a summary table shows:
   - File 1: substations.csv -- Point (786 features)
   - File 2: boundaries.geojson -- Polygon (42 features)
   - File 3: routes.geojson -- LineString (120 features)

### Technical Details

**GeoFileUploader.tsx changes:**
- Add a `detectedGeomType` field to the `FileStatus` interface
- After `parseFile()`, scan `geojson.features` to extract unique geometry types
- Pick the dominant type (most frequent) per file
- Display the detected type as a Badge next to each file in the queue list
- After successful upload, call `supabase.from("layer_registry").update({ geometry_type })` if the detected type differs from the current setting

**parseFile helper update:**
- Add a utility function `detectGeometryType(features)` that iterates features, collects `feature.geometry.type`, normalizes Multi variants (e.g., MultiPolygon counts as Polygon), and returns the dominant type

**LayerManagement.tsx changes:**
- In the `AddLayerForm`, default `geometry_type` to "Auto-detect" which maps to "Geometry" in the database
- When uploading, if "Geometry" is set, auto-update to the detected type after the first successful batch

**Edge function (ingest-geo-features):**
- No changes needed -- it already handles geometry promotion and centroid conversion. The auto-detect only affects the registry metadata used for map rendering.

### Files Modified
- `src/components/admin/GeoFileUploader.tsx` -- add detection logic and UI badges
- `src/components/admin/LayerManagement.tsx` -- add "Auto-detect" default option

