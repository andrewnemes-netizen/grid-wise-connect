
## Fix: Prevent Auto-Update from Overwriting Layer Geometry Type

### Problem
Two issues are causing frustration:

1. **Page refreshing**: The preview page reloads whenever code changes are deployed. This is temporary and stops after the fix is applied.

2. **Auto-update bug (critical)**: After a successful upload, the `GeoFileUploader` component auto-updates the `layer_registry.geometry_type` field. The current condition updates whenever `layer.geometry_type !== dominant`, which means uploading a CSV (which produces Point geometry from lat/lng columns) will **overwrite** a correctly set "LineString" back to "Point" -- recreating the exact error you just fixed.

### Root Cause
In `GeoFileUploader.tsx` (around line 346-349), the auto-update condition is:

```text
if (dominant !== "Mixed" &&
    (layer.geometry_type === "Geometry" || layer.geometry_type !== dominant))
```

The second part (`layer.geometry_type !== dominant`) fires even when the registry already has a correct, intentionally-set type. It should only fire when the type is the "Geometry" placeholder (meaning auto-detect mode).

### Fix

**File: `src/components/admin/GeoFileUploader.tsx`**

Change the auto-update condition (line 346-349) from:

```text
if (dominant !== "Mixed" &&
    (layer.geometry_type === "Geometry" || layer.geometry_type !== dominant))
```

To:

```text
if (dominant !== "Mixed" && layer.geometry_type === "Geometry")
```

This means the geometry type only gets auto-set during the very first upload when the layer was created with "Auto-detect" (stored as "Geometry"). Once a specific type is set -- either manually or from the first upload -- it will not be overwritten by subsequent uploads.

### What This Changes
- Only the auto-update condition in `GeoFileUploader.tsx` is modified (one line)
- No changes to the ingestion pipeline, map rendering, or layer management
- Layers with an already-set geometry type will keep that type regardless of what gets uploaded
- New "Auto-detect" layers will still get their type set from the first upload as expected
