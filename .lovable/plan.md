
# Revised Delivery Model — Programme → Work Package → Site

## 1. Correction accepted

Sites are no longer top-level projects. A **Work Package** is the delivery unit (≈1–100 sites); a **Programme** groups work packages under a client contract. The existing `projects` table becomes redundant as a top-level container — it will be repurposed (see §4) so no data is lost.

## 2. Target hierarchy

```text
Account (accounts)                          — client
  └── Programme (programmes)                — commercial umbrella / framework
       └── Work Package (work_packages)     — operational delivery unit (1–100 sites)
            ├── WP Milestones (NEW: wp_milestones)
            ├── WP Tasks      (NEW: wp_tasks)
            └── Site (sites, joined via wp_sites)
                 ├── Gridwise Study    (studies)          [existing, read-only link]
                 ├── Site Estimate     (studies.cost_estimate_json) [existing, snapshot on award]
                 ├── Site Programme    (NEW: site_programmes)  — per-site schedule header
                 │    ├── Site Milestones (NEW: site_milestones)
                 │    └── Site Tasks      (NEW: site_tasks)
                 └── Site Handover     (NEW: site_handover_docs)
```

Key rules:
- A **Proposal** (existing) is now accepted **into a Work Package** (new or existing), not a Project.
- A **Site** belongs to exactly one active WP at a time via `wp_sites` (already exists).
- **WP milestones can depend on site progress** ("≥ 15 of 20 sites design-approved") via a rule expression on the milestone.

## 3. Existing tables we reuse (no schema change now)

| Existing | Role in new model |
|---|---|
| `accounts` | Client |
| `programmes` | Programme (already has account_id, framework, dates, status, target_site_count) |
| `work_packages` | Work Package (already programme-scoped) |
| `wp_sites` | Site ↔ WP join |
| `wp_team`, `wp_access` | WP resourcing + external ACL |
| `sites` | Site master |
| `studies` | Gridwise study + cost_estimate_json + bom_json (source of truth for BOQ/estimate) |
| `proposals` | Commercial offer; accepted → WP |
| `unit_rates`, `work_package_types` | Rate cards + template keys |

## 4. What happens to Phase-1 `projects`, `project_milestones`, `project_tasks`

Not deleted. They are **renamed / repurposed** to become site-level containers, so all Phase-1 code, RLS, rollup triggers and UI keep working:

- `projects` → **conceptually `site_programmes`**: one row per site under a work_package. Add `work_package_id` (already exists) as the required parent; site_id becomes required; a partial-unique index `(work_package_id, site_id)` prevents duplicates.
- `project_milestones` → used unchanged as **site milestones**.
- `project_tasks` → used unchanged as **site tasks**.
- `project_task_dependencies`, `project_comments`, `project_files`, `project_activity` → unchanged; they attach to a `project_id` which is now a site programme row.

We will expose these under new names via views (`site_programmes`, `site_milestones`, `site_tasks`) so the UI reads clean names, while the underlying tables and RLS stay intact. No destructive migration.

## 5. New tables

1. **`wp_milestones`** — `work_package_id`, `name`, `sequence`, `phase` (mobilisation / design_batch / procurement / construction / commissioning / handover / commercial), `planned_date`, `actual_date`, `status`, `percent_complete`, `depends_on_rule_json` (e.g. `{"type":"site_stage","stage":"design_approved","min_count":15}`), `owner_user_id`.
2. **`wp_tasks`** — `work_package_id`, `milestone_id` (nullable), `title`, `status`, `priority`, `owner_user_id`, `start_date`, `due_date`, `percent_complete`, `sort_index`, `metadata_json`. Same shape as `project_tasks` but scoped to the WP, not a site.
3. **`site_stage_status`** — per-site canonical stage flags used by the readiness matrix and WP milestone rules: `site_id`, `work_package_id`, `survey`, `design`, `dno`, `permit`, `civils`, `electrical`, `meter`, `handover` (each an enum: `not_started | in_progress | blocked | review | done`), `updated_at`. Maintained by a trigger that reads `site_tasks.status` grouped by a `stage` tag on the task, so the matrix stays in sync automatically.
4. **`site_handover_docs`** — `site_id`, `work_package_id`, `doc_type` (as_built / test_cert / commissioning / photos / meter_cert / other), `storage_path`, `filename`, `uploaded_by`, `uploaded_at`, `approved_at`, `approved_by`.
5. **`wp_task_dependencies`** — same shape as `project_task_dependencies` but for WP tasks, plus cross-level `depends_on_site_stage_json` (optional).
6. Extend **`programme_templates.template_json`** schema to include three sections:
   - `wp_milestones` + `wp_tasks` (WP-level)
   - `site_milestones` + `site_tasks` (applied once per site added to the WP)
   - `dependencies` (both intra-level and cross-level rules)

No changes to Connect/Design/Estimate tables.

## 6. Aggregation (WP dashboard)

A SQL view **`wp_rollup`** computes per work_package:
- site counts by each stage from `site_stage_status`
- WP % complete = weighted avg of site programme % complete
- BOQ aggregate from `studies.bom_json` for every site in the WP (JSONB roll-up in a function)
- budget vs forecast vs actual from proposal snapshot + `site_programmes.actual_cost` (added)
- open risks/blockers count (tasks where `status = 'blocked'` at WP and site level)
- next-milestone date

Matrix view is a straight `select` on `site_stage_status` joined to `sites`.

## 7. Migration plan (four small, additive migrations)

- **M5 — Reframe projects as site programmes**: add NOT-NULL `work_package_id` and `site_id` enforcement (via trigger, backfill nulls to a default WP if any exist), unique `(work_package_id, site_id) WHERE site_id IS NOT NULL`, create views `site_programmes`, `site_milestones`, `site_tasks` over the existing tables. No data loss.
- **M6 — WP delivery tables**: `wp_milestones`, `wp_tasks`, `wp_task_dependencies` + GRANTs + RLS via existing `wp_access` / `org_members` + updated_at triggers + cycle-prevention trigger.
- **M7 — Site stage + handover**: `site_stage_status` (+ trigger from site_tasks), `site_handover_docs` (+ storage bucket `wp-handover-docs`, private, RLS by wp membership).
- **M8 — Aggregation + templates v2**: `wp_rollup` view, `wp_boq_aggregate(wp_id)` function, extend `programme_templates` seed with `ev_hub_wp_v1` (Connected-Kerb-style: 1 WP + N sites), and RPC **`accept_proposal_into_wp(proposal_id, wp_id | null, template_key)`** that:
  1. creates/uses the WP,
  2. attaches the proposal's site to `wp_sites`,
  3. snapshots the estimate/BOQ into `proposals.snapshot_json`,
  4. applies the template (WP-level once; site-level per site),
  5. writes activity rows.

## 8. Page structure (revised)

```text
/delivery                                 Programmes list (was project list)
/delivery/programme/:id                   Programme dashboard → WP list, contract KPIs
/delivery/wp/:id                          Work-package workspace
   ├── /overview                          KPI cards, % complete, next milestone, risks
   ├── /matrix                            Site readiness matrix (Site × Stage)
   ├── /sites                             Site list with filters (status, region, DNO)
   ├── /tasks?level=wp                    WP tasks (list / kanban / gantt)
   ├── /milestones                        WP milestone timeline (with site-based deps)
   ├── /gantt                             Master Gantt: WP bar + grouped site programmes
   ├── /commercial                        Value, forecast, GM%, invoices (read-only V1)
   ├── /resources                         Resource demand (from tasks)
   ├── /files                             WP-scoped files + per-site handover docs
   ├── /members                           wp_team + wp_access
   └── /activity                          Combined WP + site activity feed
/delivery/wp/:id/site/:siteId             Site workspace inside the WP
   ├── /overview                          Study summary, POC, DNO, permit, cost vs est
   ├── /tasks                             Site tasks (list / kanban / gantt)
   ├── /milestones                        Site milestones
   ├── /handover                          Handover doc checklist + uploads + approval
   └── /activity                          Site-only activity
/delivery/proposals                       Proposal pipeline (unchanged)
/delivery/proposal/:id                    Accept → choose "new WP" or "add to existing WP"
/admin/programme-templates                Now edits WP + Site sections together
```

The existing `/delivery/project/:id` route stays as a redirect to `/delivery/wp/:wpId/site/:siteId` so no external link breaks.

## 9. Roles (unchanged shape, new scope)

| Capability | admin | engineer | pm | delivery_mgr | client (org) | external viewer |
|---|---|---|---|---|---|---|
| See programmes/WPs in org | ✓ | ✓ | ✓ | ✓ | own account | ✗ |
| Create programme / WP | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Accept proposal → WP | ✓ | ✓ | ✓ | ✗ | own account | ✗ |
| Edit WP tasks & milestones | ✓ | ✓ if wp_team | ✓ | ✓ | ✗ | ✗ |
| Edit site tasks | ✓ | ✓ if wp_team | ✓ | ✓ | ✗ | ✗ |
| Upload handover docs | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ if permitted |
| Approve handover | ✓ | ✗ | ✓ | ✓ | ✓ (own account, sign-off) | ✗ |
| Manage templates | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |

RLS rule: `org_id = user.org OR EXISTS wp_access(user_id=auth.uid())`.

## 10. Phased build (from here)

- **Phase 2a — Reframe & WP shell** (this phase): M5 + M6 migrations; new `/delivery` (programmes list), `/delivery/programme/:id`, `/delivery/wp/:id/overview + /sites + /tasks + /milestones`; Proposal-accept flow updated to attach to a WP.
- **Phase 2b — Matrix + Gantt**: M7 migration; readiness matrix, WP Gantt with grouped site rows, cross-level dependency rules evaluator.
- **Phase 2c — Templates v2 + acceptance RPC**: M8 migration; seed WP templates; `accept_proposal_into_wp` with confirmation preview modal (shows WP, sites added, tasks that will be created, estimate frozen).
- **Phase 3 — Handover & evidence**: handover doc checklist, per-site sign-off, WP-level completion certificate PDF.
- **Phase 4 — Commercial rollup**: forecast vs actual, GM%, invoice milestones (read-only surface first).

## 11. Explicitly out of scope this step
- No changes to Connect, Design, Estimate, BOQ or rulesets tables.
- No deletion of the Phase-1 `projects` / `project_*` tables — they are repurposed via views.
- No time-tracking beyond `actual_hours`, no live collaboration, no third-party PM sync.

Awaiting approval to run M5 + M6 and build the Phase-2a UI.
