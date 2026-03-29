

## Fix: Overpass Road Layers Timing Out

### Root Cause

The edge function logs show **100% failure rate** — all three Overpass endpoints return 504 or timeout. The problem is the bbox is too large at zoom level 8. At z8, the UK viewport spans roughly 5° x 3° — Overpass must scan millions of road ways across that area, exceeding its 25-second query limit.

### Solution: Constrain bbox size + smarter queries

**1. Edge function: cap bbox area and use `nwr` with count limit**

In `supabase/functions/overpass-road-fetch/index.ts`:
- Add a max bbox area check (~0.5° x 0.5° for major roads, ~0.2° x 0.2° for minor/footways)
- If the viewport bbox exceeds the limit, subdivide or clip to the center portion
- Reduce the Overpass timeout from 25s to 15s (fail faster, try next endpoint sooner)
- Reduce the `AbortSignal.timeout` from 30s to 18s to match

**2. Raise min_zoom in registry** (database migration)

Current min_zoom values are too low for live Overpass queries:
- `osm_major_roads`: 8 → **11** 
- `osm_minor_roads`: 10 → **13**
- `osm_footways`: 12 → **14**

At z11, the viewport covers ~0.15° x 0.1° — a manageable query for Overpass.

**3. Frontend: add bbox area guard in `fetchOverpassGeoJSON`**

In `src/lib/mapLayers.ts`, before calling the edge function, check if the bbox spans more than ~0.3° in either dimension. If so, return an empty FeatureCollection and show a "zoom in" toast instead of making a doomed request.

### Files Changed
- `supabase/functions/overpass-road-fetch/index.ts` — reduce timeouts, add bbox clamp
- `src/lib/mapLayers.ts` — add bbox area guard in `fetchOverpassGeoJSON`  
- Database migration — update `min_zoom` for the 3 OSM layers

### Expected Outcome
- Road layers load reliably when zoomed in to city/town level
- No more 30-second hangs waiting for doomed requests
- Clear feedback to user if viewport is too wide

