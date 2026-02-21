

## Speed Up HV Cable Loading at Close Zoom

### Root Cause
Database logs show the cable query takes **12-24 seconds** for ~1,752 features at close zoom. The bottleneck is JSON serialization, not the spatial query itself. Three compounding factors:

1. **Excessive coordinate precision**: `ST_AsGeoJSON` defaults to 15 decimal places. At 100m zoom, 6 decimals (0.11m accuracy) is more than sufficient. This roughly halves the payload size for dense LineStrings.
2. **Double JSON parsing**: `jsonb_agg(... jsonb_build_object(...) ...)` parses the GeoJSON string into jsonb, then re-serializes it. Using `json_agg` + `json_build_object` avoids this overhead.
3. **No simplification at close zoom**: Currently, viewports under 1 degree width get zero simplification. Even at 100m scale, a tiny tolerance (0.00002) removes redundant vertices without visible loss.

### Changes

**1. Database migration: Optimise `get_geo_layer_geojson` RPC**

Update the function to:
- Add `maxdecimaldigits := 6` parameter to all `ST_AsGeoJSON` calls (reduces coordinate string length by ~60%)
- Switch from `jsonb_agg`/`jsonb_build_object` to `json_agg`/`json_build_object` (avoids re-parsing overhead)
- Add a micro-simplification tier: tolerance 0.00005 for bbox width between 0.1 and 1 degree, and 0.00002 for narrower viewports (removes colinear points without visible impact)
- Return type stays `jsonb` for API compatibility (the final result is cast at the end)

**2. Frontend: Cap cable features at close zoom (`src/hooks/useLayerManager.ts`)**

Reduce the line feature cap from 20,000 to 5,000 at zoom >= 10. At street-level zoom the viewport is small enough that 5,000 is more than sufficient, and it prevents the database from serializing unnecessarily large result sets.

**3. Frontend: Exclude `attrs_json` merge for large layers (`src/lib/mapLayers.ts`)**

No change needed here -- the attrs_json merge happens server-side and the fields are useful for click popups. The coordinate precision fix alone will have the biggest impact.

### Expected Impact

| Metric | Before | After |
|--------|--------|-------|
| Coordinate string size per feature | ~800 bytes | ~300 bytes |
| JSON aggregation method | jsonb (double parse) | json (single pass) |
| Query time (1,752 cables) | 12-24 seconds | ~2-4 seconds |
| Simplification at close zoom | None | Micro (0.00002) |

### Files Modified
- **Database migration**: Updated `get_geo_layer_geojson` function with precision limits, json_agg, and micro-simplification
- **`src/hooks/useLayerManager.ts`**: Reduced line feature cap at high zoom from 20,000 to 5,000

