## Goal

Commercial estimating in Gridwise OS becomes exactly two tabs. Each name keeps its meaning, but the underlying engine is swapped to the correct one:

- **EV Build Estimates** — uses the existing **Site Estimates** engine (`SiteEstimatesPanel`, synthetic rates). This is the current "Site Estimates" tab, just renamed back to its correct business name.
- **PoC Estimates** — uses the existing group-based **Estimates** engine (`EstimatesTab`). The current bespoke PoC editor is retired.
- The standalone "Estimates" tab is removed. All existing PoC data in `poc_estimates` / `poc_estimate_lines` is archived to `deleted_entities` and the tables are dropped.

Existing EV Build flow, line items and billing logic stay untouched.

## Changes

### 1. Sidebar & routes (`src/components/wp/WpSidebar.tsx`, `src/pages/WorkPackageShell.tsx`)

Commercial group becomes:

```text
- EV Build Estimates   commercial/estimating       (Calculator icon)
- PoC Estimates        commercial/poc-estimates    (ZapIcon)
- Purchase Orders
- Variations
```

Remove the "Estimates" (`commercial/estimates`) entry and its `<Route>`. Keep the two remaining slugs unchanged so no deep links break, and keep the icons.

### 2. Tab components

- `src/pages/wp/tabs/WpEstimatingTab.tsx` — rename display label to **"EV Build Estimates"**; keep wrapping `SiteEstimatesPanel` exactly as-is (deep-link handling included).
- `src/pages/wp/tabs/WpPocEstimatesTab.tsx` — replace contents to render the group-based `EstimatesTab` (same component `WpEstimatesTab` currently renders), scoped to the work package. Heading becomes **"PoC Estimates"**.
- Delete `src/pages/wp/tabs/WpEstimatesTab.tsx` and remove its exports from `src/pages/wp/WpTabs.tsx`.
- Delete the bespoke PoC editor: `src/components/delivery/poc-estimate/PocEstimatesTab.tsx` and `src/components/delivery/poc-estimate/PocEstimateEditor.tsx` (and any local helpers only used by them).

### 3. Cross-references

- `src/pages/wp/tabs/WpOverviewTab.tsx` — the "Open PoC Estimates" link keeps `commercial/poc-estimates`; the "Open EV Build Estimating" link stays on `commercial/estimating` but label becomes "Open EV Build Estimates". Remove any link to the retired `commercial/estimates` route (none expected outside sidebar).
- `src/pages/SiteDetail.tsx` deep-link into `commercial/estimating` is unchanged (still the Site Estimates engine).

### 4. Data migration

One migration that:

1. Snapshots each row of `poc_estimates` (plus its `poc_estimate_lines` as JSON) into `deleted_entities` with `entity_type = 'poc_estimate'`, `retention_until = now() + 90 days`, and a reason of `'retired: PoC now uses Estimates engine'`.
2. Drops `poc_estimate_lines` then `poc_estimates` (cascades any dependents; there should be none outside the retired UI).
3. Drops any RLS policies, grants, triggers, and functions specific to those two tables.

No new tables. No changes to the existing `estimates` / `estimate_lines` / `estimate_groups` schema or its RLS.

## Out of scope

- No changes to the Site Estimates engine, EV Build logic, synthetic-rate calculations, `estimates`/`estimate_lines` schema, PO / Variations tabs, or notifications.
- No import of historical PoC estimate content into the Estimates engine — user chose archive-and-drop.

## Technical notes

- `WpEstimatesTab` today is a thin wrapper around `src/components/delivery/estimate/EstimatesTab.tsx`. `WpPocEstimatesTab` will mount that same component with the current work-package context; if `EstimatesTab` currently has no notion of "type", we won't fabricate one — both tabs are already scoped by different URLs and only PoC will use this engine after the change.
- The migration uses `deleted_entities` (already present, 90-day retention pattern used by the Archive engine), so no new retention plumbing is needed.
- After the migration runs and Supabase types regenerate, the deleted PoC components will no longer reference removed tables, so the TS build stays clean.

## Verification

- Sidebar shows only **EV Build Estimates** and **PoC Estimates** under Commercial; the middle "Estimates" entry is gone.
- `/wp/:id/commercial/estimating` renders `SiteEstimatesPanel` unchanged.
- `/wp/:id/commercial/poc-estimates` renders the group-based Estimates UI (create group, add lines, totals).
- `/wp/:id/commercial/estimates` 404s / redirects to overview.
- `select count(*) from poc_estimates` fails (table dropped); matching snapshot rows exist in `deleted_entities`.
