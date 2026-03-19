

## End-to-End NPG Retest Results

### Test Summary

| Dataset | Records | Status | Notes |
|---------|---------|--------|-------|
| Smart Meter Penetration | 34 | **32 inserted** | Working |
| NDP Planned Interventions | 279 | **265 inserted** | Working |
| ECR 1MW+ | 950 | **950 inserted** | Working |
| Flexibility Dispatch | 1,149 | **1,149 inserted** | Working |
| SLC31E Procurement | 831 | **831 inserted** | Fixed (batch sizing) |
| LCT Postal Sectors | 1,254 | **1,215 inserted** | Fixed (geometry type) |
| Carbon Intensity by GSP | 3,249 | **0 inserted** | New bug found |
| 33kV Live Ops | 855k | **Not attempted** | Tabular, needs enrichment |

### New Bug: Geometry Priority in Records Mode

**Root cause**: In `mapOdsRecordToRow`, `geo_point_2d` is checked before `geo_shape` (lines 416-431). For Carbon Intensity, both fields exist. The function picks `geo_point_2d` (Point), then `promoteGeometry` rejects it because the target table is `geo_polygons`. All 3,249 records are silently skipped.

The GeoJSON export mode doesn't have this problem because the export already resolves to the correct geometry. But the export hits **Memory limit exceeded** for this dataset (3,249 complex polygons), so it must fall back to records mode, where this bug triggers.

**Fix**: When the storage table is `geo_polygons` or `geo_constraints`, check `geo_shape` first. Only fall back to `geo_point_2d` if `geo_shape` is absent.

### Implementation

**File**: `supabase/functions/npg-dataset-ingest/index.ts`

In the `mapOdsRecordToRow` function (around line 415), reorder geometry extraction:

1. If `storageTable` is `geo_polygons` or `geo_constraints`, try `geo_shape` first, then `geo_point_2d` as fallback
2. Otherwise, keep current order: `geo_point_2d` first (faster for point tables)

This is a ~10-line change in the geometry resolution logic. After fixing, redeploy and re-ingest Carbon Intensity via records mode.

### Secondary: Auto-fallback from Export to Records

Currently if a GeoJSON export hits memory limits, the function crashes. Add a try/catch around the export fetch that falls back to records mode automatically for large polygon datasets. This prevents the need to manually switch modes.

### Files to Change

- `supabase/functions/npg-dataset-ingest/index.ts` — Reorder geometry priority based on storage table; add export-to-records fallback

