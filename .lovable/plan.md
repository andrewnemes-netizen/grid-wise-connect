# Delivery Matrix — "duplicate key" fix

## Root cause (confirmed)

`site_stage_status` has a **global** unique index on `(site_id, stage)` — not scoped by work package. However `WpMatrixTab` loads existing rows filtered by `work_package_id = <current WP>`, then decides insert-vs-update from that cache. If a site's stage row is attached to a different WP (which is the case for 17 Bircham View — its rows live under WP `f66a264f…` while the user is viewing WP `fbaa6ae3…`, most likely after a Move Site or a legacy `wp_sites_ensure_stage` run), the cache misses, the code takes the `insert` branch, and the (site_id, stage) unique index rejects it — surfacing as the toast in the screenshot.

The same issue also exists in the per-cell editor dialog further down `WpMatrixTab.tsx` (mirrors the insert/update branch).

## Fix

In `src/pages/wp/tabs/WpMatrixTab.tsx`:

1. Replace the insert/update branching in the `setStatus` mutation with a single `.upsert(..., { onConflict: "site_id,stage" })`, always writing the **current** `work_package_id` so the row re-attaches to the WP the user is editing from.
2. Do the same in the cell-editor `save` mutation (`patch` upsert with `onConflict: "site_id,stage"`).
3. No schema change — the existing unique index is exactly what upsert needs.

## Verification

- Change a DNO cell on 17 Bircham View from the Matrix → no toast, cell persists, and the row's `work_package_id` in `site_stage_status` flips to the current WP.
- Change a cell on a site whose row is already attached to this WP → still updates in place.
- Open the cell editor (dates / owner / notes) on any site → save works without duplicate-key errors.
