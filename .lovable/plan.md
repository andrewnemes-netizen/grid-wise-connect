
# Fix: Auto-detect DNO from Site Location

## Problem
When "Auto-detect" is selected in the EV Hub Feasibility panel, the engine throws "Unable to determine DNO licence area for site location" because the spatial lookup against `gb_dno_licence_areas` polygons is not wired up.

## Root Cause
In `EvHubPanel.tsx` line 66, when `dnoOverride` is `"auto"`, both `dnoLookupResult` and `dno_override` are set to `undefined`. The `resolveDnoAnchor` function in `dnoAnchor.ts` then has no input to work with and throws.

## Solution
Add a spatial query in the `handleRun` function of `EvHubPanel.tsx` that runs a PostGIS `ST_Intersects` against the `geo_polygons` table (filtered to `layer_id` for `gb_dno_licence_areas`) to find which DNO licence area the pin-drop location falls within. Pass the result as `dnoLookupResult` to the engine context.

## Technical Details

### 1. Modify `EvHubPanel.tsx` - `handleRun` function

Before calling `runEvHubEngine`, when `dnoOverride === "auto"`:
- Query `layer_registry` for the `gb_dno_licence_areas` layer ID
- Run a PostGIS `ST_Intersects` query against `geo_polygons` to find the polygon containing the site coordinates
- Extract `attrs_json->>'DNO'` (e.g., "UKPN", "NPG") from the matching polygon
- Pass this as `context.dnoLookupResult`

The SQL (via Supabase RPC or raw query):
```sql
SELECT attrs_json->>'DNO' as dno
FROM geo_polygons
WHERE layer_id = '<gb_dno_licence_areas_id>'
AND ST_Intersects(geom::geometry, ST_SetSRID(ST_Point(lng, lat), 4326))
LIMIT 1
```

Since `supabase-js` doesn't support raw PostGIS queries directly, we'll use an RPC function or perform the query via the existing `geo_polygons` table with a `.rpc()` call.

### 2. Create a database function for the spatial lookup

Create an RPC function `lookup_dno_by_location(p_lat float8, p_lng float8)` that:
- Finds the `gb_dno_licence_areas` layer ID from `layer_registry`
- Runs `ST_Intersects` against `geo_polygons`
- Returns the DNO code string

### 3. Update `EvHubPanel.tsx`

- Import `supabase` client
- In `handleRun`, call the RPC when auto-detect is selected
- Pass the result to `context.dnoLookupResult`
- Show the detected DNO in the UI (already handled since `result.dno_anchor.dno_key` is displayed)

### Files changed
- **New migration**: Create `lookup_dno_by_location` PostgreSQL function
- **`src/components/map/EvHubPanel.tsx`**: Add spatial lookup call before engine execution
