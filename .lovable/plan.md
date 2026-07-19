## Goal

Upgrade the **Queue Survey** bulk action on the Site Register so it:

1. Optionally **sends the survey link to a site contact** (like the Portfolio flow), and
2. **Assigns an internal owner** to the resulting `Allocate site survey` task.

No new tables. Reuses existing `wp_tasks`, `sites`, and the existing survey generator/email path from `SendSurveyDialog`.

## Current state (verified)

- `WpSiteRegisterTab.tsx` line 226 — `bulkSurveyAlloc` inserts one `wp_tasks` row per selected site (`task_kind='survey_alloc'`, due +14d). No owner, no email, no `site_surveys` created.
- Button at line 404: `Queue survey`.
- `wp_tasks` schema includes `owner_user_id uuid` — reuse it, no migration.
- `src/components/portfolio/SendSurveyDialog.tsx` already generates survey links and emails them (site contact / extra emails / link-only mode). Reusable as-is.
- `SendForPocDialog.tsx` already contains the directory-lookup UX for picking an internal assignee — same pattern will drop into the new dialog.

## New component

`src/components/wp/QueueSurveyDialog.tsx` (mirrors `SendForPocDialog` layout):

- **Section A — Internal task**
  - Due date (default +14 days, editable).
  - Owner picker: searches `profiles` (same query `SendForPocDialog` uses) — internal team member becomes `owner_user_id` on the created `wp_tasks` rows.
  - Optional note → written to `wp_tasks.description`.
- **Section B — Send survey to contact (optional, collapsible)**
  - Toggle: *Also send survey link to site contact*.
  - When on: embeds the existing `SendSurveyDialog` behaviour inline (site contact vs extra emails vs link-only, message field). Reuses the same edge function it already calls, so no new email plumbing.
  - Readiness panel lists sites that have no `surveyor_email` when "use site contact" is chosen, so the user can fall back to link-only or extra emails per the existing rules.
- On submit:
  1. Insert `wp_tasks` rows with `owner_user_id`, `due_date`, `description`.
  2. If Section B is enabled, call the same survey-send path `SendSurveyDialog` uses.
  3. Toast summary: `Survey allocated to <owner> for N sites` + `— link sent to X contact(s)` when applicable.
  4. Clear selection + `invalidate()` register query.

## Wire-up in `WpSiteRegisterTab.tsx`

- Replace the direct `bulkSurveyAlloc.mutate(...)` call on the Queue survey button with `setSurveyDialogOpen(true)`.
- Delete the now-unused inline `bulkSurveyAlloc` mutation (its insert moves into the dialog).
- Keep the button label and icon; add tooltip: *"Assign an internal owner and optionally email the survey link to the site contact."*

## Out of scope

- No schema change (uses `wp_tasks.owner_user_id`).
- No new notification triggers — the existing on-insert task-notification trigger already pings the assigned owner.
- No changes to Portfolio's `SendSurveyDialog`.

## Files touched

- **new** `src/components/wp/QueueSurveyDialog.tsx`
- **edit** `src/pages/wp/tabs/WpSiteRegisterTab.tsx` (swap mutation for dialog, add owner picker wiring)
