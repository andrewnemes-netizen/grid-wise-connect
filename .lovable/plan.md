

## Fix NaPTAN Statement Timeout in Score-Site

### Problem
The `nearby_geo_points_by_slug` RPC times out when querying NaPTAN data (337k records). The spatial query uses `ST_DWithin(gp.geom::geography, ...)` but the existing GiST index is on `geom` (geometry type), so the geography cast forces a sequential scan across all 337k rows.

**Evidence**: Edge function logs show `canceling statement due to statement timeout` for every NaPTAN query.

### Fix

**1. Add a geography-cast spatial index on geo_points**

A single migration to create a GiST index on `geom::geography`. This allows `ST_DWithin` with geography to use the index directly.

```sql
CREATE INDEX idx_geo_points_geom_geography 
ON public.geo_points USING gist ((geom::geography));
```

This one index fixes ALL spatial queries that cast to geography on this table (NaPTAN, DfT traffic, STATS19).

**2. No code changes needed**

The existing `nearby_geo_points_by_slug` function and `score-site` edge function code are correct — they just need the index to perform.

### Expected Result
- NaPTAN queries drop from timeout (>8s) to <100ms
- All four pillars (Traffic, Accessibility, Grid, Safety) return real data
- The site intelligence panel shows bus/rail counts for Leeds

### Files to Change
- Database migration only (add geography index)

