## What’s causing the errors

There are two separate issues:

1. **NIE ingest rows showing Error / Processing**
   - Some NIE datasets are very large and the ingest function runs them in background chunks, so `Processing...` / `partial` is expected while it continues.
   - Several rows timed out because large datasets were started concurrently and each background run has a short execution window.
   - Two datasets are not mapping geometry correctly because NIE exposes conductor/fault data differently from the point assets the current parser expects.
   - The previous “table mismatch” warning is mostly resolved for linked rows; one unlinked legacy row still exists.

2. **Runtime app error: `Cannot read properties of undefined (reading 'getLayer')`**
   - This is from `MapView.tsx` cleanup code calling MapLibre after the map/style object has already been torn down during route changes.
   - It is a frontend lifecycle guard issue, separate from the NIE ingest failures.

## Plan

1. **Harden MapView cleanup**
   - Add safe map/layer/source cleanup guards so `getLayer`, `removeLayer`, and `removeSource` are only called when the map style is still available.
   - This should stop the preview runtime error.

2. **Fix NIE dataset classification**
   - Update the NIE crawler’s storage-table inference so point datasets default to `geo_points`, not `geo_substations`.
   - Keep specifically substation/transformer/site datasets linked to the intended asset layers via the existing auto-layer logic.

3. **Improve NIE geometry ingestion**
   - Extend the ingest parser for NIE datasets that return coordinate columns or nested geometry fields instead of the standard exported GeoJSON shape.
   - For line/conductor datasets, avoid marking them as point-layer failures when the source is actually line/network geometry.

4. **Make large NIE ingests less error-prone**
   - Adjust the sync flow so very large datasets continue/resume cleanly instead of surfacing timeout rows as hard errors.
   - Keep the UI clear by showing `partial/processing` as background progress rather than a failure.

5. **Clean current stale NIE statuses**
   - Add a small data correction for stale NIE rows: align linked storage table values where needed and reset stale timeout rows with saved cursors so they can resume cleanly.

6. **Validate**
   - Check backend logs for `npg-dataset-ingest` after the changes.
   - Verify the admin table no longer shows avoidable table mismatch/runtime errors and that successful NIE rows continue to populate their layers.