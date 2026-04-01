

## Fix: POC Snapping to Off-Street Cables

### Problem
The current `find_nearest_compatible_lv_main` RPC picks the nearest compatible cable by straight-line distance within a 100m radius, but it does not verify the cable is actually on a road/street near the feeder pillar. This means it can snap to a cable running behind buildings, through a school grounds, or across a park — producing a false POC that has no viable trench route.

Your screenshot shows exactly this: the POC is near Hovingham Primary School where there is no street-level cable, while the feeder pillar is on a road further away.

### Root Cause
The RPC uses `ST_DWithin` on the cable geometry centroid/nearest-point but has no road-corridor gate. A cable 30m away through a building scores higher than a cable 60m away along the actual street.

### Solution
Add a road-corridor validation step to the RPC. After finding the snap point on each candidate cable, verify that the snap point is close to the feeder pillar along the road network — or more practically, verify the snap point itself is near a road.

Two-part fix:

**1. Tighten snap-point proximity filter**
Add a secondary `ST_DWithin` check on the **snap point** (not the cable geometry) to ensure the snapped connection point is within a tight radius (15m) of the feeder pillar. This prevents cables that run parallel but far away from being selected just because one end is within 100m.

**2. Prefer cables whose geometry runs along road frontage**
Cross-reference candidate cables against OSM road geometries (if available in `geo_features`) or apply a heuristic: only accept cables where the snap point is within 15-20m of the feeder pillar point. If no cable passes this tight gate, progressively widen to 30m, then 50m, with a distance penalty.

### Implementation

**Database migration: Update `find_nearest_compatible_lv_main` RPC**

Replace the `nearby` CTE to add a snap-point proximity filter:

```sql
nearby AS (
  SELECT
    c.id AS cable_id,
    c.asset_id,
    ... (same field extraction) ...
    c.geom AS cable_geom,
    ST_Distance(
      ST_Transform(c.geom, 27700),
      ST_Transform(fp.geom, 27700)
    ) AS distance_m,
    ST_ClosestPoint(c.geom, fp.geom) AS snap_pt,
    -- Distance from snap point to feeder pillar (must be small)
    ST_Distance(
      ST_Transform(ST_ClosestPoint(c.geom, fp.geom), 27700),
      ST_Transform(fp.geom, 27700)
    ) AS snap_distance_m
  FROM geo_cables c
  CROSS JOIN fp
  WHERE ST_DWithin(
    ST_Transform(c.geom, 27700),
    ST_Transform(fp.geom, 27700),
    p_search_m
  )
  AND UPPER(...) LIKE 'LV%'
)
```

Then in the scoring, add a heavy penalty for large snap distances and filter out cables where snap point is too far:

```sql
-- In scored CTE, add snap_distance penalty:
- (f.snap_distance_m * 5)  -- stronger penalty for snap distance

-- In final WHERE, add:
AND s.snap_distance_m <= p_search_m  -- snap point must be within search radius
```

Also use staged search (25m snap distance first, then 50m, then full radius) in the `assetEngine.ts` call.

### Files to change
| File | Change |
|------|--------|
| New migration | Update `find_nearest_compatible_lv_main` to add snap-point distance calculation and heavier weighting |
| `src/lib/gridwise/assetEngine.ts` | No change needed (already does staged 25→50→100m search) |

### Expected result
- POC only appears on cables that run along/near the street where the feeder pillar is placed
- Cables behind buildings or across parks are rejected or heavily penalised
- If no street-level cable exists within range, the system returns "No compatible LV main found" rather than a false POC

