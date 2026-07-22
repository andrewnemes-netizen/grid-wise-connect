## Goal

Right now on `PoC Estimates` (`WpPocEstimatesTab` → `EstimatesTab`), estimates are scoped only to the Work Package. `estimates.site_id` already exists on the row but is never set or displayed, so you can't tell which Site Register entry an estimate belongs to — and PO issuance has nothing to bind against.

This slice makes the site link a first-class, required field on every PoC estimate.

## What changes (UX)

1. **"New estimate" opens a Site picker first**
   - Modal listing every site currently in the WP Site Register (from `wp_sites` joined to `sites`) — searchable by `site_name`, `local_ref`, `postcode`.
   - Shows a badge next to sites that already have an estimate ("1 estimate", "2 estimates") so you don't accidentally duplicate. You can still create another (revision case).
   - Confirm → creates the estimate with `site_id` set and default groups seeded (unchanged).

2. **Site column on the estimates list**
   - New column in `EstimatesTab` cards showing `Site: {local_ref} — {site_name} · {postcode}`.
   - Clicking the site chip deep-links to that site's dashboard.
   - Add a Site filter (dropdown of WP sites + "Unassigned") at the top of the list.

3. **Backfill / repair for existing estimates without `site_id`**
   - Any row where `site_id IS NULL` shows an amber "Assign site" chip in-line; clicking opens the same site picker and patches the row. No auto-guessing.

4. **Editor header shows the bound site**
   - `EstimateEditor` header renders the site name + local_ref (read-only). Prevents editing an estimate against the wrong site by mistake.

5. **PO readiness signal**
   - On the Site Register (`WpSiteRegisterTab`), add a small "Est." indicator per row: green tick if the site has an `AWARDED` (or `is_current`) estimate, amber dot if only draft, grey if none. This is the visual cue that a site is "ready for PO".
   - No PO issuance logic changes in this slice — POs already reference `site_id` via `po_line_sites`/`estimates.po_line_id`; we're just making sure the estimate side of the link is populated.

## Scope guardrails (per your reuse rule)

- No new estimate table, no duplicate site register, no new PO flow.
- Only touched files: `src/components/delivery/estimate/EstimatesTab.tsx`, `src/components/delivery/estimate/EstimateEditor.tsx` (header only), `src/pages/wp/tabs/WpSiteRegisterTab.tsx` (badge only), plus one new small component `EstimateSitePickerDialog.tsx`.
- Uses the existing `estimates.site_id` column and existing `wp_sites`/`sites` tables — no migration needed.

## Technical notes

- Site picker query: `wp_sites` → `sites(id, site_name, postcode, local_ref)` filtered by `work_package_id`, joined against `estimates(site_id, status, is_current)` to compute the per-site estimate count and awarded status.
- Creation: `estimates.insert({ work_package_id, site_id, name })` — `site_id` becomes required in the UI (button disabled until picked).
- Filtering: client-side on the already-fetched list (no extra fetch).
- Site chip deep-link: `/sites/{site_id}` (existing route).
- Readiness badge in Site Register: single aggregated query `select site_id, status, is_current from estimates where work_package_id=? and deleted_at is null and site_id in (...)`.

## Out of scope

- Auto-creating PO drafts from awarded estimates (separate slice).
- Bulk re-assigning site_id across many estimates (Admin task; can add later if needed).
- Changing EV Build Estimates flow — same pattern would apply but only PoC is in this slice unless you want both.

## Question before I build

Should the site link be **required only for PoC Estimates** (this slice), or **for EV Build Estimates too** (identical treatment in the same `EstimatesTab` component, since it's shared)?
