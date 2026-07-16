
# Pre-Construction Workflow — Reuse & Duplication Review

No implementation until this map is approved. Everything below is additive and extends existing modules.

## 1. Existing-component reuse map

| Workflow concern | Existing component (reused, not replaced) |
|---|---|
| Shell + tabs | `src/pages/WorkPackageShell.tsx`, `src/pages/wp/WpTabs.tsx` |
| Site Register (extend in place) | `src/pages/wp/tabs/WpSiteRegisterTab.tsx` |
| Bulk site intake | `src/pages/ImportWizard.tsx` |
| Portfolio view of sites | `src/pages/Portfolio.tsx`, `src/pages/SiteDetail.tsx` |
| Survey send / capture | `src/components/portfolio/SendSurveyDialog.tsx`, `src/components/site/SiteSurveysPanel.tsx` |
| Estimating | `src/components/delivery/estimate/EstimateEditor.tsx`, `src/components/delivery/WpEstimatePanel.tsx`, existing rate/recipe engine |
| Quotation → client decision | existing `SendQuotationDialog.tsx` + `quotation_sends` + `site_estimates` decision fields |
| Tasks (WP-level) | `src/components/delivery/board/TaskBoard.tsx`, `src/components/delivery/TaskGantt.tsx` on `wp_tasks` |
| Tasks (site delivery) | existing `project_tasks` boards in delivery project |
| Design | `src/components/map/DesignModePanel.tsx`, `src/lib/connectDesignBridge.ts`, `src/pages/wp/tabs/WpDesignTab.tsx`, `WpGridStudiesTab.tsx`, Gridwise orchestrator (`src/lib/gridwise`) |
| DNO validation | `src/components/map/DnoRulesValidatorPanel.tsx` |
| DNO offers | `src/pages/wp/tabs/WpDnoOffersTab.tsx` on `dno_offers` |
| RAMS / permits / TM | existing `WpPreConTab.tsx` on `rams_documents`, `permits`, `traffic_management_plans` |
| Files | `src/components/delivery/ProjectFiles.tsx` on `project_files` (entity-linked) |
| Notifications | `useNotifications` + `notifications` table |
| Audit | `audit_log` |
| Partners | `src/pages/wp/tabs/WpPartnersTab.tsx` on `wp_partner_allocations` / `partners` |

No new Site Register, Portfolio, Survey UI, Estimate editor, Design UI, Task board, File repo or Notification centre will be created.

## 2. Existing-table reuse map

| Domain | Canonical table (reused) |
|---|---|
| Site master | `sites` (+ `sites.current_stage_id`) |
| WP membership | `wp_sites` |
| Lifecycle history | `site_stage_history` + `stage_definitions` + `stage_transition_rules` |
| WP tasks | `wp_tasks` (+ `wp_task_dependencies`) |
| Site delivery tasks | `project_tasks` (+ `project_task_dependencies`) |
| Surveys | `site_surveys` (+ `site_survey_responses`) |
| DNO offers | `dno_offers` (+ `dno_offer_sites`) |
| Estimates | `estimates`, `work_package_estimates`, `wp_estimate_sites`, `site_estimates`, `site_estimate_lines`, `site_estimate_exceptions` |
| Quotations / client decision | `quotation_sends` + decision fields on `site_estimates` |
| Design | `design_submissions`, `design_scenarios`, `design_reviews`, `design_workflow_events`, `design_cables`, `design_elements` |
| DNO validation | `dno_rulesets`, `ev_hub_rulesets`, `ruleset_change_log` |
| RAMS / permits / TM | `rams_documents`, `permits`, `traffic_management_plans` |
| Files & photos | `project_files`, `site_photos` |
| Notifications | `notifications` |
| Audit | `audit_log` |
| Partners | `wp_partner_allocations`, `partners`, `partner_users` |
| Delivery release | existing `projects` / `project_tasks` (one `delivery_project_id` per WP) |

No `precon_sites`, `poc_sites`, `quotation_sites`, `survey_sites`, `design_sites` or parallel Site/Portfolio/Task/File tables will be created.

## 3. Genuinely missing pieces (only these are new)

Additive columns on existing tables (nullable, defaulted):

- `sites.next_action_label text`, `sites.next_action_due date`, `sites.blocker_reason text` — display cache for register; owned by workflow, cleared by triggers.
- `dno_offers.site_id uuid null references sites(id)` — link an offer to a specific site inside the WP (currently WP-level only). `dno_offer_sites` remains for multi-site offers.
- `design_submissions.site_id uuid null references sites(id)` and `design_submissions.design_type text check in ('ev','icp')` — enables per-site + parallel EV/ICP tracks without a new table.
- `wp_tasks.task_kind text` (enum-checked: `poc`, `estimate`, `client_decision`, `survey_alloc`, `design_ev`, `design_icp`, `rams`, `design_review`, `precon_gate`, `other`) — lets the register locate the active task per lane without a status duplication on sites.
- `wp_tasks.site_id uuid null references sites(id)` if not already present — per-site workflow tasks live on `wp_tasks`, site delivery tasks stay on `project_tasks`.

New tables (only where a genuinely missing child record exists):

- `site_precon_gates` — one row per site per gate (`poc`, `commercial`, `design_ev`, `design_icp`, `rams`, `final_review`) with `state` (`open`/`passed`/`waived`), `passed_at`, `passed_by`, `evidence_ref`. Required because gates are not statuses on any existing entity and are the mechanism that releases `project_tasks`. Columns: `id, work_package_id, site_id, gate_key, state, passed_at, passed_by, evidence_ref, notes, created_at, updated_at`.

Nothing else new. No new survey/estimate/design/task/file tables.

## 4. Proposed consolidated view

```sql
create or replace view public.v_wp_site_precon_status as
select
  ws.work_package_id,
  ws.id                as wp_site_id,
  ws.sequence, ws.local_ref,
  s.id                 as site_id,
  s.site_name, s.postcode, s.viability_index,
  s.current_stage_id, sd.label as current_stage_label,
  -- POC lane
  poc.id  as poc_task_id, poc.status as poc_status, poc.due_date as poc_sla_date,
  -- DNO offer
  dof.id  as latest_offer_id, dof.status as latest_offer_status,
        dof.offer_value as latest_offer_value, dof.received_at as latest_offer_at,
  -- Estimate / quotation / client decision
  se.id   as latest_site_estimate_id, se.status as estimate_status,
        se.client_decision as client_decision, se.decided_at as client_decided_at,
  -- Survey
  sv.id   as latest_survey_id, sv.status as survey_status, sv.completed_at as survey_completed_at,
  -- Design (EV + ICP, latest per type)
  d_ev.id as ev_design_id,  d_ev.status  as ev_design_status,
  d_ic.id as icp_design_id, d_ic.status  as icp_design_status,
  d_ev.approved_by as ev_designer, d_ic.approved_by as icp_designer,
  -- RAMS
  ram.id  as latest_rams_id, ram.status as rams_status,
  -- Review gate
  rev.state as final_review_state,
  -- Display cache
  s.next_action_label, s.next_action_due, s.blocker_reason,
  greatest(s.updated_at, coalesce(poc.updated_at,'-infinity'),
                         coalesce(se.updated_at,'-infinity'),
                         coalesce(sv.updated_at,'-infinity'),
                         coalesce(d_ev.updated_at,'-infinity'),
                         coalesce(d_ic.updated_at,'-infinity')) as last_activity_at
from wp_sites ws
join sites s               on s.id = ws.site_id
left join stage_definitions sd on sd.id = s.current_stage_id
left join lateral (select * from wp_tasks t
                    where t.work_package_id=ws.work_package_id and t.site_id=s.id
                      and t.task_kind='poc' order by t.updated_at desc limit 1) poc on true
left join lateral (select * from dno_offers o
                    where o.work_package_id=ws.work_package_id
                      and (o.site_id=s.id or exists (select 1 from dno_offer_sites x
                              where x.dno_offer_id=o.id and x.site_id=s.id))
                    order by o.received_at desc nulls last limit 1) dof on true
left join lateral (select * from site_estimates x
                    where x.site_id=s.id order by x.updated_at desc limit 1) se on true
left join lateral (select * from site_surveys x
                    where x.site_id=s.id order by x.updated_at desc limit 1) sv on true
left join lateral (select * from design_submissions x
                    where x.work_package_id=ws.work_package_id and x.site_id=s.id
                      and x.design_type='ev' order by x.revision desc limit 1) d_ev on true
left join lateral (select * from design_submissions x
                    where x.work_package_id=ws.work_package_id and x.site_id=s.id
                      and x.design_type='icp' order by x.revision desc limit 1) d_ic on true
left join lateral (select * from rams_documents x
                    where x.site_id=s.id order by x.updated_at desc limit 1) ram on true
left join lateral (select * from site_precon_gates g
                    where g.site_id=s.id and g.gate_key='final_review'
                    order by g.updated_at desc limit 1) rev on true;
```

`WpSiteRegisterTab.tsx` swaps its `wp_sites` query for `v_wp_site_precon_status` and adds columns + bulk actions. No new page.

## 5. Workflow event / automation map

All events write to `audit_log` and (where relevant) `design_workflow_events`; assignments produce `notifications`. No parallel event bus.

| Trigger | Action | Records touched |
|---|---|---|
| Import Wizard commit | Insert sites + `wp_sites` (existing) | `sites`, `wp_sites` |
| "Send for POC" (bulk) | Create `wp_tasks(task_kind='poc', site_id, due_date)`, notify assignee | `wp_tasks`, `notifications`, `audit_log` |
| POC received | Insert/link `dno_offers` (+ `dno_offer_sites` if multi), close POC task, open `estimate` task | `dno_offers`, `wp_tasks`, `notifications` |
| Estimate approved internally | Update `estimates.status`; open `client_decision` task | `estimates`, `site_estimates`, `wp_tasks` |
| Client decision | Set `site_estimates.client_decision`; pass `commercial` gate on accept | `site_estimates`, `site_precon_gates` |
| Send Survey | Existing `SendSurveyDialog` creates `site_surveys` + notification | `site_surveys`, `notifications` |
| Survey submitted | Existing completion flow; close `survey_alloc` task | `site_surveys`, `wp_tasks` |
| Design submit (EV/ICP) | `design_submissions` insert (revision++, `design_type`) | `design_submissions`, `design_workflow_events` |
| Design approved | Pass `design_ev` / `design_icp` gate | `site_precon_gates` |
| RAMS approved | Pass `rams` gate | `site_precon_gates` |
| Final review passed | Insert `site_stage_history`, update `sites.current_stage_id='ready_for_delivery'`, release relevant `project_tasks` (`status: blocked → ready`) on the WP's single `delivery_project_id` | `site_stage_history`, `sites`, `project_tasks`, `audit_log` |

Gate rule for "Ready for Delivery": `commercial` ∧ (`design_ev` ∨ `design_icp` as required by scope flags) ∧ `rams` ∧ `final_review` all `passed`. POC lane can remain open if a variant offer is being negotiated — parallel, not sequential.

## 6. Non-duplication proof

- Site Register: same file (`WpSiteRegisterTab.tsx`) edited in place; query source changes to a view over existing tables. No second register page introduced.
- Sites: only `wp_sites` membership + `sites.current_stage_id` used; three cache columns added on `sites` are display-only, not workflow status.
- Tasks: workflow tasks on `wp_tasks` (WP scope); delivery tasks stay on `project_tasks`. Both boards already exist; no third board.
- Estimates: `EstimateEditor` + existing tables only; no shadow estimate engine.
- Design: `design_submissions` extended with `site_id` and `design_type` — enables per-site and EV/ICP parallelism without a new table.
- Surveys: only existing `site_surveys` used; no `precon_survey` table.
- DNO: `dno_offers` + `dno_offer_sites` (link table already exists) — the added `dno_offers.site_id` is a convenience for single-site offers and is nullable.
- Statuses: each lane's status lives on its own record. `sites.current_stage_id` remains the sole lifecycle field on `sites`. `site_precon_gates` is the only new state store and holds gates that no existing table represents.
- Delivery: one `delivery_project_id` per WP is preserved; final gate releases existing `project_tasks`, does not create a second project.
- Files / notifications / audit: single existing tables used throughout.

## 7. Migration plan (additive only)

Single migration, no drops, no renames, no data copies:

1. `alter table sites add column next_action_label text, add column next_action_due date, add column blocker_reason text;`
2. `alter table dno_offers add column site_id uuid references sites(id);` (nullable; index on `(work_package_id, site_id)`)
3. `alter table design_submissions add column site_id uuid references sites(id), add column design_type text check (design_type in ('ev','icp')) default 'ev';` (backfill existing rows to `ev`)
4. `alter table wp_tasks add column task_kind text, add column site_id uuid references sites(id);` (with a CHECK constraint on the allowed `task_kind` values; index on `(work_package_id, site_id, task_kind)`)
5. `create table site_precon_gates (…)` + GRANTs (`authenticated`, `service_role`) + RLS mirroring `wp_sites` visibility + `updated_at` trigger.
6. `create or replace view v_wp_site_precon_status as …` (Section 4).
7. Grant `select` on the view to `authenticated`.

No changes to `sites` primary keys, RLS structure of existing tables, or existing status columns.

## 8. Acceptance tests (Import → POC → Estimate → Survey → Design → Delivery)

Each is a scripted test on one WP:

1. **Import** — Import Wizard commits 5 rows → 5 new `sites`, 5 `wp_sites`, no duplicates on re-import (idempotent by external ref).
2. **Register** — `v_wp_site_precon_status` returns 5 rows with `current_stage_label='new'`; `WpSiteRegisterTab` renders them without new component files.
3. **POC** — Bulk "Send for POC" on 3 rows creates 3 `wp_tasks(task_kind='poc')`, 3 notifications, 3 audit entries; no new tables written.
4. **Offer** — Recording a `dno_offer` with `site_id` closes the matching POC task and opens an `estimate` task; register shows offer value + estimate status.
5. **Estimate & decision** — Creating an estimate in `EstimateEditor` and marking client "accepted" flips `site_estimates.client_decision` and passes `commercial` gate in `site_precon_gates`.
6. **Survey** — `SendSurveyDialog` creates a `site_surveys` row; on submission the survey lane in the register updates without new UI.
7. **Design parallelism** — Submitting an EV design and an ICP design produces two `design_submissions` rows with different `design_type`; register shows both statuses; approving each passes the respective gate.
8. **RAMS** — Approving a `rams_documents` row passes the `rams` gate.
9. **Final gate & delivery release** — Passing `final_review` writes `site_stage_history`, sets `sites.current_stage_id='ready_for_delivery'`, and flips the site's `project_tasks` on the WP's existing `delivery_project_id` from `blocked` to `ready`. No new delivery project is created.
10. **Rejected sites** — A rejected client decision keeps the site in `wp_sites` (soft state), does not delete records, and is filterable in the register.

Once approved, implementation proceeds strictly against this map.
