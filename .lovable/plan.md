## Why no SSEN data shows on the map

The SSEN layers are correctly created and linked, but every storage table is empty (`last_sync_rows = 0`). Two root causes:

**1. SSEN Transmission (Opendatasoft) — silent empty exports**
The `/exports/geojson` and `/records` endpoints on `ssentransmission.opendatasoft.com` are gated:
- Without the API key they return **HTTP 200 with `{"features": []}`** (or 403 for records).
- The ingest function (`npg-dataset-ingest`) doesn't pass `SSEN_API_KEY`, so it streams zero features and marks the run **`success` / 0 rows**.
- Verified directly: same endpoint returns 3,714 features when the `Apikey` header is sent.

**2. SSEN Distribution (CKAN at `data-api.ssen.co.uk`)** is fronted by Cloudflare and rejects plain server-to-server calls (HTTP 403). The CKAN path in `npg-dataset-ingest` therefore also writes nothing.

A couple of one-off errors are also present (`dx-generation-availability...` duplicate-key, `dx-grid-supply-point...` timeout) — secondary to the above.

## Fix plan

### A. Make `npg-dataset-ingest` use `SSEN_API_KEY` for SSEN Transmission
- Detect SSEN Transmission by host (`endpoint_export_geojson`/`endpoint_records` includes `ssentransmission.opendatasoft.com`) **or** `dno === 'SSEN'` and `dataset_id` does **not** start with `dx-`.
- Read `Deno.env.get('SSEN_API_KEY')` once and pass it as the `apiKey` argument into `ingestViaGeoJsonExport`, `ingestViaRecords`, `ingestViaCsvExport`, and the partitioned path. (`fetchWithRetry` already adds `Authorization: Apikey <key>` when given a key.)
- Guard so the SSEN key is **not** sent to non-SSEN hosts (NPG/UKPN/SPEN/etc.).

### B. Treat "0 rows from a non-empty source" as a soft failure
- If `record_count > 0` but `inserted === 0 && skipped === 0`, set `last_sync_status = 'error'` with message `Source returned 0 features (auth/API key?)` instead of `success`. Prevents the same silent miss in future and surfaces the issue in the registry UI.

### C. Re-run ingestion for SSEN
- Reset `last_sync_status` to `pending` for all SSEN rows currently at `success`/`0 rows` so the registry UI shows them as needing a refresh.
- Re-ingest from the LA/Admin "DNO Dataset Registry" using the existing batched dispatch loop. The Transmission layers (Overhead Lines, Poles, Towers, Substation Sites, EGL2, Planning Corridors, GI Points) will then populate and become visible.

### D. SSEN Distribution (CKAN) — separate workstream
- CKAN endpoint is Cloudflare-blocked from edge functions. Options to evaluate after Transmission is working:
  1. Try sending a real browser `User-Agent` + `Accept` header (cheap; may pass Cloudflare's bot check).
  2. If still blocked, fall back to the **resource download URLs** (CSV/GeoJSON on `data.ssen.co.uk`) which are normally served from CDN without the bot check.
  3. As a last resort, mark Distribution datasets as "manual upload" in the UI (same pattern used for NGED Shapefiles).
- I'll wire option 1 first and only move to 2/3 if it keeps failing.

### E. Clean up the two outliers
- `dx-generation-availability...`: clear the offending rows for that `layer_id` before re-ingest to avoid the unique-constraint clash.
- `dx-grid-supply-point...`: large polygon dataset — route through the GeoJSON streaming export rather than records to avoid the 60s edge-function timeout.

### Technical notes (for reference)
- Files touched: `supabase/functions/npg-dataset-ingest/index.ts` (auth + soft-failure logic), one short SQL migration to reset statuses and clear the conflicting `geo_points` rows for the duplicate-key dataset.
- No frontend changes required for A–C; map will populate as soon as ingest completes.

## Expected outcome
After A + C run, the panel layers in the screenshot (SSEN Substation Sites, Towers, Overhead Lines, Poles, EGL2, Planning Corridors, GI Points) will show ~3k–13k features each on the map across northern Scotland and the EGL2 corridor.
