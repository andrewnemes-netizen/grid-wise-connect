

## LA Programme: OSM-Enriched Batch Scoring

### Problem
The `score-sites-batch` edge function uses a **hardcoded 60/30/10** surface split (footway/carriageway/verge) for all sites. It also has no awareness of nearby crossings, traffic signals, railways, or water bodies — all of which affect civil engineering costs and route feasibility.

### Approach
Enrich each site's scoring with nearby OSM data by querying the `osm_tile_cache` for road features, crossings, and signals around each site's coordinates. This replaces the hardcoded split with data-driven surface estimates and adds route constraint flags.

Full per-site route segmentation (calling `osm-route-segment`) is impractical for batch scoring — each call does 5 Overpass queries, and with 500 sites that would be 2,500 Overpass calls. Instead, we sample cached tile data.

### Changes

**1. Edge Function: `supabase/functions/score-sites-batch/index.ts`**

Add a new function `queryOsmContext(supabase, lng, lat)` that:
- Computes the z14 tile ID containing the site's coordinates
- Queries `osm_tile_cache` for `osm_major_roads`, `osm_minor_roads`, `osm_footways`, `osm_crossings`, `osm_traffic_signals` tiles covering that point
- From cached GeoJSON, finds features within ~200m of the site
- Derives a **data-driven surface split** from the ratio of nearby footway vs road vs verge lengths
- Counts nearby crossings and traffic signals
- Checks for nearby railway/water features (from `osm_railways`, `osm_water_bodies` if cached)

Update `estimateTotalCost` to accept the OSM-derived surface split instead of hardcoded 60/30/10.

Add new fields to `ScoredRow`:
- `surface_split` — `{ footway_pct, carriageway_pct, verge_pct }` (data-driven or fallback)
- `nearby_crossings` — count of pedestrian crossings within 200m
- `nearby_signals` — count of traffic signals within 200m
- `route_constraints` — array of flags like `RAILWAY_NEARBY`, `WATER_NEARBY`
- `osm_coverage` — `"cached" | "none"` indicating data source

Update phasing logic: sites with `RAILWAY_NEARBY` or `WATER_NEARBY` constraints get a penalty pushing them toward Phase 2/3.

**2. Frontend: `src/components/la/ProgrammeDashboard.tsx`**

Add columns to the results table:
- "Surface" — shows dominant surface type badge (Footway/Road/Mixed)
- "Constraints" — shows route constraint badges (railway, water, signals)
- "OSM" — indicator showing whether OSM data was available

Update CSV export to include the new fields.

**3. Frontend: `src/components/la/CsvIntakePanel.tsx`**

No changes needed — the intake format stays the same.

### Files Changed
- `supabase/functions/score-sites-batch/index.ts` — add OSM context query, data-driven surface split, new scored fields
- `src/components/la/ProgrammeDashboard.tsx` — add surface/constraint columns, update export

### Expected Outcome
- Cost estimates use real road surface data where OSM tiles are cached (falls back to 60/30/10 where not)
- Sites near railway crossings or water bodies are flagged and phased appropriately
- Dashboard shows richer constraint intelligence per site
- No additional Overpass API calls — reads from existing `osm_tile_cache`

