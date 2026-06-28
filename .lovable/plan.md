## Why the Records column says 0

The "Records" column reads `record_count` — the **source catalog's advertised row count**, populated by the crawler. SSEN Distribution's CKAN crawler can't get a row count from a CSV/GeoJSON file resource (CKAN exposes file links, not a count), so it stores `0` for every `dx-*` entry.

The numbers you actually ingested live in `last_sync_rows` and are already shown under **Last Sync** (e.g. "1,019 rows" on Generation Availability, 234,900 on SSEN Substation Data). So the data is in — the column just isn't showing it.

DB confirms it:
- `dx-generation-availability…` → `record_count=0`, `last_sync_rows=1019`, `success`
- `dx-ssen-substation-data` → `record_count=0`, `last_sync_rows=234900`, `processing`
- `dx-embedded_capacity_register` → still `processing` (CSV is large, self-continuing)

## Fix

Frontend-only change in `src/components/admin/NpgDatasetRegistry.tsx` (line ~741):

- Render `ds.last_sync_rows || ds.record_count` in the Records column, formatted with thousands separators.
- When `last_sync_rows > 0` but `record_count === 0` (typical for CKAN/CSV sources), show a small "ingested" hint below the number so it's obvious the count comes from the last sync, not the source catalog.
- Keep the existing source-count display when the crawler did populate `record_count` (NPG, UKPN, SSEN-T Opendatasoft datasets).

## Also — separate observation, not part of this fix

Several `dx-*` rows show `error` (`dx-realtime_outage_dataset`, `dx-technicallimits`, `dx-shepd_network_development_report`, etc.). Those are real failures and want a follow-up pass once the column fix is in, but they're not what this question was about.

## Files touched
- `src/components/admin/NpgDatasetRegistry.tsx` — one cell render.

No backend, no schema, no edge-function changes.