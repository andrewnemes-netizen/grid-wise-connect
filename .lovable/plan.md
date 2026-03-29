

## Fix: Overpass Road Layers Hanging Too Long

### Root Cause

The edge function tries 3 Overpass endpoints **sequentially**, each with an 18-second timeout. When all fail (as logs show — 504s and timeouts), the total wait is **up to 54 seconds**. The UI spinner just hangs the whole time.

### Solution: Parallel racing + shorter timeouts + frontend timeout

**1. Edge function: race all endpoints in parallel (not sequential)**

Instead of trying endpoint A → wait 18s → try B → wait 18s → try C, fire all 3 simultaneously and take whichever responds first. This reduces worst-case from 54s to ~8s.

```text
Current:  A(18s) → B(18s) → C(18s) = 54s worst case
Proposed: race(A, B, C) with 8s timeout = 8s worst case
```

**2. Reduce per-endpoint timeout from 18s to 8s**

Most successful Overpass queries return in 2-5 seconds. If it hasn't responded in 8s, it won't.

**3. Tighten bbox clamps further**

Current max spans are still generating too many results:
- `osm_major_roads`: 0.5° → **0.15°** (~16km)
- `osm_minor_roads`: 0.2° → **0.08°** (~8km)  
- `osm_footways`: 0.15° → **0.05°** (~5km)

Match these on the frontend guard too.

**4. Frontend: add 10s timeout wrapper around the edge function call**

In `fetchOverpassGeoJSON`, wrap the `supabase.functions.invoke` in a `Promise.race` with a 10s timeout. If it exceeds that, return empty collection silently instead of hanging the spinner.

### Files Changed

**`supabase/functions/overpass-road-fetch/index.ts`**
- Replace sequential `fetchWithRetry` loop with `Promise.any()` racing all 3 endpoints
- Reduce `AbortSignal.timeout` from 18000 to 8000
- Tighten `MAX_BBOX_SPAN` values
- Reduce Overpass QL timeout from 15 to 10

**`src/lib/mapLayers.ts`**
- Tighten `OVERPASS_MAX_SPAN` to match edge function values
- Add 10s timeout wrapper around `supabase.functions.invoke`
- On timeout, return empty FeatureCollection + console warning

### Expected Outcome
- Worst case wait drops from 54s to ~8-10s
- Successful queries return in 2-5s as normal
- No more indefinite spinner — guaranteed resolution within 10s

