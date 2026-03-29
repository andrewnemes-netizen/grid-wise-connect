

## Overpass API Road Data Integration

### Assessment of the ChatGPT Advice

The advice is **mostly correct** but needs adjustments for your architecture:

**Good ideas to keep:**
- POST to `https://overpass-api.de/api/interpreter` with Overpass QL
- Fallback endpoints for reliability
- Bbox-based queries matching your existing viewport pattern
- Road type filtering (major/minor/footway)
- `(south,west,north,east)` bbox format (different from your `[west,south,east,north]` — needs conversion)

**Things to ignore or change:**
- "geo_roads" table — unnecessary. Your architecture already uses `geo_features` with `layer_id` foreign keys. Roads should follow the same pattern.
- "A* routing engine" — out of scope, not needed for layer display or cost estimation
- The "10. FINAL LOVABLE PROMPT" section — generic boilerplate, not useful
- Splitting UK into grid tiles for ingest — overkill for now; live viewport layers are sufficient initially

### What to Build

| # | Component | Description |
|---|-----------|-------------|
| 1 | Edge function `overpass-road-fetch` | Accepts bbox + road_type, queries Overpass API, converts response to standard GeoJSON, returns it |
| 2 | Three layer_registry entries | "OSM Major Roads", "OSM Minor Roads", "OSM Footways" with source_type = `overpass` |
| 3 | Frontend integration | Detect `source_type = 'overpass'` in `fetchLayerGeoJSON` and route to the edge function instead of the database RPC |

### Architecture Fit

These are **live viewport layers** (not ingested), matching your data strategy for visual-only layers. The edge function acts as a proxy, same pattern as `os-features-proxy` and `planning-vector-tile`.

```text
User pans map
  → useLayerManager detects visible Overpass layer
  → fetchLayerGeoJSON sees source_type='overpass'
  → calls overpass-road-fetch edge function with viewport bbox
  → edge function POSTs to Overpass API
  → returns GeoJSON → rendered on map
```

### Edge Function: `overpass-road-fetch`

- **Input**: `{ bbox: [south, west, north, east], road_type: "major" | "minor" | "footway" }`
- **Query builder**: Maps road_type to highway filter (`motorway|trunk|primary`, `secondary|tertiary|residential|unclassified`, `footway|path|cycleway`)
- **Retry logic**: Primary endpoint → kumi.systems fallback → openstreetmap.ru fallback
- **Response transform**: Overpass JSON → GeoJSON FeatureCollection (convert `geometry` array of `{lat,lon}` to `[lon,lat]` coordinate arrays)
- **Timeout**: 25s Overpass timeout, 30s fetch timeout
- **No auth required**: Public OSM data, but function still validates JWT for consistency

### Frontend Changes

**`src/lib/mapLayers.ts`** — In `fetchLayerGeoJSON`, add a branch:
```typescript
if (layer.source_type === 'overpass') {
  // Call edge function instead of database RPC
  const { data } = await supabase.functions.invoke('overpass-road-fetch', {
    body: { bbox: [south, west, north, east], road_type: layer.slug }
  });
  return data;
}
```

**`src/components/map/LayerTogglePanel.tsx`** — Add `source_type` to the `RegistryLayer` interface and query.

### Database Changes

Insert 3 rows into `layer_registry` (via insert tool, not migration):
- `osm_major_roads` — Major Roads (motorway, trunk, primary)
- `osm_minor_roads` — Minor Roads (secondary, tertiary, residential)  
- `osm_footways` — Footways & Cycleways

Each with `source_type = 'overpass'`, `geometry_type = 'LineString'`, `dno = 'OSM'`, appropriate `min_zoom` (e.g. 10 for minor, 12 for footways to avoid overloading).

### Performance Safeguards

- Min zoom enforcement: major roads z8+, minor roads z10+, footways z12+
- Overpass timeout cap: 25 seconds
- Feature cap inherited from existing line layer limits (3000–5000)
- Existing bbox overlap/shift logic in `useLayerManager` prevents redundant fetches

