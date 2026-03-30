

## Fix: Closer Infrastructure Selection + Bidirectional Road Routing

### Two issues identified

**Issue 1: Not picking closest infrastructure**
The `score_site` PostGIS function finds the nearest substation/feeder/cable by **straight-line distance** (`<->` operator), which is correct. However, `nearest_points` returns the **centroid of the asset geometry** (e.g., a substation polygon centroid), not the **closest point on that asset to the site**. For linear assets like feeders and cables, this means the connection line goes to the middle of the feature, not the nearest edge — making it look further away than it is and potentially skipping a closer asset.

The fix: use `ST_ClosestPoint(asset_geom, site_geom)` instead of the raw asset geometry for `nearest_*_pt_4326`. This returns the closest point on the asset to the site, which is both more accurate for distance and produces better route endpoints.

**Issue 2: OSRM routes like driving, not digging**
The OSRM `foot` profile follows real walking paths, which means it respects one-way pedestrian restrictions and can take roundabout paths. For cable excavation, you can dig on **either side of any road in any direction** — it's not a navigation problem, it's a "follow the road corridor" problem.

The fix: switch from OSRM `foot` profile to a simpler approach — use OSRM `foot` but with `alternatives=false&steps=false&continue_straight=true` to get the most direct road-following path. More importantly, if the route is significantly longer than the straight-line distance (e.g., >2x), it's probably going around blocks unnecessarily. We should cap the detour ratio.

### Implementation

**File: New migration (PostGIS function update)**
- Update `score_site` to use `ST_ClosestPoint()` for all three infrastructure types:
  ```sql
  -- Instead of: nearest_primary_pt_4326 := tmp_geom;
  -- Use: nearest_primary_pt_4326 := ST_ClosestPoint(tmp_geom, site_4326);
  ```
- This ensures the connection line endpoint is the nearest point on the asset geometry to the site, not the asset centroid

**File: `src/lib/roadRoute.ts`**
- Add `continue_straight=true` parameter to OSRM request for more direct routing
- Add detour ratio check: if OSRM route distance > 2.5x straight-line distance, fall back to straight line (the route is clearly going around obstacles that don't apply to excavation)
- Keep `foot` profile (it's the most permissive for road access — `driving` would miss footways entirely)

### Why this fixes both screenshots
- The substation shown ("Windmill Terrace") at 72% utilisation may not be the closest asset to the pin at TS17 0AA — `ST_ClosestPoint` will ensure we pick the true nearest point on the nearest asset
- The cable route will follow the road corridor more directly without unnecessary detours around one-way systems or block perimeters

### Files to change
| File | Change |
|------|--------|
| New migration | Update `score_site` to use `ST_ClosestPoint()` for nearest_points output |
| `src/lib/roadRoute.ts` | Add `continue_straight=true`, add detour ratio cap (2.5x) |

### No UI changes needed

