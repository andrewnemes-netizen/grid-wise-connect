
# Gridwise Delivery — Project Management Layer (Plan Only)

## 1. Guiding decisions (from earlier answers)
- **ADD scope**: no changes to Connect, Design or Estimate modules.
- **Existing data**: wrap & inherit — reuse `accounts`, `contacts`, `sites`, `studies`, `programmes`, `work_packages`, `work_package_types`, `workflows`, `workflow_instances`. Do not duplicate estimates or BOQs; reference them.
- **Tenancy**: hybrid — org-scoped RLS via `org_members` (as today) plus per-project ACL for external collaborators (client, DNO, ICP).
- **Workflow engine**: config-driven JSON (extend the existing `workflows.stages_json` pattern; templates live in DB, not code).

## 2. Business object chain (mapped to what exists)

```text
Account (accounts)
  └── Contact (contacts)
       └── Site (sites)
            └── Gridwise Study (studies)
                 └── Estimate  (studies.cost_estimate_json + studies.bom_json)   [read-only reference]
                      └── Proposal (NEW: proposals)
                           └── Project (NEW: projects  — wraps a work_package)
                                ├── Milestone (NEW: project_milestones)
                                ├── Task (NEW: project_tasks)
                                │    ├── Dependency (NEW: project_task_dependencies)
                                │    ├── Comment  (NEW: project_comments)
                                │    ├── File     (NEW: project_files)
                                │    └── Activity (NEW: project_activity)
                                ├── Member (NEW: project_members)
                                └── Phase pointers → Procurement / Delivery / Commissioning / Handover
                                    (implemented as milestone `phase` enum, not separate tables)
```

Key rule: **a Project is always born from an accepted Proposal, which is bound to exactly one Study**. This is how BOQ/route/estimate data flows in without re-entry.

## 3. New tables (all additive)

1. **`proposals`** — `study_id (FK studies)`, `account_id`, `contact_id`, `version`, `status` (draft / sent / accepted / rejected / expired), `total_amount`, `valid_until`, `snapshot_json` (frozen copy of study cost_estimate + bom at send-time), `accepted_at`, `accepted_by`.
2. **`projects`** — `proposal_id (FK, unique)`, `work_package_id (FK work_packages, unique nullable)`, `account_id`, `site_id`, `study_id`, `code`, `name`, `status` (planning / active / on_hold / completed / cancelled), `priority` (low/med/high/critical), `health` (green/amber/red), `start_date`, `target_end_date`, `actual_end_date`, `percent_complete` (computed via trigger from milestones/tasks), `template_id (FK programme_templates nullable)`, `org_id`, `config_json`.
3. **`project_members`** — `project_id`, `user_id`, `role` (owner / pm / engineer / commercial / delivery / client_viewer / dno_viewer / icp), `added_at`. Powers per-project ACL alongside org RLS.
4. **`project_milestones`** — `project_id`, `name`, `phase` enum (`procurement | delivery | commissioning | handover | custom`), `sequence`, `planned_date`, `actual_date`, `status`, `percent_complete`.
5. **`project_tasks`** — `project_id`, `milestone_id (nullable)`, `parent_task_id (nullable, self-FK)`, `title`, `description`, `status` (todo / in_progress / blocked / review / done), `priority`, `owner_user_id`, `start_date`, `due_date`, `estimated_hours`, `actual_hours`, `percent_complete`, `sort_index`, `boq_ref` (nullable text — link to a BOQ line in the study snapshot), `metadata_json`.
6. **`project_task_dependencies`** — `task_id`, `depends_on_task_id`, `type` (FS / SS / FF / SF), `lag_days`. UNIQUE(task, depends_on), CHECK(task ≠ depends_on). Cycle prevention via trigger.
7. **`project_comments`** — `project_id`, `task_id (nullable)`, `milestone_id (nullable)`, `author_user_id`, `body_md`, `mentions_json`, `created_at`.
8. **`project_files`** — `project_id`, `task_id (nullable)`, `storage_path`, `filename`, `mime`, `size_bytes`, `uploaded_by`. Uses a new private Cloud storage bucket `project-files`.
9. **`project_activity`** — append-only feed: `project_id`, `actor_user_id`, `entity_type`, `entity_id`, `action` (created/updated/status_changed/assigned/commented/file_added/dependency_added…), `diff_json`, `created_at`. Populated by triggers on the other 6 tables.
10. **`programme_templates`** — `name`, `wp_type_key` (links to `work_package_types.key`), `version`, `is_published`, `template_json` (milestones + tasks + dependency graph + default owners/roles + default durations). Config-driven engine reads this at project-creation time.
11. **`programme_template_bindings`** *(optional, phase 3)* — allow multiple templates per WP type, plus per-account overrides.

### Relationships summary
- `accounts` 1—∞ `contacts`, `programmes`
- `sites` 1—∞ `studies`
- `studies` 1—∞ `proposals` (versioned)
- `proposals` 1—1 `projects` (on acceptance)
- `projects` 1—1 `work_packages` (project *wraps* an existing WP; if no WP exists, one is created and linked)
- `projects` 1—∞ `project_milestones` 1—∞ `project_tasks`
- `project_tasks` ∞—∞ `project_tasks` via `project_task_dependencies`

## 4. Read-only ties into existing data (no duplication)
- Estimate + BOQ: read from `studies.cost_estimate_json` / `bom_json`; the proposal freezes a snapshot on send, and tasks reference BOQ lines via `boq_ref` string keys.
- Route/geometry: read from `studies.route_geojson` and `sites.geom`.
- Rulesets / voltage / DNO: inherited from the parent study — never re-entered on the project.
- Programme grouping: `projects.work_package_id → work_packages.programme_id` gives the programme rollup for free.

## 5. Migration plan (four migrations, each self-contained; each `CREATE TABLE` in `public` includes GRANTs + RLS + policies)

- **M1 — Proposals + Projects skeleton**: `proposals`, `projects`, `project_members`; enums; `update_updated_at` triggers; RLS (org_id + membership); GRANTs to `authenticated` and `service_role`.
- **M2 — Delivery objects**: `project_milestones`, `project_tasks`, `project_task_dependencies`; cycle-prevention trigger; % complete rollup trigger (task→milestone→project).
- **M3 — Collaboration**: `project_comments`, `project_files`, `project_activity`; storage bucket `project-files` (private) + storage RLS; activity trigger writers on the M1/M2/M3 tables.
- **M4 — Templates**: `programme_templates`; seed 2 templates (`ev_hub_delivery_v1`, `lv_connection_delivery_v1`); RPC `create_project_from_proposal(proposal_id, template_id)` that (a) inserts project, (b) links/creates the WP, (c) expands template_json into milestones/tasks/dependencies, (d) writes activity rows.

No changes to any existing tables in M1–M4. If later needed, add `projects_id` FK to `studies` in a separate M5 (backfill from `proposals`), but not required for first release.

## 6. Page & UI structure (new routes only; sidebar gains a "Delivery" section)

```text
/delivery                       Project list (default landing)
/delivery/projects              List view with saved filters
/delivery/projects/new          Manual create OR "from accepted proposal"
/delivery/project/:id           Project workspace shell
   ├── /overview                Health, %, next milestone, KPI cards, activity feed
   ├── /tasks?view=list         List view  (default)
   ├── /tasks?view=kanban       Kanban by status
   ├── /tasks?view=gantt        Gantt with dependencies
   ├── /milestones              Milestone timeline + phase (Procurement→Handover)
   ├── /files                   File library (bucket-backed)
   ├── /members                 Members + external ACL
   └── /settings                Template used, WP link, priority, dates
/delivery/proposals             Proposal pipeline (per Study/Account)
/delivery/proposal/:id          Proposal detail → "Accept & Create Project"
/admin/programme-templates      Template CRUD (admin only)
```

Study detail (`/study/:id`) gets a small **non-invasive** "Delivery" side card that surfaces existing/new proposals and, once accepted, links to the project. This is the only touchpoint outside the new module.

## 7. Role permissions (hybrid tenancy)

| Capability | admin | engineer | client (org) | project_member (any role) | external viewer (client_viewer / dno_viewer / icp) |
|---|---|---|---|---|---|
| See any org project | ✓ | ✓ | own org only | — | — |
| Create proposal from study | ✓ | ✓ | ✗ | ✗ | ✗ |
| Accept proposal | ✓ | ✓ | own account | ✗ | ✗ |
| Create project (auto on accept) | ✓ (system) | ✓ (system) | via accept | — | — |
| Edit project / tasks / milestones | ✓ | ✓ if member | ✗ | owner/pm/engineer only | ✗ (read subset) |
| Comment / upload file | ✓ | ✓ if member | ✓ if member | ✓ | ✓ if permitted by role |
| Manage templates | ✓ | ✗ | ✗ | ✗ | ✗ |

RLS rule of thumb: `org_id = user.org OR EXISTS project_members(user_id=auth.uid())`. External viewers get scoped SELECT policies only.

## 8. Phased implementation plan

- **Phase 0 — Planning (this doc)**. No code.
- **Phase 1 — Foundations (M1 + M2 migrations)**: proposals, projects, milestones, tasks, dependencies, members, RLS, rollup triggers. Minimal UI: list view + task list view + "Accept proposal → project" flow. Study card link.
- **Phase 2 — Views**: Kanban + Gantt (uses `@tanstack/react-table` + a lightweight gantt renderer), filters, saved views.
- **Phase 3 — Collaboration (M3)**: comments, file uploads (private bucket), activity feed, notifications hook into existing `notifications` table.
- **Phase 4 — Templates (M4)**: template CRUD, `create_project_from_proposal` RPC, seed EV hub + LV connection templates, auto-expansion of milestones/tasks/deps on acceptance.
- **Phase 5 — Hardening**: external ACL polish, exports (CSV / PDF summary reusing existing PDF pipeline), analytics widgets in `/portfolio`.

## Out of scope for this planning step
- Any edit to Connect, Design, Estimate, BOQ, ruleset engines, or their tables.
- Real-time collaboration (presence, live cursors).
- Time tracking beyond `actual_hours` field.
- Third-party integrations (MS Project, Primavera, Jira) — deferred.
