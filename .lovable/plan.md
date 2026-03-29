

## Expand OSM Data: What's Worth Adding vs What's Noise

### Current State
- 3 Overpass layers: major roads, minor roads, footways
- All live-fetched via `overpass-road-fetch` edge function
- No other OSM data categories exist

### ChatGPT Assessment: Mostly Hype
The suggestion to add cafes, shops, POIs, "full digital twin of the street" is overkill. Your platform estimates **electrical grid connection costs**. Only add OSM features that directly impact:
1. **Route cost** (surface type, road classification → reinstatement costs)
2. **Route constraints** (water crossings, barriers = no-go zones)
3. **Compliance checks** (proximity to buildings, environmental features)

### Recommended Additions (Phase 1 — High Value)

**Add 4 new Overpass layer types to the edge function:**

| Layer | Overpass Filter | Why It Matters |
|-------|----------------|----------------|
| `osm_water` | `natural~"water"` + `waterway~"river\|canal"` | Absolute no-go for cable routes |
| `osm_railways` | `railway~"rail\|light_rail"` | Expensive crossings, major constraint |
| `osm_buildings` | `building` (polygon) | Proximity checks, endpoint identification |
| `osm_barriers` | `barrier~"fence\|wall\|gate\|bollard"` | Route obstructions |

### NOT Recommended (Skip These)
- Traffic signals / crossings — doesn't affect cable routing cost
- Land use categories — OS Zoomstack already covers this (greenspace, woodland, sites)
- POIs (cafes, shops) — zero relevance to grid connections
- Junctions / roundabouts — already implicit in road geometry

### Technical Changes

**1. Edge function: `supabase/functions/overpass-road-fetch/index.ts`**

Rename to a more general purpose (or keep name, expand filters):

Add new entries to `ROAD_FILTERS` (rename to `OSM_FILTERS`):
```
osm_water: way/relation with natural=water OR waterway=river|canal
osm_railways: way with railway=rail|light_rail
osm_buildings: way with building=* (polygon output)
osm_barriers: node/way with barrier=*
```

Add corresponding `MAX_BBOX_SPAN` entries (all tight — 0.05° to 0.08°).

Update `overpassToGeoJSON` to handle polygons (buildings, water) in addition to LineStrings.

**2. Database: insert 4 new `layer_registry` rows**

Each with `source_type = 'overpass'`, `dno = 'OSM'`, appropriate `geometry_type`, `min_zoom` (13–14 for buildings/barriers, 11 for water/railways).

**3. Frontend: `src/lib/mapLayers.ts`**

Add the new slugs to `OVERPASS_MAX_SPAN`.

**4. Layer panel: `src/components/map/LayerTogglePanel.tsx`**

Rename "Roads" tab → "OSM" tab (or keep Roads and add an "Environment" tab). The new layers will auto-appear since they have `dno = 'OSM'`.

**5. Update `buildQuery` in edge function**

Handle polygon queries differently — buildings and water need `out body geom;` with polygon handling, not just LineString.

### Files Changed
- `supabase/functions/overpass-road-fetch/index.ts` — expand filters, handle polygons
- `src/lib/mapLayers.ts` — add new slugs to span guard
- `src/components/map/LayerTogglePanel.tsx` — possibly rename tab
- Database migration — insert 4 new `layer_registry` rows

### What This Gives You
- Cable route engine can avoid water bodies and railway crossings
- Building proximity checks for substation siting
- Barrier detection for route feasibility
- All live-fetched, no database bloat

