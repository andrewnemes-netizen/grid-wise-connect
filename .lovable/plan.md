

## Fix: SSEN Substation Layer Not Appearing on Map

### Root Cause

Two issues are preventing the SSEN layer from displaying:

1. **geometry_type is "Geometry" instead of "Point"** -- The auto-detect feature was supposed to update this after upload, but the layer's `geometry_type` in the database is still set to the placeholder value "Geometry". While the rendering code defaults to circles for unknown types (which would work), this could cause subtle issues with feature caps and other geometry-type-dependent logic.

2. **min_zoom is 8, but the map starts at zoom 6** -- When you toggle the layer on at the default zoom level, the layer manager checks `min_zoom` and skips loading entirely because zoom 6 < 8. The layer silently does nothing -- no toast message explains why.

### What Will Change

**1. Fix the geometry_type in the database**
- Run a migration to update the SSEN layer's `geometry_type` from "Geometry" to "Point" since all 6,500 features are confirmed Points.

**2. Fix the auto-detect update logic**
- In `GeoFileUploader.tsx`, ensure the post-upload code that updates `layer_registry.geometry_type` actually fires correctly when the current type is "Geometry" (the auto-detect placeholder).

**3. Add a user-friendly toast when min_zoom blocks a layer**
- In `useLayerManager.ts`, when a user toggles on a layer but `currentZoom < min_zoom`, show a toast like "Zoom in to see SSEN Substation Data (min zoom: 8)" instead of silently doing nothing.

### Technical Details

**Database migration:**
- `UPDATE layer_registry SET geometry_type = 'Point' WHERE id = 'ea9ab4df-...' AND geometry_type = 'Geometry'`

**File: `src/hooks/useLayerManager.ts`**
- In the `loadLayer` function (around line 118-121), add a toast notification when `currentZoom < layer.min_zoom` so users know why the layer isn't appearing
- Example: `toast({ title: layer.display_name, description: "Zoom in to view this layer" })`

**File: `src/components/admin/GeoFileUploader.tsx`**
- Review the post-upload geometry_type update logic to ensure it triggers when `geometry_type === 'Geometry'`

### Files Modified
- Database migration (update geometry_type for SSEN layer)
- `src/hooks/useLayerManager.ts` -- add min_zoom toast feedback
- `src/components/admin/GeoFileUploader.tsx` -- fix auto-detect update condition

