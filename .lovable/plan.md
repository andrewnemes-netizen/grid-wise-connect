

## Fix: Support SSEN CSV Files with British National Grid Coordinates

### The Problem

Your SSEN substation file uses columns called **"Location X (m)"** and **"Location Y (m)"** which contain British National Grid (BNG) eastings and northings (e.g. 435797, 123880). The CSV parser currently doesn't recognise these column names, so it reports "No geometry found".

Even if we add those names to the alias list, BNG coordinates are not latitude/longitude -- they need to be mathematically converted to WGS84 (the coordinate system maps use). The good news is this conversion already exists in the codebase for GML files, so we just need to reuse it for CSVs too.

### What Will Change

1. **Recognise more column names** -- The parser will match "location x (m)", "location y (m)", "easting", "northing", "long", "location_longitude", "location_latitude", and other common variants.

2. **Auto-detect BNG coordinates and convert them** -- If values are larger than 180 (impossible for lat/lng), the system treats them as BNG and converts to lat/lng automatically. This is the same logic already used for GML files.

3. **Reuse existing conversion code** -- The `bngToWgs84` function currently lives inside `gmlParser.ts`. It will be extracted to a shared utility so both the GML parser and CSV parser can use it.

### Technical Details

**File: `src/lib/gmlParser.ts`**
- Export the existing `bngToWgs84` function (and its helpers) so it can be imported elsewhere

**File: `src/components/admin/GeoFileUploader.tsx`**
- Import `bngToWgs84` from `gmlParser.ts`
- Expand the latitude alias list to include: `northing`, `location y (m)`, `location_latitude`, `loc_lat`, `site_lat`
- Expand the longitude alias list to include: `easting`, `location x (m)`, `location_longitude`, `loc_long`, `long`, `site_long`
- Add a fuzzy fallback: if no exact match, find headers containing "lat"/"northing" or "lon"/"lng"/"long"/"easting" as substrings
- After parsing coordinates, check if values exceed 180; if so, run them through `bngToWgs84` to convert to lat/lng
- For BNG coordinates, the X column is easting (longitude-like) and Y is northing (latitude-like), so map them accordingly

### Files Modified
- `src/lib/gmlParser.ts` -- export `bngToWgs84` and helper functions
- `src/components/admin/GeoFileUploader.tsx` -- expand column recognition and add BNG conversion

