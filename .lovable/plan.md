

## Auto-Load Infrastructure Layers for Map Screenshot

### Problem
The map screenshot captures only what's currently visible on the canvas. If the user hasn't manually toggled on substations, HV/LV cables, etc., the screenshot is just the basemap + a red pin — despite the legend listing all those infrastructure types.

### Solution
Before capturing the screenshot in `handlePinScreenshot`, temporarily load key infrastructure layers into the map viewport so they appear in the canvas capture. After capture, remove any layers that weren't already visible.

### What Changes

**`src/pages/MapView.tsx` — `handlePinScreenshot`**

1. Before fitting bounds, check which infrastructure layers are currently toggled on via `visibility`
2. Identify key layer slugs to force-load: substations, HV cables, LV cables, EHV feeders (look them up from `registryLayers` by category/slug)
3. For any not already visible, call `fetchLayerGeoJSON` + `addRegistryLayerToMap` with the screenshot bbox
4. Wait for tiles + layers to settle (idle event)
5. Capture the canvas
6. Clean up: remove any temporarily-added layers that weren't already toggled on

This ensures the screenshot always shows nearby substations, cable routes, and connection lines regardless of what the user had toggled.

**`src/pages/MapView.tsx` — pass additional props**

Pass `registryLayers`, `visibility`, and the layer loading utilities to `handlePinScreenshot` so it can discover and temporarily render infrastructure layers.

### Key Logic
```text
handlePinScreenshot:
  1. Compute bbox around pin (existing)
  2. Get list of infrastructure layer slugs to show
  3. For each slug not already visible:
     - Find layer in registryLayers
     - fetchLayerGeoJSON(layerId, bbox)
     - addRegistryLayerToMap(map, layer, geojson)
     - Track as "temp layer"
  4. Wait for idle
  5. Capture canvas (existing)
  6. Remove temp layers from map
```

### Files to Change
| File | Change |
|------|--------|
| `src/pages/MapView.tsx` | Enhance `handlePinScreenshot` to auto-load infrastructure layers before capture, clean up after |

