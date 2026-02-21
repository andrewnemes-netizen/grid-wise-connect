
## Fix: Admin Layer Upload "Refreshing" Issue

### Problem
When uploading datasets in the Admin Layers panel, two issues prevent successful uploads:

1. **Geometry mismatch false alarm**: The client-side compatibility check shows a red error-like warning when uploading Polygon/MultiPolygon files to a substations layer (`geo_substations`), even though the server-side ingestion function already converts these to Point centroids automatically. This discourages users from proceeding.

2. **Dialog instability**: Background query refetching can cause the upload dialog to unmount mid-upload, making it appear as though the page "refreshed." While there's a guard on `toggleMut`, other invalidation paths or React Query's `refetchOnMount` behavior when the component re-renders can still trigger this.

### Changes

**File: `src/components/admin/GeoFileUploader.tsx`**
- Update the `EXPECTED_GEOM` map for `geo_substations` to include `"Polygon"` and `"MultiPolygon"` as accepted types, since the server automatically converts these to Point centroids. This removes the false geometry mismatch warning.
- Change the warning from a destructive/error style to an informational amber/warning style, and update the text to say the server will auto-convert rather than saying "upload will likely fail."

**File: `src/components/admin/LayerManagement.tsx`**
- Disable all background refetching of the `admin-layers` query while the upload dialog is open by setting `refetchInterval: false` and `enabled` conditionally, or by wrapping the invalidation calls more carefully.
- Add `refetchOnMount: false` and `refetchOnReconnect: false` to the layers query to prevent any automatic refetch that could unmount the upload dialog during an active upload.

### Technical Details

The `EXPECTED_GEOM` map change (GeoFileUploader lines 441-448):
```typescript
// Before
geo_substations: ["Point"],

// After  
geo_substations: ["Point", "Polygon", "MultiPolygon"],
```

The warning style change (line 458):
- Change from `border-destructive/50 bg-destructive/10 text-destructive` to `border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400`
- Update text to: "Your file(s) contain {detectedSet} geometry. The server will auto-convert to Point centroids for this layer."

For dialog stability, ensure the layers query has `refetchOnWindowFocus: false` (already present), add `refetchOnReconnect: false`, and wrap the upload dialog's `onComplete` callback to only invalidate after the dialog is fully closed.
