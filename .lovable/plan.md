
## Fix Plan: OSM Enrichment Logic (not data availability)

### What’s actually broken
You’re right: this is a logic issue, not missing datasets.

From code + backend checks:
1. `score-sites-batch` only looks up **one z14 tile ID** for every OSM layer.
2. Cache is stored at **mixed zooms per layer**:
   - major roads: z12
   - minor roads / rail / water: z13
   - footways / crossings / signals: z14
3. Water constraint slug mismatch:
   - scorer looks for `osm_water_bodies`
   - cache/layers use `osm_water`

That combination makes `osm_coverage` frequently return `"none"` even when minor roads/footways are cached.

---

## Implementation steps

1. **Refactor `queryOsmContext` in `supabase/functions/score-sites-batch/index.ts`**
   - Add a per-layer config map: slug + zoom + classification.
   - Use correct slugs (`osm_water`, not `osm_water_bodies`).

2. **Use per-layer deterministic tile lookup**
   - For each configured layer, compute tile ID using that layer’s zoom.
   - Query cache using all computed `(layer_slug, tile_id)` candidates (single DB query).

3. **Add border-safe neighbor tile scan**
   - For each layer zoom, include a 3x3 tile ring around site tile (center + neighbors).
   - This avoids false negatives when a site is near tile boundaries.

4. **Keep proximity filtering, but apply after correct cache retrieval**
   - Reuse 200m distance check.
   - Keep split/constraints derivation logic, but on correctly fetched features.

5. **Fix coverage semantics**
   - `osm_coverage = "cached"` when relevant cached tiles exist for road/context layers.
   - Keep fallback split only when no nearby road geometry is detected.

6. **Add targeted debug logging**
   - Log per-site cache hits by layer + tile count + nearby feature counts.
   - Makes future regressions obvious in function logs.

---

## End-to-end validation plan

1. Warm cache by calling `overpass-road-fetch` for:
   - `osm_minor_roads`
   - `osm_footways`
   - `osm_crossings`
   - `osm_traffic_signals`
   around Stockton/Yarm area.

2. Verify cache rows exist in `osm_tile_cache` for expected slugs and tile IDs.

3. Run `score-sites-batch` with:
   - `TS17 0NP`
   - `Low Ln, Stockton-on-Tees, Yarm TS15 9JT` (or postcode TS15 9JT)

4. Pass criteria:
   - at least one site returns `osm_coverage: "cached"`
   - surface split is not always fallback-only behavior in urban tiles
   - crossings/signals reflect cached context when present

5. Regression check:
   - test a second urban area already cached to confirm same behavior.

---

## Files to change
- `supabase/functions/score-sites-batch/index.ts` (primary fix only)

## No DB migration needed
- Schema/table structure is already sufficient (`osm_tile_cache` + existing OSM layer slugs).
