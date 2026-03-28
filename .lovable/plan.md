

## NPG Registry ↔ GIS Map — End-to-End Audit Results

### Current State Summary

**Data IS in the database** — the ingestion pipeline works. But several layers appear empty on the map due to stale metadata and configuration issues.

### Issues Found

**1. Stale `feature_count` on 6 layers (data exists but count = 0)**

These layers have real data but `layer_registry.feature_count` was never updated (the 55s timeout killed the background job before the count update ran):

| Layer | Actual Rows | Displayed Count |
|-------|------------|-----------------|
| EHV & HV Supports | 447,000 | 0 |
| Embedded Capacity Register | 8,993 | 0 |
| Substation Map Data - Table | 2,680 | 0 |
| Carbon Intensity by GSP | 3,556 | 0 |
| Substation Sites | unknown | 0 |
| LV Support | 74,500 | 30,000 (stale) |

The count is cosmetic in the toggle panel but signals "empty" to admins.

**2. Disabled layers that have data**

`npg_cables_hv` (HV Underground Cables) has 10,000 rows but `enabled = false` — it won't appear in the layer toggle panel at all.

**3. Geometry type "Geometry" on 3 layers**

`lv_support`, `npg_network_development_plan_thermal_demand_headroom`, and `heatmap_test_substations` have `geometry_type = 'Geometry'` instead of a specific type. The `getRenderType()` function in `mapLayers.ts` defaults to `"circle"` for unrecognized types, which works for points but would break if the data contained lines or polygons.

**4. 55-second timeout too aggressive**

The `EdgeRuntime.waitUntil` timeout of 55s kills large ingests (447k supports, 74k LV supports) before they complete and before `feature_count` gets updated. The `waitUntil` API allows up to 150s in Deno Deploy.

**5. Duplicate layer entries**

`npg_cables_hv` (disabled, 10k rows from NPG API) duplicates `hv_underground_cable` (enabled, 262k rows from manual upload). Same for some feeder layers.

### Fix Plan

**Fix 1: Database migration — sync feature_counts and enable layers**

Run a single SQL migration that:
- Updates `feature_count` for all NPG layers from actual row counts in storage tables
- Enables `npg_cables_hv` (or merges its data into the existing `hv_underground_cable` layer)
- Sets `geometry_type` to `'Point'` for `lv_support` and `npg_network_development_plan_thermal_demand_headroom` (their data is points)

**Fix 2: Increase background timeout from 55s to 150s**

In `npg-dataset-ingest/index.ts`, change the timeout from 55,000ms to 150,000ms. Edge functions support up to 150s for background tasks via `waitUntil`.

**Fix 3: Move feature_count update BEFORE the timeout boundary**

Restructure `performIngest` to update `feature_count` as part of the success status update (lines 219-232), ensuring it runs even if the timeout fires. Better: update count incrementally after each batch insert rather than a single count query at the end.

### Files to Change

| File | Change |
|------|--------|
| Database migration | Sync feature_counts from actual data, enable npg_cables_hv, fix geometry_type for Geometry layers |
| `supabase/functions/npg-dataset-ingest/index.ts` | Increase timeout to 150s; update feature_count after each batch |

