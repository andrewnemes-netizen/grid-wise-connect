

## Fix Score-Site Traffic + Accessibility Data (All Returning 0)

### Problem Found

The `score-site` edge function returns `traffic_aadf: 0`, `nearby_bus_stops: 0`, `nearby_transport_nodes: 0` for Leeds despite:
- **86 DfT traffic points** within 2km in the database
- **314 NaPTAN nodes** within 2km (40 within 500m, including bus stops with `stop_type: BCT`)
- The `nearby_geo_points_by_slug` DB function works correctly when called directly

**Root cause**: The PostgREST fetch calls to `nearby_geo_points_by_slug` in the edge function are silently failing (caught by `.catch(() => [])`). Most likely the edge function needs redeployment, or the PostgREST calls are timing out due to the 8s default statement timeout on large tables (383k+ geo_points rows with geography casts).

### Additional issue: Traffic AADF values are null

All DfT count points near Leeds have `all_motor_vehicles: null` in `attrs_json`. The AADF backfill sync hasn't been run. The live DfT API fallback exists but also returns 0 (likely the DfT API response structure changed — `data` vs `rows` mismatch).

### Plan

**1. Add error logging to score-site edge function**

Replace the silent `.catch(() => [])` on both traffic and NaPTAN fetches with `.catch((e) => { console.error("traffic fetch error:", e); return []; })` so we can see what's actually failing.

**2. Add a direct-query fallback for traffic + NaPTAN**

Instead of relying solely on the PostgREST RPC call (which may hit statement timeouts), add a fallback that uses the Supabase client SDK to query `geo_points` directly with layer_id filter + spatial distance. This bypasses PostgREST timeout issues.

**3. Redeploy score-site**

The edge function may be running stale code from before the traffic/NaPTAN enrichment was added.

**4. Fix DfT AADF live fallback**

The DfT API response uses `data[].attributes.all_motor_vehicles` not `data[].all_motor_vehicles`. Fix the response parsing.

### Files to Change

- `supabase/functions/score-site/index.ts` — Add error logging, add direct-query fallback, fix DfT AADF response parsing
- Redeploy edge function

