# Gridwise OS — Revised Master Build Plan (v3)

Supersedes v2. **No SQL executed until this plan is approved.** All prior v2 architecture decisions (9 tables, 6 views + 1 mat view, 8 altered tables, four commercial lenses, feature-flagged rollout, dual-task model) are retained and re-organised into a full 13-phase programme. **No module is duplicated** — every phase mounts or extends the existing Portfolio, Delivery, Studies, Design, Estimating, LA Programme, Assistant, Admin, and Map surfaces already present in the codebase.

---

## A. Existing modules — functional vs schema-only

| Module | State | Notes |
|---|---|---|
| Portfolio (`/portfolio`) | Functional | Site register, analytics, surveys. Reused as WP → Sites → Site Register. |
| Delivery WP (`DeliveryWorkPackage.tsx`, board/gantt/kanban) | Functional | Reused as the WP shell's Delivery group; Task Board keyed to `project_tasks`. |
| Delivery Programmes/Projects/Proposals/Revenue | Functional | Reused inside the WP shell (Programme page + Commercial tabs). |
| Studies (`Studies.tsx`, `StudyDetail.tsx`) | Functional | Becomes Engineering → Grid Studies. Immutable snapshot model retained. |
| Design Mode (`DesignModePanel.tsx`, `design_scenarios`, `design_cables`, `design_elements`, `design_workflow_events`) | Functional | Becomes Engineering → Design. |
| Estimating (`EstimateEditor`, `EstimatesTab`, `rate_cards`, `rate_items`, `estimate_recipes`, `recipe_items`, `unit_rates`) | Functional | Becomes Commercial → Estimating; lenses added. |
| LA Programme (`LaProgramme.tsx`, `programme_templates`) | Functional | Templates reused by Phase 6. |
| Gridwise Connect pipeline (`src/lib/gridwise/*`, `ev-hub-engine`) | Functional | Feasibility runs from WP Sites tab and from Import Wizard post-approval. |
| Import Wizard (`ImportWizard.tsx`, `import_batches`, `import-wizard` fn) | **Phase A only** — CSV/XLSX/paste live; PDF/DOCX AI extraction + Inngest worker pending. Reused by Phase 3. |
| Assistant (`AssistantChat.tsx`, `gridwise-assistant`, MCP `src/lib/mcp/*`) | Functional read-only | Extended in Phase 12. |
| Admin (rate library, recipe library, unit rates, org mgmt, DNO datasets, layers) | Functional | Reused; no duplication. |
| Site Surveys (`site_surveys`, `site_stage_status`) | Functional | Kept, purpose narrowed to per-stage survey timestamps. |
| Notifications, audit_log, project_files, project_activity, project_comments | Functional | Reused polymorphically. |
| Partners / DNO offers / Purchase Orders / Design submissions / Resource planning / Permits / RAMS / Commissioning | **Not present** | Introduced by Phases 1, 5, 7, 8, 9, 10. |

**No new Portfolio, Delivery, Estimating, Studies, or Design module is created.** Every new UI is either a new tab inside the WP shell or a new sub-page mounted inside an existing route.

---

## B. Site-stage redesign (configurable, not enum)

Replaces v2's `site_stage_enum`. Enum removed from Phase 1.

New tables (added to Phase 1 count):
- `stage_definitions` — id, key, label, colour, category (`pre-con`/`design`/`delivery`/`commissioning`/`handover`/`closed`), order_index, is_terminal, org_id nullable (null = global default).
- `workflow_stage_sets` — id, name, org_id, description; groups stage definitions into a client workflow.
- `workflow_stage_set_stages` — set_id, stage_id, order_index (join).
- `stage_transition_rules` — from_stage_id, to_stage_id, required_role, required_gate (`design_approved`/`po_received`/`energised`/etc.), workflow_set_id.
- `sites.current_stage_id` (nullable FK → stage_definitions) replaces `current_stage` enum.
- `site_stage_history` — append-only transition log (kept from v2).

**Site convenience fields review (v2 amendment):**
- Drop `sites.partner_id`, `sites.dno_offer_id`, `sites.po_id`, `sites.current_design_submission_id` as *stored* pointer columns.
- Introduce full relationship tables: `wp_partner_allocations` (already in v2, extended with `site_id nullable`), `dno_offer_sites`, `po_line_sites`, `site_design_submissions`.
- Keep only `sites.current_stage_id` and `sites.primary_partner_id` (denormalised for list/filter perf; refreshed by trigger on the join tables). All history lives in the relationship tables + `site_stage_history`.

**Full lifecycle stages seeded globally** (13 → 22, covers construction to handover):
`imported → allocated → poc_assessment → dno_submitted → awaiting_offer → offer_received → commercial_review → awaiting_client_po → client_po_received → design_in_progress → design_submitted → design_approved → ready_for_delivery → permits_applied → traffic_management_agreed → mobilised → civils_in_progress → cabling_complete → jointing_complete → energised → commissioned → snagging → practical_completion → handover_complete → closed`.

Clients override by cloning a stage set into their org and editing rules — **no migration required**.

---

## C. Phase plan

### PHASE 0 — Product Definition (no code)

Deliverables committed to `/docs/gridwise-os/`:
- **User journeys** — 12 end-to-end flows (client enquiry → award; site import → Connect run; Connect → Design → DNO submission → offer → PO → mobilisation → energisation → handover; partner allocation → design upload → approval; variation → PO amendment → invoice).
- **Wireframes** — 1 per WP tab (16), Programme page, Site drawer, Partner Portal home, Import Wizard, Reporting.
- **Data dictionary** — every new column + every reused column with owner, source of truth, retention rule.
- **Permission matrix** — see §D.
- **Role-based acceptance criteria** — one Given/When/Then set per role per phase; feeds §E.
- **Migration dependency map** — DAG of the 13 phased migrations (Phase 1 first, no cycles).
- **UAT plan** — 3 test orgs (internal, client-viewer, partner), 40 scripted scenarios, sign-off matrix.
- **Rollback test plan** — every migration paired with `*_rollback.sql`; UAT env restored from snapshot and rollback rehearsed before prod cutover.

**Exit gate:** all docs approved, migration map signed off. No SQL yet.

---

### PHASE 1 — Data Foundation

Tables added (**final count = 15 new physical tables**, revised from v2's 9):

1. `partners`
2. `partner_users`
3. `wp_partner_allocations` (+ `site_id nullable`)
4. `dno_offers`
5. `dno_offer_sites` *(new; replaces `sites.dno_offer_id`)*
6. `purchase_orders`
7. `po_lines`
8. `po_line_sites` *(new; replaces `sites.po_id`)*
9. `design_submissions`
10. `design_reviews`
11. `site_design_submissions` *(new; replaces `sites.current_design_submission_id`)*
12. `site_stage_history`
13. `stage_definitions`
14. `workflow_stage_sets` (+ join `workflow_stage_set_stages`, counted with parent)
15. `stage_transition_rules`

Views (unchanged from v2, 6 + 1 mat view): `v_po_commitments`, `v_wp_kpis`, `v_estimate_lines_client/partner/dno`, `v_all_tasks`, `mv_programme_dashboard`.

Altered tables (**7**, revised from v2's 8 — `sites` change scope reduced): `sites` (+`current_stage_id`, +`primary_partner_id` only), `wp_sites` (+`partner_id`), `project_files` (+polymorphic `entity_type`/`entity_id`), `estimates` (+`visibility_lens_default`, extended status), `estimate_lines` (+`partner_visible`), `wp_tasks` (+`scope` check), `project_tasks` (+`site_id`, +`scope` check), `work_packages` (+`delivery_project_id`, +`wp_procurement_unlocked`, +`workflow_stage_set_id`).

RLS: every new table scoped by `org_id` via existing `is_org_member`/`has_role`. Partner tables additionally scoped by `partner_users.partner_id ∈ wp_partner_allocations`. GRANTs applied per every-CREATE-TABLE rule.

Audit: new event types registered — `stage_transition`, `partner_allocated`, `dno_offer_received`, `po_created`, `po_line_added`, `design_submitted`, `design_approved`, `variation_raised`, `energised`, `handover_signed`. All routed through existing `audit_log`.

Feature flag: `gridwise_os_shell` in `app_settings` (per-user + per-org). Off by default.

Rollback: single-tx migrations with paired `*_rollback.sql`; non-destructive (no drops of existing columns).

**Acceptance:** schema deploys clean; RLS lint passes; rollback rehearsal succeeds; flag off → app behaves identically to today.

---

### PHASE 2 — Work Package Workspace

- New `/wp/:id` shell with the 6-group / 16-leaf nav (§ v2 nav retained verbatim).
- New sidebar: Home · Programmes · Map · Assistant · Admin, gated by `gridwise_os_shell`.
- Programme page mounts existing `DeliveryProgrammeDetail` + `mv_programme_dashboard` KPIs.
- Site drawer at `/wp/:id/site/:siteId` — mounts existing `SiteDetail` panels.
- Overview tab reads `v_wp_kpis`. Map tab mounts existing `MapView` filtered by WP.
- Old routes (`/portfolio`, `/delivery/*`, `/studies`, `/la-programme`, `/quick-estimate`) remain live in parallel.

**Acceptance:** staff with flag on can complete every existing workflow inside the WP shell; flag off = old app unchanged; deep links resolve; permission matrix enforced.

---

### PHASE 3 — Portfolio Import (extend existing Import Wizard, no duplication)

- Extend `ImportWizard.tsx` + `import-wizard` edge fn (Phase A already shipped).
- Add: PDF/DOCX AI extraction (Gemini via Lovable AI), saved column-mapping templates, Inngest background worker + Supabase realtime progress for >200-row batches.
- Post-approval action re-uses **existing** `runGridwiseProject` orchestrator to run Connect on selected sites.
- Sites created appear in Portfolio, WP → Sites → Site Register, GIS Map (via existing `geo_points`), Site Register — no new module.

**Acceptance:** 10k-row XLSX imports in <10 min with live progress; rollback restores state via `import_created_records`; batch Connect run enqueues correctly.

---

### PHASE 4 — Estimating (extend existing Estimating module)

- **Connected Kerb synthetic rate-card import** — new admin action in existing `RateLibrary.tsx` that creates a rate card + version from an XLSX (uses Import Wizard's parser).
- **BOQ recipe import** — extends existing `RecipeLibrary.tsx`.
- **Rate-card versioning** — already present in `rate_card_versions`; UI surfaces version pinning per estimate.
- **Recipe versioning** — new column `estimate_recipes.version_of_id`; append-only revisions.
- **Gridwise design → BOQ** — extends existing `boqGenerator.ts`; writes to `estimate_lines`.
- **Site estimates** — reuses `site_estimates` / `site_estimate_lines` / `site_estimate_exceptions` tables that already exist.
- **Manual exceptions & allowances** — reuses `estimate_allowances`, `site_estimate_exceptions`.
- **Estimate revisions** — new `estimates.parent_estimate_id`; supersede link.
- **Four visibility lenses** — lens views + `<EstimateEditor lens={...}>` (v2 §6).
- **WP aggregation** — reuses `work_package_estimates` + `wp_estimate_sites`.
- **Prelims/mob/contingency** — new columns on `work_package_estimates`: `preliminaries_pct`, `mobilisation_pct`, `contingency_pct`.
- **Frozen baseline on award** — trigger snapshots `wp_estimate_variations` baseline row on `estimates.status → awarded`.

**Acceptance:** award freezes commercial baseline; all four lenses render correct columns; imports round-trip cleanly.

---

### PHASE 5 — Grid Study & Design (extend existing Studies + Design)

- **Connect results ↔ sites** — new `studies.site_id nullable`, `studies.wp_id nullable`.
- **Connect → Design conversion** — reuses existing `connectDesignBridge.ts` + `designBridge.ts`.
- **Design → Engine analysis** — reuses `runElectricalEngine`, `runRouteEngine`, `apply-dno-rules` fn.
- **DNO rules & validation** — reuses `dno_rulesets`, `DnoRulesValidatorPanel.tsx`.
- **Design submissions & reviews** — `design_submissions` + `design_reviews` (Phase 1 tables). Files via `project_files` polymorphic linkage.
- **DNO offer management** — `dno_offers` + `dno_offer_sites` tables; offer documents via `project_files` (no `dno_offer_documents` table, per v2 §4).

**Acceptance:** approve design → §7 workflow fires (sites → ready_for_delivery, procurement unlocked, delivery PM notified) with no duplicate Delivery project.

---

### PHASE 6 — Programme & Delivery (extend existing Delivery)

- **Programme templates** — reuses existing `programme_templates` (already used by LA Programme).
- **WP-level tasks** — `wp_tasks` with `scope='wp_level'` (Phase 1 constraint).
- **Site-level tasks** — `project_tasks` with `scope='site_level'` + `site_id`.
- **Dependencies** — reuses `wp_task_dependencies` + `project_task_dependencies`.
- **Gantt** — reuses existing `InteractiveGantt.tsx` + `TaskGantt.tsx` fed by `v_all_tasks`.
- **Milestone gates** — reuses `wp_milestones` + `project_milestones`; new `gate_type` col (`design_gate`/`po_gate`/`permit_gate`/`energisation_gate`).
- **Delivery readiness matrix** — new tab component `<DeliveryReadinessMatrix>` (sites × gates from `v_wp_kpis`).

**Acceptance:** dependencies enforced; gate un-met → blocked tasks stay unreleased.

---

### PHASE 7 — Resource Planning

New tables (5, phase-owned):
- `resources` — id, org_id, type (`gang`/`jointer`/`electrician`/`pm`/`subcontractor`/`vehicle`/`plant`), name, day_rate, capacity_units.
- `resource_calendars` — resource_id, date, availability (`available`/`leave`/`booked`).
- `resource_assignments` — resource_id, wp_id nullable, project_task_id nullable, start, end, units.
- `resource_skills` — resource_id, skill_key.
- `subcontractors` — extends `partners` link.

UI: new WP → Delivery → **Resources** sub-tab (adds 17th leaf under Delivery, replacing nothing). Conflict detector runs on assignment write.

**Acceptance:** double-booking blocked; utilisation dashboard renders per resource.

---

### PHASE 8 — Commercial Control (extend Commercial tab)

- **Purchase Orders** — `purchase_orders` + `po_lines` + `po_line_sites` (Phase 1 tables). UI: Commercial → Purchase Orders tab with columns from v2 §2.
- **Variations** — reuses existing `wp_estimate_variations` + `wp_estimate_variation_lines`.
- **Committed / actual / CTC / forecast revenue / forecast margin** — new view `v_wp_commercial_position` (WP-level) + `v_po_commitments` (v2). No new tables.
- **Actual cost intake** — new `actual_costs` table (id, wp_id, site_id nullable, po_line_id nullable, amount, date, source (`manual`/`invoice_import`)).
- **Invoicing interface prep** — extends existing `revenue_invoices` + `revenue_invoice_counters` (already present); expose them inside WP shell — no new invoicing module.

Table delta added by Phase 8: **2 new** (`actual_costs`, +view). Cumulative new tables → **17**.

**Acceptance:** cost curves render; variation → PO amendment → forecast margin update flows through in one refresh.

---

### PHASE 9 — Construction Control

New tables (7, phase-owned):
- `permits` (id, site_id, type, reference, status, expiry, files via `project_files`)
- `traffic_management_plans` (site_id, type, approval_state, valid_from/to)
- `rams_documents` (wp_id, site_id nullable, version, approved_by, files)
- `daily_logs` (site_id, date, weather, crew, notes, photos_count)
- `site_photos` — thin wrapper on `project_files` with EXIF geolocation
- `inspections` (site_id, type, inspector_id, passed, defects_json)
- `materials_deliveries` (wp_id, site_id, item, qty, delivered_at)

Surveys, drawings already handled by existing `site_surveys` and `project_files`.

**Cumulative new tables → 24.**

UI: WP → Records → new sub-tabs (Permits, TM, RAMS, Daily Logs, Inspections, Materials). Photos tab enhanced with map view.

**Acceptance:** every construction artefact traceable to a site; RAMS gate blocks mobilisation if missing.

---

### PHASE 10 — Commissioning & Handover

New tables (4, phase-owned):
- `commissioning_records` (site_id, meter_serial, mpan, energised_at, test_pack_id)
- `test_certificates` (site_id, cert_type, issued_by, issued_at, file_id)
- `snagging_items` (site_id, description, severity, status, closed_at)
- `handover_packs` (site_id, pc_signed_at, om_bundle_file_id, client_signed_at, signed_by_email)

**Cumulative new tables → 28.**

Stages `energised → commissioned → snagging → practical_completion → handover_complete → closed` (already seeded in §B) drive the flow.

**Acceptance:** handover requires all certs present, all snags closed; PDF O&M pack generates via existing `generateAssessmentPdf` pattern.

---

### PHASE 11 — Partner Portal

- New route tree `/partner/*` mounted **inside the same app** (no new project).
- Layout reuses `DashboardLayout` with a partner-scoped sidebar (My Allocations · Designs · Documents · Comments · Progress).
- RLS: every read scoped by `partner_users.partner_id` ∈ `wp_partner_allocations` for the site.
- Partner lens applied to all commercial data (v2 §6).
- Uploads write to `project_files` with `entity_type='design_submission'`.
- Comments reuse `project_comments` with partner-scoped RLS.

**No new tables.** Cumulative stays **28**.

**Acceptance:** partner sees only their allocations; commercial values match partner lens; RLS penetration test passes.

---

### PHASE 12 — Reporting & Assistant

- **WP reports / client reports / DNO packs / installer packs** — extend existing `generateAssessmentPdf.ts` + `quotation-pdf.ts`; templates keyed by audience lens.
- **Assistant** — extend existing `gridwise-assistant` fn and MCP tools (`src/lib/mcp/tools/`) with WP-scoped read tools first: `get_wp_overview`, `list_wp_sites`, `list_wp_tasks`, `list_wp_pos`, `list_wp_variations`, `get_site_stage_history`.
- Controlled writes added later (Phase 12b, separate approval): `create_wp_task`, `advance_site_stage`, `create_variation` — each gated by role + audit event.

**No new tables.** Cumulative stays **28**.

**Acceptance:** reports render for every audience; MCP tools return partner-scoped data when called by a partner user.

---

### PHASE 13 — Legacy Retirement (separate approval)

- Retire old top-level routes (`/portfolio`, `/delivery`, `/studies`, `/la-programme`, `/quick-estimate`) with 301 redirects to WP-shell equivalents.
- Drop `gridwise_os_shell` flag.
- Archive orphan components.

---

## D. RLS matrix (summary — full matrix in Phase 0 docs)

| Table / view | Admin | Engineer | Client (org member) | Partner | Anon |
|---|---|---|---|---|---|
| `partners`, `partner_users` | ALL | R | — | R (self only) | — |
| `wp_partner_allocations` | ALL | RW | R (own org's WPs) | R (self) | — |
| `dno_offers`, `dno_offer_sites` | ALL | RW | R | — | — |
| `purchase_orders`, `po_lines`, `po_line_sites` | ALL | RW | R | — | — |
| `design_submissions`, `design_reviews`, `site_design_submissions` | ALL | RW | R | RW (self allocations) | — |
| `stage_definitions`, `workflow_stage_sets`, `stage_transition_rules` | ALL | R | R (own org) | R (own org) | — |
| `site_stage_history` | ALL | RW | R (own org) | R (self allocations) | — |
| `resources`, `resource_calendars`, `resource_assignments` | ALL | RW | R | — | — |
| `permits`, `traffic_management_plans`, `rams_documents`, `inspections`, `daily_logs`, `site_photos`, `materials_deliveries` | ALL | RW | R | RW (self allocations) | — |
| `commissioning_records`, `test_certificates`, `snagging_items`, `handover_packs` | ALL | RW | R | R (self allocations) | — |
| `actual_costs` | ALL | RW | R (client lens only) | — | — |
| Lens views | Follow lens rules (§v2.6) | | | | |

All tables use `is_org_member(org_id)` or `has_role(auth.uid(),'admin')`. Partner rows additionally filtered via `EXISTS (SELECT 1 FROM partner_users pu JOIN wp_partner_allocations wpa ON …)`.

---

## E. Acceptance criteria (per phase, condensed)

Every phase ships a Given/When/Then pack. Highlights:
- **P0:** every artefact reviewed by product + delivery + engineering leads.
- **P1:** RLS lint clean; rollback rehearsal passes on UAT snapshot; flag-off = zero UI diff.
- **P2:** 100% of existing workflows completable inside WP shell.
- **P3:** 10k-row XLSX import success rate ≥99.5%; rollback restores state.
- **P4:** award freezes baseline; all four lenses render correct rows/columns.
- **P5:** design approval fires §7 workflow idempotently; no duplicate Delivery project.
- **P6:** gate not met → dependent tasks stay `blocked`.
- **P7:** double-booking blocked; utilisation report ties to `resource_calendars`.
- **P8:** committed + invoiced + remaining reconcile to £0 at PO closure.
- **P9:** RAMS-missing site cannot mobilise (stage transition blocked).
- **P10:** handover requires all certs + zero open critical snags.
- **P11:** partner cannot read any row outside allocation; commercial values obey partner lens.
- **P12:** MCP tool called by partner returns partner-scoped rows only.
- **P13:** legacy routes 301 to WP shell; no dead links.

---

## F. Performance / background-job plan

| Concern | Approach |
|---|---|
| Import >200 rows | Inngest worker `import-approve-worker`, 250-row chunks, realtime progress channel. |
| Batch Gridwise Connect (≥50 sites) | Existing `score-sites-batch` fn, invoked from post-import screen and WP → Sites bulk action. |
| `mv_programme_dashboard` | Refreshed nightly (cron) + trigger on design-approval / PO-approval / stage-transition. |
| `v_po_commitments`, `v_wp_kpis` | Live views; indexed underlying tables (`po_line_sites(po_line_id)`, `estimate_lines(estimate_id)`, `sites(current_stage_id)`, `wp_sites(wp_id)`). |
| Site-list paging | Server-side pagination + `wp_id`/`current_stage_id` indexes. Selective columns for portfolio list per existing perf memory. |
| Assistant / MCP tool timeouts | Only fast reads inline; long batch runs stay in-app (per MCP fast-handler rule). |
| RLS cost | Continue `has_role` / `is_org_member` SECURITY DEFINER helpers already in security memory; no recursive policies. |
| Photo storage | `project_files` bucket, presigned URLs, EXIF stripped on write except geolocation. |
| Rollback | Every phase migration paired with a manual `*_rollback.sql`, rehearsed on UAT before prod. |

---

## G. Cumulative counts

- **New physical tables:** **28** (P1 = 15, P7 = 5, P8 = 2, P9 = 7, P10 = 4 — inclusive of the site-stage config tables replacing v2's enum)
- **New enums:** **0** (enum removed in favour of `stage_definitions`)
- **New views:** **7** (v2's 6 + `v_wp_commercial_position`)
- **New materialised views:** **1** (`mv_programme_dashboard`)
- **Altered existing tables:** **9** (v2's 8 minus dropped `sites` pointer fields, plus `work_packages.workflow_stage_set_id`, `estimates.parent_estimate_id`, `work_package_estimates.preliminaries_pct/mobilisation_pct/contingency_pct`)
- **Tables dropped:** **0**
- **New modules created:** **0** (Portfolio, Delivery, Estimating, Studies, Design, Assistant, Admin all extended in place)
- **Feature-flagged UI:** entire new sidebar + WP shell + Partner Portal, gated by `gridwise_os_shell`

---

**Awaiting approval of this v3 plan before Phase 1 SQL is written.** Nothing runs until you confirm.
