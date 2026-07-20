## Goal
Bring the two site-onboarding entry points from the legacy `DeliveryWorkPackage` shell into Gridwise OS, on the Site Register tab. No new backend — reuse the existing `/import/wizard` route (Portfolio Import) and the existing `wp_sites` insert path.

## Changes

### 1. `src/pages/wp/tabs/WpSiteRegisterTab.tsx` — add a toolbar with two actions
At the top of the tab (above the search/filter chips), add a right-aligned action group:

- **Import sites** — outline button, `Upload` icon, links to `/import/wizard?wp={wpId}&programme={programme_id}`. Fetch the WP's `programme_id` once via a small `useQuery` (`work_packages` → `programme_id`). Same URL shape the legacy shell uses so the wizard's existing wp/programme handling works unchanged.
- **Add site** — primary button, `Plus` icon, opens an "Add site to work package" dialog that mirrors the legacy `SitesPanel`:
  - Query `sites` (id, site_name, postcode) limited to 500, filter out ids already in the current WP's `rows`.
  - Fields: `Site` (Select with "Pick a site" placeholder), `Local ref (optional)` input.
  - On submit: `insert` into `wp_sites` with `{ work_package_id, site_id, local_ref, sequence: rows.length + 1 }`, toast, close, invalidate the tab's queries (`wp-site-register`, `wp-site-precon-status`, `wp-site-stage-summary`).

Empty state: when `rows.length === 0`, replace the current empty message with a card that offers both actions inline (Import sites / Add site) so a fresh WP has a clear starting point.

### 2. No other files change
- `WpSidebar`, routing, DB, RLS, `ImportWizard.tsx`, `wp_sites_ensure_stage` trigger — all untouched. The wizard already accepts `?wp=` + `?programme=` params.
- Legacy `DeliveryWorkPackage.tsx` is left as-is (still the fallback shell).

## Verification
- Open a WP in Gridwise OS → Sites › Site Register. Toolbar shows "Import sites" and "Add site".
- "Import sites" navigates to `/import/wizard?wp=<id>&programme=<id>` matching the screenshot.
- "Add site" opens the dialog matching the screenshot, inserts a `wp_sites` row, and the new site appears in the register without a page reload.
- Empty WP shows both actions in the empty-state card.
