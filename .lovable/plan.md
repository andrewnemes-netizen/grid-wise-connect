

## P1: Close OSM Tag Gaps + Deterministic Tile-Based Caching

### Part 1: Expand Tag Extraction (Edge Function)

**File: `supabase/functions/overpass-road-fetch/index.ts`**

The `extractTags` function already captures `surface`, `width`, `lanes`, `maxspeed`, `oneway` for road layers. Add these missing tags critical for SROH alignment and civils costing:

**Road layers** (`osm_major_roads`, `osm_minor_roads`, `osm_footways`):
- `lit` — street lighting presence (affects night works cost)
- `foot` / `bicycle` — access restrictions for footways
- `junction` — roundabout detection for route segmentation
- `sidewalk` — pavement presence (affects excavation type)
- `crossing` — pedestrian crossing type on the way itself

**New layer: `osm_crossings`** — Point features:
- Filter: `node["highway"="crossing"]` 
- Tags: `crossing`, `crossing:markings`, `traffic_signals`, `tactile_paving`
- These are critical for route costing (TM requirements at crossings)

**New layer: `osm_traffic_signals`** — Point features:
- Filter: `node["highway"="traffic_signals"]`
- Tags: `traffic_signals`, `traffic_signals:direction`
- Needed for TM cost estimation (signal-controlled junctions)

Add both to `OSM_FILTERS`, `MAX_BBOX_SPAN` (0.05 each), and `extractTags`.

### Part 2: Deterministic Tile-Based Bbox Snapping

Instead of using raw viewport coordinates (which produce different query hashes for every pan), snap the bbox to XYZ tile boundaries. This makes queries deterministic and cacheable.

**Edge function changes:**
- Add a `bboxToTiles(bbox, zoom)` function that converts a bbox into one or more tile coordinates at a fixed zoom level per layer type
- Use z12 for major roads, z13 for minor roads, z14 for footways/crossings/signals
- The query is built per-tile, so the same tile always produces the same query hash
- Check `osm_ingestion_meta` for a recent (< 1 hour) successful fetch with matching `query_hash` — if found, return a `304`-style "use cache" hint

**Frontend changes (`src/lib/mapLayers.ts`):**
- Add a `bboxToTileKeys(bbox, zoom)` function mirroring the edge function logic
- Cache Overpass results keyed by `${slug}:${tileKey}` instead of raw bbox
- When the viewport spans multiple tiles, merge results from cached + freshly fetched tiles
- This eliminates redundant fetches when panning slightly

### Part 3: Database Migration

Insert 2 new `layer_registry` rows:

| slug | display_name | category | geometry_type | source_type | min_zoom | dno |
|------|-------------|----------|--------------|-------------|----------|-----|
| osm_crossings | Pedestrian Crossings | OSM | Point | overpass | 14 | OSM |
| osm_traffic_signals | Traffic Signals | OSM | Point | overpass | 14 | OSM |

### Files Changed

- `supabase/functions/overpass-road-fetch/index.ts` — add filters, tags, tile snapping, cache check
- `src/lib/mapLayers.ts` — add tile-based cache keys, new slugs to span guard, tile merge logic
- Database migration — insert 2 new layer_registry rows

### Expected Outcome
- Road features carry full tag set needed for SROH reinstatement mapping and TM costing
- Crossings and traffic signals visible as point layers at z14+
- Identical viewport positions produce identical queries — enabling true cache hits and reproducible route analysis
- `osm_ingestion_meta` dedup works because same tile = same query_hash

