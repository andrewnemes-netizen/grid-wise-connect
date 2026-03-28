

## Fix Cadent Gas Ingestion — Two Distinct Errors

### Error 1: 403 ForbiddenAccess on Regional Pipe Datasets
**Datasets affected**: `gas-pipe-infrastructure_west-midlands_shared`, `_north-london_shared`, `_east-midlands_shared`, `_east_anglia_shared`

**Root cause**: These are restricted/shared datasets on Cadent's portal — even with the API key, they return 403. The main public pipe dataset is `gas-pipe-infrastructure-gpi_open` (the combined one). The regional `_shared` variants require elevated portal permissions.

**Fix**: The crawler discovered all 413 datasets including these restricted ones. The ingest function should gracefully handle 403 by marking those datasets as `skipped` with a clear message instead of erroring. This is a code change in `npg-dataset-ingest/index.ts` — when a 403 is received, update the registry entry status to `skipped` with note "403 — restricted dataset, elevated portal permissions required".

### Error 2: "Geometry has Z dimension but column does not" on `network_zones_test`
**Dataset**: `network_zones_test` (Cadent network boundary zones)

**Root cause**: Cadent's boundary polygons include Z coordinates (3D geometry like `[lon, lat, elevation]`). The database `geo_polygons` column is 2D only. The `promoteGeometry` function (line 835) handles type promotion (Polygon→MultiPolygon) but does NOT strip Z dimensions.

**Fix**: Add a `stripZ` helper function that recursively removes the third coordinate from all coordinate arrays, and call it inside `promoteGeometry` before returning.

### Changes

| # | File | Change |
|---|------|--------|
| 1 | `supabase/functions/npg-dataset-ingest/index.ts` | Add `stripZ()` function that recursively strips Z coordinates from geometry. Call it at the end of `promoteGeometry`. |
| 2 | `supabase/functions/npg-dataset-ingest/index.ts` | In `ingestViaRecords`, catch 403 responses and mark dataset as `skipped` instead of throwing an error. |

### Technical Detail

**stripZ function**:
```typescript
function stripZ(coords: any): any {
  if (typeof coords[0] === "number") {
    return coords.slice(0, 2); // [lon, lat, z] → [lon, lat]
  }
  return coords.map(stripZ);
}
```

Called in `promoteGeometry` before return:
```typescript
geom.coordinates = stripZ(geom.coordinates);
return geom;
```

**403 handling** in `ingestViaRecords` (around line 398):
```typescript
if (resp.status === 403) {
  console.warn(`[ingest] 403 Forbidden for ${entry.dataset_id} — marking as skipped`);
  await supabase.from("dno_dataset_registry").update({
    last_sync_status: "skipped",
    last_sync_error: "403 Forbidden — restricted dataset, elevated portal permissions required",
    last_sync_at: new Date().toISOString(),
  }).eq("id", entry.id);
  return { inserted: 0, skipped: 0 };
}
```

### Expected Outcome
- `network_zones_test` boundary polygons will ingest successfully (Z stripped)
- `gas-pipe-infrastructure-gpi_open` (main pipes) should ingest if not 403-blocked
- Regional `_shared` pipe datasets will show "Skipped — restricted" instead of red errors
- All other non-restricted Cadent datasets will sync normally

