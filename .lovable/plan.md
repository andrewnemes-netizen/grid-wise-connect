

## Fix NGED "No Usable Data Endpoint" Errors

### Root Cause

I examined the actual NGED CKAN API responses and the database. Here's what's happening:

**Of 90 NGED datasets discovered:**
- 42 are geospatial, but only 19 have any data endpoints (CSV/datastore)
- **23 geospatial datasets have ZERO data endpoints** — their CKAN packages only contain PDF attachments and links to `dataportal2.nationalgrid.co.uk` (a separate download portal requiring manual download of SHP/DWG files). These are the ones showing "No usable data endpoint" errors.
- 65 datasets have `endpoint_records` set (datastore-enabled CSVs), and 65 have `endpoint_export_csv` — these should be ingestable but some are non-geospatial

The crawler correctly discovers these datasets but sets `endpoint_records = null`, `endpoint_export_csv = null`, `endpoint_export_geojson = null` because the CKAN resources are just PDFs and external URLs. The ingest function then fails because there's literally no API to pull data from.

### Two Problems to Fix

**Problem 1: 23 datasets with no endpoints error out on Sync All**
These need to be gracefully skipped. The user wants them kept active but marked as non-ingestable.

**Problem 2: 17 datasets WITH valid endpoints haven't been tried yet (status = `never`)**
These need their error status reset so Sync All picks them up.

### Implementation

| Step | File | Change |
|------|------|--------|
| 1 | `supabase/functions/npg-dataset-ingest/index.ts` | In `ingestViaCkan`, before throwing "No usable data endpoint", return early with status `skipped` and a clear message ("Data only available via manual download from dataportal2.nationalgrid.co.uk") instead of throwing an error. Update the registry entry with `last_sync_status = 'skipped'` and a descriptive note. |
| 2 | `supabase/functions/nged-catalog-crawler/index.ts` | In `processPackage`, detect when resources are only PDFs/external links (no CSV, no GeoJSON, no datastore) and set a flag like `endpoint_notes: "Data available via dataportal2.nationalgrid.co.uk manual download only"` in the registry entry. This makes it clear in the admin UI why there's no endpoint. |
| 3 | `src/components/admin/NpgDatasetRegistry.tsx` | In `SyncStatus` component, add handling for `skipped` status to show a clear "No API — manual download" indicator instead of an error. In `handleSyncAll`, skip datasets where all three endpoints are null to avoid unnecessary function calls. |
| 4 | Migration | Reset the 22 errored NGED datasets: for those with valid endpoints, set status back to `never` so Sync All retries them; for those without endpoints, set status to `skipped` with a descriptive note. |

### Expected Outcome
- **17 datasets with valid CKAN datastore endpoints** will be ingested via Sync All (substation loading, capacity registers, connection queues, DFES, smart meter aggregated data, etc.)
- **23 datasets without endpoints** will show "Skipped — manual download only" instead of errors
- No more red error toasts flooding the admin UI during Sync All

