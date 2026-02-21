

## Fix Layer Loading Timeouts at Low Zoom Levels

### Problem
Loading HV Underground Cables (101k rows, 142MB) and HV Substations (27k rows, 53MB) at zoom 5 causes repeated statement timeouts. Three compounding issues:

1. The database query plan ignores the spatial index (GiST) and scans all rows by layer_id first
2. Feature limits are too high at wide zoom levels (10,000 LineStrings with jsonb serialization)
3. No request cancellation -- panning spawns concurrent duplicate queries that all time out

### Changes

**1. Database: Add composite indexes (migration)**

Create compound indexes on `(layer_id, geom)` using GiST so the planner can filter by both layer_id AND spatial bbox in a single index scan:

```text
CREATE INDEX idx_geo_cables_layer_geom ON geo_cables USING gist (geom) WHERE geom IS NOT NULL;
CREATE INDEX idx_geo_substations_layer_geom ON geo_substations USING gist (geom) WHERE geom IS NOT NULL;
CREATE INDEX idx_geo_feeders_layer_geom ON geo_feeders USING gist (geom) WHERE geom IS NOT NULL;
```

Also add partial btree+gist composite approach:
```text
CREATE INDEX idx_geo_cables_lid_geom ON geo_cables (layer_id) INCLUDE (id) WHERE geom IS NOT NULL;
```

**2. Reduce feature caps at low zoom (`src/hooks/useLayerManager.ts`)**

Current caps at zoom <7: 10,000 for lines, 10,000 for points. At zoom 5 this means serializing thousands of complex geometries. New caps:

| Zoom | Lines | Points | Polygons |
|------|-------|--------|----------|
| < 7  | 3,000 | 5,000  | 2,000    |
| 7-9  | 8,000 | 15,000 | 5,000    |
| 10+  | 20,000| 30,000 | 10,000   |

**3. Add request abort logic (`src/hooks/useLayerManager.ts`)**

Track an AbortController per layer. When a new fetch starts for the same layer, abort the previous in-flight request. This prevents cascading concurrent queries when panning:

- Add `abortControllersRef` map keyed by layerId
- Before each `fetchLayerGeoJSON` call, abort any existing controller for that layer
- Pass the abort signal through to the RPC call

**4. Increase simplification at wide zoom (`get_geo_layer_geojson` RPC)**

Add a more aggressive simplification tier for very wide viewports (bbox > 6 degrees):

| Viewport width | Tolerance |
|----------------|-----------|
| > 6 degrees    | 0.005     |
| > 3 degrees    | 0.002     |
| > 1 degree     | 0.0005    |

This reduces vertex counts significantly for cables at national zoom without visible quality loss.

**5. Add moveend debounce increase for low zoom**

Increase the moveend debounce from 300ms to 600ms when zoom < 8, giving the map more time to settle before triggering fetches.

### Expected Impact

- Cables at zoom 5: query drops from timeout (>30s) to ~2-3 seconds with composite index + 3,000 feature cap + aggressive simplification
- Substations at zoom 5: should load in <1 second (point data, simpler serialization)
- No more cascading duplicate requests when panning

### Files Modified

- **Database migration**: composite GiST indexes on geo_cables, geo_substations, geo_feeders
- **`src/hooks/useLayerManager.ts`**: reduced zoom-5 caps, abort controller logic, adaptive debounce
- **Database function `get_geo_layer_geojson`**: extra simplification tier for wide viewports

