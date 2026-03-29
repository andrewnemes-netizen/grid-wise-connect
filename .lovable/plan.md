

## Next Steps + Cost-Optimised Route Preference

### Completed so far
- P0: OSM ingestion metadata table
- P1: Tag gap closure + deterministic tile caching
- P2: Tile-based GeoJSON caching
- P3: Route segmentation engine (OSM-backed)
- LA Programme batch scoring with OSM enrichment (fixed lookup logic)

### What's next: two items

---

### 1. Surface Cost Preference in Route Engine

**Problem**: The route segmentation engine classifies segments by proximity to nearest OSM way but does not consider cost when multiple paths exist. The cost hierarchy is clear from your unit rates:

| Surface | Excavation £/m | Preference |
|---------|---------------|------------|
| Verge | £65 | 1st (cheapest) |
| Footway | £120 | 2nd |
| Carriageway | £210 | 3rd (avoid) |

**Changes**:

**`supabase/functions/osm-route-segment/index.ts`** — Update the nearest-way selection logic in `segmentRouteAgainstOsm`. When multiple OSM ways are within the buffer radius of a route segment midpoint, rank them by surface cost preference (verge > footway > carriageway) rather than pure nearest distance. Specifically:
- Collect all candidate ways within buffer distance
- Apply a cost-weighted score: `effective_distance = actual_distance_m + cost_penalty` where carriageway gets a +30m penalty and footway gets a +15m penalty (so a verge 40m away beats a carriageway 20m away)
- This preserves geometric accuracy while biasing toward cheaper surfaces

**`src/lib/gridwise/routeEngine.ts`** — In the fallback estimated split (no OSM data), flip the default from `{ footway: 0.6, carriageway: 0.3, verge: 0.1 }` to `{ verge: 0.5, footway: 0.35, carriageway: 0.15 }` reflecting the design preference to route through verge/footway first.

**`supabase/functions/score-sites-batch/index.ts`** — Same fallback flip in the batch scorer's default surface split.

---

### 2. P4: Portfolio Site Intelligence (from validation report)

Enrich portfolio sites with OSM constraint data, grid proximity, and route feasibility flags for risk assessment. This uses the same `osm_tile_cache` infrastructure built in P1-P3.

**Changes**:
- Add an edge function or extend `score-sites-batch` to accept portfolio site coordinates and return enrichment data (nearby crossings, signals, railways, water, surface context)
- Update `src/components/portfolio/PortfolioAnalytics.tsx` to display constraint flags and OSM coverage per site
- Add a "Re-score with OSM" action on the Portfolio page

---

### Recommendation

Implement item 1 first (surface cost preference) — it's a targeted logic fix across 3 files that immediately improves cost accuracy. Then move to P4 portfolio intelligence.

### Files to change (item 1)
- `supabase/functions/osm-route-segment/index.ts` — cost-weighted way selection
- `src/lib/gridwise/routeEngine.ts` — flip fallback split
- `supabase/functions/score-sites-batch/index.ts` — flip fallback split

