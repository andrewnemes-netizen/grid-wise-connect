

## Finish ENWL & SPEN Ingestion — Current Status & Fix Plan

### Current State

| DNO | Layers | Populated | Empty | Root Causes |
|-----|--------|-----------|-------|-------------|
| **ENWL** | 21 | 6 | 15 | 20 datasets never synced (status `processing` stuck or `never`); 6 failed with timeouts (150s limit); 2 failed with 403 Forbidden |
| **SPEN** | 18 | 9 | 9 | 3 datasets hit 403 Forbidden (GIS Line/Point assets, Secondary Substations); 3 timed out (LV Monitoring, Smart Meter); 4 never synced |

### Three Issues To Fix

**Issue 1: Stuck "processing" datasets (ENWL)**
Multiple ENWL datasets show `last_sync_status = 'processing'` but `last_sync_at IS NULL` — they were never actually sent to the ingest function. This happened because the bulk activation migration set them active, but the "Sync All" button was never clicked for them, OR they got stuck without the timeout catching them. Fix: reset these to `never` so "Sync All" picks them up cleanly.

**Issue 2: 150s timeout on large datasets**
Datasets like ENWL LV Overhead Conductors (47k rows), ENWL DFES LV Headroom (61k rows), SPEN LV Monitoring (45k rows), and SPEN Smart Meter datasets (15k-35k rows) all exceed the 150s background timeout. The ingest function fetches via paginated Records API at 100 rows/page, which is too slow for large datasets. Fix: increase batch size from 100 to 500 for Records API pagination and increase timeout to 280s.

**Issue 3: 403 Forbidden on certain datasets**
ENWL `dfes-2024-bsp-sites` and SPEN `spd_spt_gis_shapefiles_line_assets`, `spd_spt_gis_shapefiles_point_assets`, and `secondary_substation_polygons` return 403 errors. These datasets require special API permissions or are not publicly accessible even with the API key. Fix: mark these as `active = false` with a clear error note so they don't block "Sync All", and log them as access-restricted.

### Implementation Steps

| Step | File | Change |
|------|------|--------|
| 1 | New migration | Reset stuck `processing` datasets (where `last_sync_at IS NULL`) back to status `never`; deactivate 403-blocked datasets with error note |
| 2 | `supabase/functions/npg-dataset-ingest/index.ts` | Increase Records API page size from 100 to 500; increase background timeout from 150s to 280s; add early exit if total records exceeds 10k (Opendatasoft hard limit) to avoid wasted pagination |
| 3 | `supabase/functions/npg-dataset-ingest/index.ts` | For GeoJSON export mode, add streaming fetch with `response.body` reader to handle large exports without OOM |

### After Implementation

1. Go to **Admin → DNO Registry → ENWL** → click **"Sync All Active"** — the 20+ unsynced datasets will now process with faster pagination
2. Switch to **SPEN** → click **"Sync All Active"** — the 4 unsynced datasets will process
3. Datasets that previously timed out should now complete within the 280s window
4. 403-blocked datasets will be deactivated and clearly flagged — these need different API permissions from the DNO

### Expected Outcome After Sync

- **ENWL**: ~15 more layers populated (Substations, DFES Forecasts, Overhead Conductors, Service Areas, Flexibility Sites, etc.)
- **SPEN**: ~5 more layers populated (DFES Polygons, LV Monitoring, Smart Meter, Secondary Substations — minus the 403-blocked ones)
- Total new features: estimated 50-100k across both DNOs

