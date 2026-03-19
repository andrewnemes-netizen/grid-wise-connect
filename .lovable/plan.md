

## End-to-End NPG GIS Layer Fix Plan

### Test Results Summary

I ran live ingestion tests against the NPG portal. Here's what I found:

| Dataset | Records | Result | Issue |
|---------|---------|--------|-------|
| Smart Meter Penetration | 34 | **32 inserted** | Working |
| NDP Planned Interventions | 279 | **265 inserted** | Working |
| ECR 1MW+ | 950 | **950 inserted** | Working |
| Flexibility Zones | 2298 | **Already ingested** | Working |
| LCT Postal Sectors | 1254 | **0 inserted, all skipped** | Geometry mismatch |
| Carbon Intensity by GSP | 3249 | **HTTP 403** | API auth not applied |
| SLC31E Procurement | 831 | **Statement timeout** | Batch too large for polygons |
| 33kV Live Ops | 855k | **HTTP 403** | Tabular, needs enrichment mode |

### Issues Found (3 bugs to fix)

**Bug 1: Batch insert timeout for polygon data**
The `batch_insert_geo_features` RPC processes 500 features per batch. For complex polygon geometries, `ST_GeomFromGeoJSON` is slow and causes statement timeouts. SLC31E (831 polygon records) and Carbon Intensity (3249) both fail.

**Fix:** Reduce batch size dynamically based on storage table. Use 50 for `geo_polygons`/`geo_constraints`, keep 500 for point/line tables.

**Bug 2: LCT Postal Sectors geometry mismatch**
The LCT dataset has both `geo_point_2d` (Point) and `geo_shape` (Polygon). The GeoJSON export uses `geo_shape` as the primary geometry, producing Polygons. But the layer is registered as Point → `geo_points`. The `promoteGeometry` function rejects Polygons for a Point target, so all 1254 records are skipped.

**Fix:** Change the LCT layer registry entry from `geo_points`/Point to `geo_polygons`/Polygon, since the shapes represent postal sector boundaries (polygons are more useful than centroids).

**Bug 3: Carbon Intensity & 33kV Live Ops still return 403**
The NPG_API_KEY was added but these datasets may require it in a different header format, or the previous sync ran before the key was saved. Need to verify the key is being sent correctly and retry.

**Fix:** The key is already in the code (`Authorization: Apikey ${apiKey}`). These just need a retry now that the key is configured. If 403 persists, add a fallback to try `apikey` query parameter.

### Implementation Steps

1. **Reduce polygon batch size in edge function** — Change `batchSize` from fixed 500 to dynamic: 50 for polygon/constraint tables, 200 for feeders/cables, 500 for point tables.

2. **Fix LCT layer registry** — Update `npg_lct_postal_sector` from `storage_table: geo_points, geometry_type: Point` to `storage_table: geo_polygons, geometry_type: Polygon`.

3. **Add API key fallback** — If `Authorization: Apikey` header returns 403, retry with `?apikey=` query parameter as some ODS endpoints prefer that format.

4. **Add statement timeout override** — Set `SET LOCAL statement_timeout = '120s'` at the start of `batch_insert_geo_features` RPC to prevent premature cancellation.

5. **Verify map rendering** — The map rendering pipeline (`get_geo_layer_geojson` RPC → `fetchLayerGeoJSON` → `addRegistryLayerToMap`) already handles all storage tables. The 4 successfully ingested layers (Smart Meter, NDP Interventions, ECR, Flexibility Zones) should render correctly on the map.

### Files to Change

- `supabase/functions/npg-dataset-ingest/index.ts` — Dynamic batch sizing + API key fallback
- Database migration — Update LCT layer registry entry + extend `batch_insert_geo_features` timeout

