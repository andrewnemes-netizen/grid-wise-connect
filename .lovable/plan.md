
# Wire the Work Package shell to real data

Today every tab under `/wp/:id` renders the same "Coming online" placeholder from `TabShell` in `src/pages/wp/WpTabs.tsx`. The database and most global UIs already exist — we just need to replace each placeholder with the real component, filtered by `work_package_id`.

Approach: keep the existing shell (sidebar, header, feature flag) untouched. For each tab, we either (a) drop the existing global component in with a `wpId` prop, or (b) build a small WP-scoped wrapper that reuses the same data hooks. No new database work is required — Phases 1–11 already delivered the tables, views and RLS.

Delivered in 5 build turns so you can review after each. Every turn ends with a working, browsable set of tabs.

## Turn 1 — Overview + Sites (the landing experience)

1. **Overview** — replace placeholder with KPI dashboard driven by `v_wp_commercial_position` (budget, committed, actual, variance, forecast margin) plus counts from `v_site_handover_readiness` (energised / commissioned / handover-ready / open snags) and stage rollup from `wp_sites` + `site_stage_status`.
2. **Site Register** — table of `wp_sites → sites` with columns: name, postcode, stage, primary_partner, viability score, last activity. Row click deep-links to the existing site detail view.
3. **Map** — embed the existing global map component with `wpId` filter passed to the site-fetch hook so pins are restricted to this WP's sites (bounds auto-fit).

## Turn 2 — Commercial (biggest reuse of existing code)

4. **Estimating** — embed the existing estimating grid (`work_package_estimates`, `estimate_lines`, `wp_estimate_sites`, `wp_estimate_variation_lines`) scoped by `work_package_id`. Includes Client / Partner / DNO lens toggle already built into the estimating components.
5. **Purchase Orders** — table of `purchase_orders` + `po_lines` + `po_line_sites` for this WP. Reuse the PO detail drawer from the existing global page.
6. **Variations** — list `wp_estimate_variations` + `wp_estimate_variation_lines` with approval status and impact on budget. Reuse existing variation dialog.

## Turn 3 — Engineering

7. **Grid Studies** — embed the existing `studies` list filtered to sites in this WP; reuse the study snapshot viewer.
8. **DNO Offers** — table of `dno_offers` + `dno_offer_sites` for the WP; reuse quotation send / status pipeline UI from the global DNO page.
9. **Design** — list `design_submissions` + `site_design_submissions` + `design_reviews` scoped to WP sites; reuse the design review drawer.

## Turn 4 — Delivery + Partners + Pre-Con

10. **Programme** — embed the existing programme gantt / milestone view keyed to `programmes` + `wp_milestones` (WP already belongs to one programme, so filter by `programme_id`).
11. **Tasks** — unified board of `wp_tasks` + `project_tasks` for sites in the WP, with `wp_task_dependencies` edges. Reuse the existing kanban board component.
12. **Partners** — read-only view of `wp_partner_allocations` + linked `partner_users` for this WP (writes stay in `/admin`). Shows scope split (all sites vs specific sites) and portal access indicator.
13. **Pre-Construction** — new WP-scoped grid built on Phase 9 tables that currently have zero UI: `permits`, `rams_documents`, `traffic_management_plans`, `daily_logs`, `inspections`, `materials_deliveries`. Tab-per-record-type. This is the largest new build in the plan.

## Turn 5 — Records + Commissioning close-out

14. **Documents** — filtered `project_files` grid (WP + all its sites + POs + designs) with type/tag facets, upload, and secure signed-URL download.
15. **Photos** — `site_photos` gallery grouped by site and month with EXIF metadata drawer.
16. **Audit** — `audit_log` stream filtered to this WP, its sites, POs, offers, designs, energisations. Timeline layout, filter by action type.
17. **Commissioning close-out** — add a "Commissioning" tab (new entry in `NAV`) surfacing `commissioning_records`, `test_certificates`, `snagging_items`, `handover_packs` and `v_site_handover_readiness` for internal staff. Mirrors what partners see in the Partner Portal but with edit permissions and the readiness gate.

## Technical notes

- **New tab in the sidebar (Turn 5 only):** add `Commissioning` to `NAV` in `src/components/wp/WpSidebar.tsx` and register a route in `WorkPackageShell.tsx`. No other sidebar edits.
- **WP scoping pattern:** for each existing component, either extend its data hook to accept an optional `wpId` filter, or wrap it in a thin `WpXxx.tsx` that pre-computes `siteIds = wp_sites.site_id[]` and passes it down. Prefer the hook-level filter when the component is already parameterised.
- **RLS:** every table involved already has org-scoped RLS with staff read/write. No policy changes needed. Partner Portal RLS is untouched.
- **Feature flag:** the whole shell still sits behind `gridwise_os_shell`. No change.
- **Deletions:** none. Existing global pages stay live and continue to work outside the shell.
- **Migrations:** none in Turns 1–4. Turn 5 may add one read-only view `v_wp_document_index` if the polymorphic `project_files` join becomes too slow client-side.
- **Testing:** end each turn with a Playwright smoke of the newly-wired tabs against seeded data, following the pattern we used for the Partner Portal e2e.

## Out of scope

- No new schema features (billing, invoicing, revenue recognition beyond what's in `revenue_*` tables).
- No mobile-specific redesign of the tabs — desktop-first, responsive by inheritance.
- No changes to the Partner Portal, Admin screen, or Studies/Design engines themselves.
