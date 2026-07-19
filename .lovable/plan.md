## Goal
Let any Engineer with WP access unlink selected sites from a Work Package via the Site Register bulk toolbar, and archive the WP-scoped work for those sites so they disappear from Readiness/Matrix. The Site record and all cross-WP data stay intact and the site can be re-added later.

## What "unlink + archive" means
For each selected site on this WP:
1. Delete the `wp_sites` row (removes it from the WP).
2. Archive WP-scoped derived state for that `(wp_id, site_id)` pair:
   - `wp_tasks` → set `status = 'archived'` (keep row for audit).
   - `site_stage_status` → set `state = 'archived'` on rows scoped to this WP.
   - `site_precon_gates` → mark `archived_at = now()`.
3. Leave untouched (canonical / cross-WP):
   - `sites`, `site_estimates`, `site_photos`, `site_surveys`, `design_submissions`, `dno_offers`/`dno_offer_sites`, `notifications`, `audit_log`.
4. Write an `audit_log` entry per site: `action = 'wp_site_removed'` with the removing user, WP id, site id, timestamp.

Re-adding the site later re-creates a fresh `wp_sites` row and re-seeds stages via the existing `wp_sites_ensure_stage()` trigger. Archived tasks/gates stay archived so the audit history reads correctly.

## Backend
New RPC `public.remove_sites_from_wp(_wp_id uuid, _site_ids uuid[])`:
- `SECURITY DEFINER`, `search_path = public`.
- Auth check: caller must have a row in `wp_access` for `_wp_id`, OR `has_role(auth.uid(),'admin')`. Otherwise raise.
- Runs the delete + archive steps above in a single transaction.
- Returns `{ removed: int, blocked: uuid[] }` (blocked = ids not attached to this WP).
- Grant `EXECUTE` to `authenticated`.

No schema changes needed beyond adding `archived_at timestamptz` to `site_precon_gates` if not already present.

## UI (WpSiteRegisterTab.tsx only)
- Bulk toolbar already appears when `selectedSiteIds.size > 0` (next to "Send for PoC"). Add a **"Remove from WP"** button (destructive variant, trash icon).
- Clicking opens a confirm dialog listing the selected site names + count, with copy:
  > "This unlinks N site(s) from this Work Package and archives their WP-scoped tasks and gates. The Site records and their estimates, surveys, photos, designs, and offers remain unchanged and the sites can be re-added later."
- On confirm: call the RPC, toast the result, clear selection, refetch the site list + counts.
- No row-menu action, no Site Detail change (per your answer).

## Permissions summary
- Any user with a `wp_access` row on this WP (Engineer or above) can remove.
- Admins can always remove.
- Button is hidden if the user has no `wp_access` row and is not admin.

## Out of scope
- Deleting the underlying `sites` record.
- Cascading changes to estimates, offers, designs, or notifications.
- Row-level or Site Detail entry points.

## Technical notes
- All logic is additive; no existing triggers or tabs change behaviour.
- Readiness/Matrix already filter by `wp_sites`, so removed sites drop out automatically once the `wp_sites` row is gone.
- Verification: Playwright — select 2 sites on a test WP, click Remove, confirm, assert they vanish from Site Register, Readiness Matrix, and Delivery Matrix; assert `audit_log` rows and archived `wp_tasks`/`site_precon_gates`.
