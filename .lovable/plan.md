

## NPG Dataset Ingestion — End-to-End Audit & Fix Plan

### Issues Found

**1. Crawler geometry detection bug (root cause of most failures)**
The catalog crawler picks the FIRST geo field it encounters. Many NPG datasets have BOTH `geo_point_2d` AND `geo_shape` fields. The crawler finds `geo_point_2d` first, marks the dataset as "Point", and sets `storage_table: geo_substations`. But the actual useful geometry lives in `geo_shape` (polygons/lines).

Affected datasets: Distribution Substation Service Areas, HV Overhead Feeders, LV Overhead Feeders, IDNO Regions, and more.

**2. 403 errors on exports**
Two datasets fail with HTTP 403: `3_day_gsp_carbon_intensity` and `npg-live-33kv-circuit`. The `fetchWithRetry` function passes the API key via header auth, and falls back to query param — but the GeoJSON/CSV export URLs may need the key appended differently. The export URLs are bare (no auth params), and the retry logic only tries query param fallback on the first attempt.

**3. Tabular datasets linked to spatial layers**
`30_day_gsp_carbon_intensity` (tabular, no geometry) is linked to a polygon layer. `npg-live-33kv-circuit` (tabular, 855k time-series records) is linked to a feeders layer. These are operational time-series data meant for enrichment of existing features, not spatial ingestion. The ingest function correctly rejects them (no geometry → null → skipped), but this isn't communicated clearly.

**4. Storage table mismatches between dataset registry and layer registry**
The ingest function uses `layerRow.storage_table` (correct), but `promoteGeometry` will reject features where the geometry family doesn't match the target table. For example, HV Overhead Feeders has polygon `geo_shape` but the layer expects `LineString` — these are coverage area polygons, not cable routes.

### Fixes

**Fix 1: Crawler — prefer `geo_shape` over `geo_point_2d`**

In `npg-catalog-crawler/index.ts`, change the geometry field detection to prioritise `geo_shape` (which contains actual polygons/lines) over `geo_point_2d` (which is just a centroid). Also fix the `storage_table` guess accordingly.

```text
Before: finds first field with type geo_point_2d or geo_shape
After:  prefers geo_shape if both exist → sets geometry_type and storage_table correctly
```

**Fix 2: Ingest — pass API key to all export fetches**

The `ingestViaGeoJsonExport` and `ingestViaCsvExport` functions already pass `apiKey` to `fetchWithRetry`. But `fetchWithRetry` uses `Authorization: Apikey ${apiKey}` header which some ODS export endpoints reject. Fix: always append `?apikey=` to export URLs when API key is available, since exports are simple file downloads that don't accept header auth consistently.

**Fix 3: Ingest — use `geo_shape` for GeoJSON exports when layer expects polygons/lines**

When the linked layer's `storage_table` is `geo_polygons`, `geo_feeders`, or `geo_cables`, and the GeoJSON export features contain Point geometry (from the centroid), fall back to records mode which can extract `geo_shape` properly.

**Fix 4: Registry data cleanup migration**

Update existing registry rows to correct the `geometry_type` and `storage_table` for datasets that have `geo_shape`:
- Datasets with both `geo_point_2d` and `geo_shape` → set `geometry_type` to the shape type
- Mark tabular time-series datasets (`npg-live-*`) with a flag so the UI shows them as "enrichment only"

**Fix 5: UI — show sync issues clearly**

Add a warning badge when a dataset's `storage_table` doesn't match its linked layer's `storage_table`. Add a "Sync All Active" button to batch-ingest all active+linked datasets.

### Files to Change

| File | Change |
|------|--------|
| `supabase/functions/npg-catalog-crawler/index.ts` | Prefer `geo_shape` over `geo_point_2d` in geometry detection; fix storage_table guess |
| `supabase/functions/npg-dataset-ingest/index.ts` | Append API key as query param for exports; fallback to records mode when export geometry mismatches layer |
| `src/components/admin/NpgDatasetRegistry.tsx` | Add mismatch warnings, "Sync All Active" button |
| Database migration | Update existing registry rows with corrected geometry_type and storage_table |

