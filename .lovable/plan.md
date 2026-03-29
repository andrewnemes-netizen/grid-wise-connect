

## Fix: OSM Road Layers — Two Separate Bugs

### Problem 1: "Map style never loaded, skipping layer"

The `waitForStyleLoaded` function listens for `map.once("load")` and `map.once("style.load")`. But the map fires `load` once during initialization — if layers are toggled after that event already fired, `map.once("load")` never triggers again, and `isStyleLoaded()` returns false during tile loads. After the 10s timeout, layers are silently skipped.

**Fix in `src/lib/mapLayers.ts`**: Replace the `waitForStyleLoaded` logic. Instead of listening for the `load` event (which only fires once), poll `isStyleLoaded()` every 200ms with a 10s timeout. This handles the common case where the style IS loaded but the check runs during a transient tile fetch.

```typescript
function waitForStyleLoaded(map: maplibregl.Map, timeoutMs = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    if (map.isStyleLoaded()) { resolve(true); return; }
    const interval = setInterval(() => {
      if (map.isStyleLoaded()) { clearInterval(interval); resolve(true); }
    }, 200);
    setTimeout(() => { clearInterval(interval); resolve(map.isStyleLoaded()); }, timeoutMs);
  });
}
```

### Problem 2: Overpass API 504s + 429 Rate Limiting

The edge function logs show a flood of simultaneous requests hitting Overpass — 7 layers toggled at once, each firing 3 parallel endpoint attempts = ~21 concurrent HTTP requests to Overpass. This triggers 429 rate limiting AND 504 gateway timeouts.

**Fix 1 — Edge function (`overpass-road-fetch/index.ts`)**: 
- Increase the Overpass QL timeout from 10 to 15 seconds (short queries get rejected by the server)
- Add a retry-after check on 429 responses before rejecting

**Fix 2 — Frontend (`src/lib/mapLayers.ts`)**:
- Add a simple request queue/throttle so only 2 Overpass requests fire concurrently. Additional requests wait until a slot opens.
- This prevents rate limiting when multiple OSM layers are toggled at once.

```typescript
let activeOverpassRequests = 0;
const OVERPASS_CONCURRENCY = 2;

async function fetchOverpassGeoJSON(slug, bbox, featureLimit) {
  // ... existing span guard ...
  
  // Throttle: wait for a slot
  while (activeOverpassRequests >= OVERPASS_CONCURRENCY) {
    await new Promise(r => setTimeout(r, 500));
  }
  activeOverpassRequests++;
  try {
    // ... existing fetch logic ...
  } finally {
    activeOverpassRequests--;
  }
}
```

### Files Changed
- `src/lib/mapLayers.ts` — fix `waitForStyleLoaded` polling, add Overpass concurrency throttle
- `supabase/functions/overpass-road-fetch/index.ts` — increase Overpass QL timeout to 15s

### Expected Outcome
- Layers no longer silently skipped due to "style never loaded"
- Overpass requests serialized to avoid 429 rate limiting
- Road data renders when zoomed to z11+ on a city

