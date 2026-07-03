
## Findings

All four UKPN LTDS tables that power substation headroom are **empty**:

| Table | Rows | Purpose |
|---|---|---|
| `ukpn_ltds_transformers_2w` | 0 | Firm capacity (MVA) — 2-winding |
| `ukpn_ltds_transformers_3w` | 0 | Firm capacity (MVA) — 3-winding |
| `ukpn_ltds_peak_demand_observed` | 0 | Observed peak MW/MVAr |
| `ukpn_ltds_peak_demand_true` | 0 | Weather-corrected peak MW/MVAr |

Registry status shows why:
- **Tables 2a / 2b / 3a / 3b**: `active=true`, `last_sync_status=never` — never ingested.
- **Tables 4a / 4b** (fault levels): `error` — "could not map any geometry". They were routed to the generic geospatial ingester (`npg-dataset-ingest`), which requires lat/lng. LTDS tables are **tabular**, so that ingester will always fail on them.
- **Table 5 / Table 8**: 404 — datasets renamed/removed on the UKPN portal.

The dedicated `ukpn-ltds-ingest` edge function already exists and correctly maps all six tabular tables (2a, 2b, 3a, 3b, 4a, 4b), but nothing currently triggers it — the admin UI (`NpgDatasetRegistry`) invokes `npg-dataset-ingest` for every registry row regardless of type.

**Headroom = firm capacity (2a/2b) − peak demand (3a/3b).** Both sides are empty, so no headroom is available today.

## Plan

1. **Route LTDS rows to the correct ingester** in `src/components/admin/NpgDatasetRegistry.tsx`:
   - When a registry row's `dataset_id` matches one of the six LTDS tabular datasets (`ltds-table-2a-transformer-2w`, `2b-...`, `3a-load-data-observed`, `3b-load-data-true`, `4a-3ph-fault-level`, `4b-earth-fault-level`), invoke `ukpn-ltds-ingest` with `{ registry_id, dataset_id }` instead of `npg-dataset-ingest`.
   - Keep everything else unchanged.

2. **Mark non-ingestable UKPN LTDS registry rows inactive** via a migration so they stop appearing as red errors:
   - `ltds-table-5-generation` (404 — dataset no longer exists)
   - `ltds-table-8-gt-95-perc-fault-data` (404)
   - `ltds-table-3a-load-data-observed-transposed` (duplicate of 3a in wide format — our ingester targets the long form)
   - `ltds-table-1-circuit-data`, `ltds-table-6-interest-connections` (no ingester defined, not headroom-critical)
   Set `active = false`, `last_sync_status = 'skipped'`, note in `last_sync_error`.

3. **Kick off ingest** by clicking Play in the registry for the four headroom-critical rows (2a, 2b, 3a, 3b). Verify row counts in `ukpn_ltds_transformers_2w` / `3w` / `peak_demand_observed` / `peak_demand_true` land > 0. Optionally trigger 4a/4b for fault-level completeness.

4. **Confirm headroom is queryable** with a spot-check SQL joining a sample `sitefunctionallocation` across 2a and 3b (`firm_capacity_mva − peak_mw/0.95`). No engine code changes needed — the feasibility engine already reads `nearest_substation.headroom_kw` from `assets`, which is populated once these tables have data.

## Out of scope

- Rebuilding the tabular ingester (it already exists and handles all six tables correctly).
- Fixing 404 datasets (they don't exist on UKPN's portal anymore).
- Any change to `feasibilityEngine.ts` or the substation lookup path — behavior is data-driven and unblocks automatically once tables populate.
