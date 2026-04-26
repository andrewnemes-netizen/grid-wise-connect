# Add SSEN Distribution Crawler (CKAN)

## What you saw

The portal in your screenshot is **`data.ssen.co.uk`** — SSEN **Distribution**'s data hub. It's a Datopian Portal.js frontend backed by a standard **CKAN** API at `https://ckan-prod.sse.datopian.com`. This is *different* from the existing `ssen-catalog-crawler`, which only targets `ssentransmission.opendatasoft.com` (Transmission, ~handful of datasets, Opendatasoft API).

So today we're missing the bulk of SSEN's distribution data: substations, overhead lines, underground cables, transformer details, etc.

## Yes, the CKAN docs are useful

The CKAN Action API (`/api/3/action/...`) maps cleanly onto what we already do for NGED/SPEN. Verified working:

- `GET /api/3/action/package_search?rows=1000&start=0` — list/page all datasets
- `GET /api/3/action/package_show?id=<slug>` — full dataset incl. resources (download URLs, formats, last_modified)
- `GET /api/3/action/organization_show?id=ssen-distribution` — confirm publisher
- DCAT export per dataset: `/dataset/<slug>.jsonld` (the JSON-LD button in your screenshot)

Resources inside each `package_show` give us direct download URLs (CSV / SHP / GeoJSON / GeoPackage) we can wire straight into the existing ingest pipeline.

## What I'll build

1. **New edge function `ssen-distribution-crawler`**
   - Paginates `package_search` against `https://ckan-prod.sse.datopian.com/api/3/action/`
   - For each package, normalises into `dno_dataset_registry` rows under DNO key `SSEN` (sub-key/source field `ssen-distribution` to distinguish from Transmission)
   - Picks the best resource per dataset for ingestion (priority: GeoPackage > Shapefile > GeoJSON > CSV)
   - Detects geospatial vs tabular, sets `geometry_type` and `storage_table` using the same logic as the Opendatasoft crawler
   - Same admin auth, audit_log, and exponential-backoff retry as the existing crawler

2. **Rename existing crawler conceptually**
   - Keep `ssen-catalog-crawler` (Transmission) as-is — no breaking changes
   - Tag rows it produces with a `source: 'ssen-transmission'` marker in `meta_json` so Distribution and Transmission don't collide on `(dno, dataset_id)`. If we hit a slug clash, prefix Transmission `dataset_id` with `tx-`.

3. **Update `NpgDatasetRegistry.tsx` (DNO dropdown)**
   - SSEN entry now lists **two** crawlers in a small sub-menu: "Transmission" → `ssen-catalog-crawler`, "Distribution" → `ssen-distribution-crawler`
   - Portal URL field shows whichever was last run

4. **Extend `auto_create_dno_layers` SQL function**
   - Add Distribution-flavoured match patterns (HV/LV substations, primary substations, 33kV/11kV/LV OHL & UG cables, distribution transformers, etc.) on top of the Transmission ones already added in the last migration

## Technical notes

- CKAN endpoint is fully public — no API key, no auth header needed
- `package_search` returns `result.results[]` and `result.count`; loop until `start + rows >= count`
- Resource URL for a typical SSEN dataset looks like `https://ckan-prod.sse.datopian.com/dataset/<slug>/resource/<uuid>/download/<filename>.gpkg`
- These can be passed to the existing `ingest-geo-features` / `npg-dataset-ingest` pipelines without change
- Rate limit: 200 ms between pages, retry on 429 (same pattern as today)

## Out of scope

- Ingesting the data itself (this PR only registers datasets; the existing "Auto-Create & Link Layers" + ingest buttons handle the rest)
- ArcGIS Hub fallback for legacy `ssen.co.uk` URLs (not needed — everything we want is in CKAN)
