

## NPG End-to-End Fix Plan

### Current State (from DB audit)

- 96 total NPG datasets discovered, only **8 active**, only **6 linked** to layers
- Of those 6 linked datasets:
  - **2 SUCCESS**: `embedded-capacity-register` (950 rows), `embedded-capacity-register-part-2` (1731 rows)
  - **1 ERROR**: `3_day_gsp_carbon_intensity` — 502 Bad Gateway from Supabase RPC (batch_insert overwhelmed by concurrent syncs)
  - **2 STUCK "processing"**: `ehv-and-hv-supports-location` (storage mismatch: dr=geo_substations, lr=geo_points), `npg-live-33kv-circuit` (tabular, no geometry, linked to geo_feeders)
  - **1 FALSE SUCCESS**: `30_day_gsp_carbon_intensity` — 0 rows inserted, 27434 skipped (tabular, no geometry)
- **3 storage table mismatches** between dataset registry and layer registry
- Many important spatial datasets (Distribution Sub Service Areas, HV Underground Cables, Substation Sites, etc.) are inactive and unlinked

### Root Causes

1. **Concurrent "Sync All" overwhelms Supabase** — fires all ingests simultaneously, causing 502 from PostgREST
2. **Storage table mismatches** — `promoteGeometry` rejects features when dataset registry says `geo_substations` but layer says `geo_points`
3. **Tabular datasets linked to spatial layers** — no geometry to extract, all records skipped
4. **Stuck "processing" status** — background jobs that fail silently never update status back
5. **Most datasets not activated or linked** — only 8 of 96 are active

### Fixes

**Fix 1: Sequential "Sync All" with delay**

In `NpgDatasetRegistry.tsx`, change the "Sync All Active" handler to process datasets sequentially (one at a time with a 2s gap) instead of firing all concurrently. This prevents 502s from overwhelming the database.

**Fix 2: Fix storage table mismatches via migration**

```sql
-- ehv-and-hv-supports-location: registry says geo_substations, layer says geo_points → update registry
UPDATE dno_dataset_registry SET storage_table = 'geo_points' 
WHERE dataset_id = 'ehv-and-hv-supports-location' AND dno = 'NPG';

-- Clear stuck processing statuses
UPDATE dno_dataset_registry SET last_sync_status = 'never', last_sync_error = NULL 
WHERE last_sync_status = 'processing' AND dno = 'NPG';
```

**Fix 3: Skip tabular datasets in Sync All**

In the ingest function, if `is_geospatial = false` and the layer expects spatial data (geo_polygons/feeders/cables), return early with a clear "skipped: tabular data" status instead of attempting ingestion.

**Fix 4: Auto-link more datasets to existing layers**

Run a migration that links unlinked active geospatial datasets to matching layer_registry entries based on name/category matching, and activate key datasets that have matching layers (e.g., `substation_sites_list` → Substation Sites, `distribution-substation-service-areas` → Distribution Sub Service Areas, etc.).

**Fix 5: Timeout guard in background ingest**

Wrap `performIngest` in a try/catch that always updates the registry status, even if the background job crashes. Add a `setTimeout` safety net that marks the job as "error" if it hasn't completed within 55 seconds.

### Files to Change

| File | Change |
|------|--------|
| `src/components/admin/NpgDatasetRegistry.tsx` | Sequential sync with delays; skip tabular datasets; clear stuck statuses |
| `supabase/functions/npg-dataset-ingest/index.ts` | Early return for tabular→spatial mismatches; timeout safety net; use layer's storage_table (not registry's) consistently |
| Database migration | Fix mismatches, clear stuck statuses, auto-link key datasets |

