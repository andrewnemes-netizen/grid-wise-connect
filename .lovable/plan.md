
# Gridwise Infrastructure Delivery OS — Architecture Design Document (ADD)

**Status:** Draft v1 for approval. No code, migrations, or UI will be written until you sign off.
**Scope:** Phase 1 foundation only. Existing Gridwise Connect features are *wrapped and inherited*, not rewritten.

---

## 1. Guiding principles

1. **Work Package is the operational atom.** All PM, commercial, resourcing and reporting rolls up to WP, not Site or Project.
2. **Everything inherits downward.** A Site never re-enters data the WP already knows (Client, framework rates, RAMS template, DNO region, PM, commercial terms).
3. **Config over code.** Workflows, templates, roles, and BOQ recipes are JSON in the DB — no releases needed to onboard a new client.
4. **Wrap, don't rewrite.** Existing `sites`, `studies`, `design_scenarios`, `unit_rates`, `dno_rulesets`, `org_members` stay; new hierarchy links to them via FKs.
5. **Hybrid tenancy.** Gridwise-internal org owns the platform; Clients / Installers / DNOs are external parties granted scoped access at the Work Package (or Programme) level.
6. **Scale target:** 100 clients · 500 WPs · 10 000+ sites · 1 000+ concurrent users. Every table indexed on tenant + parent FK; every list endpoint paginated.

---

## 2. Proposed challenges to the brief

Before locking the model I'm flagging three deviations from the brief that I believe are correct — please confirm or overrule in review:

| # | Brief says | I propose | Why |
|---|---|---|---|
| A | `Client → Framework → Programme → Work Package` | Insert **Account** between Client and Framework, and allow Framework to be optional (some direct-award WPs have no framework). | Real commercial reality: one Client (Connected Kerb) has many Accounts (Plymouth CC, Devon CC), each buying under different Frameworks or direct. |
| B | Lead → Account → Programme … | Keep **Lead** and **Opportunity** in a lightweight CRM sub-domain that *converts* into Account + WP. Don't fuse CRM with delivery. | Sales-stage churn shouldn't pollute delivery data; conversion event is the clean handover. |
| C | One workflow per client | Workflow is attached to **Work Package Type** (e.g. "LEVI on-street", "Depot hub", "Solar+BESS", "ICP-only"), not Client. Client can override. | Same client runs multiple product lines with different stage gates. |

---

## 3. Domain model (logical)

```text
                       ┌──────────────┐
                       │ Organisation │  (existing — Gridwise-internal + external partners)
                       └──────┬───────┘
                              │ owns / partners
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
    ┌────────┐           ┌──────────┐         ┌───────────┐
    │ Client │──────────▶│ Account  │────────▶│ Framework │ (optional)
    └───┬────┘           └────┬─────┘         └─────┬─────┘
        │                     │                     │
        │                     ▼                     │
        │               ┌───────────┐               │
        └──────────────▶│ Programme │◀──────────────┘
                        └─────┬─────┘
                              ▼
                     ┌────────────────┐        ┌────────────┐
                     │ Work Package   │───────▶│ WP Team    │ (PM, CM, delivery lead)
                     └───────┬────────┘        └────────────┘
                             │ 1..N
                             ▼
                        ┌────────┐           (wraps existing `sites`)
                        │  Site  │──────────▶ Grid Study (existing `studies`)
                        └───┬────┘           Design Scenario (existing)
                            │
        ┌──────────┬────────┼─────────┬────────────┬───────────┐
        ▼          ▼        ▼         ▼            ▼           ▼
     Assets    Tasks   Documents  Inspections  Variations  DNO Application
                            │
                            └── Photos, RAMS, Permits, Commissioning records
```

Cross-cutting:
- **Contact** (person) ↔ Client/Account/Supplier via join table with role.
- **Supplier / Resource** referenced by Task, BOQ line, Procurement.
- **Risk / Issue** attached at any level (WP, Site, Task).
- **Audit event** on every state change.

---

## 4. Tenancy & access (hybrid model)

**Roles** (extends existing `user_roles`):

| Role | Scope | Sees |
|---|---|---|
| `gridwise_admin` | platform | everything |
| `gridwise_engineer` | platform | everything, edit designs/estimates |
| `client_admin` | Client | all Accounts / Programmes / WPs under that Client |
| `client_user` | Client (read) | assigned Programmes only |
| `installer` | Work Package(s) | only WPs shared with them, filtered doc set |
| `dno_reviewer` | Work Package(s) | DNO application + supporting docs only |
| `pm` / `commercial` / `delivery` | Work Package(s) | assigned WPs, full ops view |

**Access grant table:** `wp_access(user_id, work_package_id, role, granted_by, expires_at)` — this is the enforcement point for external portal users. Programme- and Client-level access implies access to all children.

**RLS pattern:** every operational table carries `work_package_id` (denormalised where needed). Policies check `has_role('gridwise_*')` OR `EXISTS wp_access` OR inherited scope. Follows the existing `has_role` SECURITY DEFINER pattern.

---

## 5. Database schema (Phase 1 tables)

New tables (all `public`, RLS on, GRANTs to authenticated + service_role):

**CRM / commercial**
- `clients` — name, primary_contact_id, status, tenant_org_id
- `accounts` — client_id, name, region, billing terms
- `contacts` — person, email, phone, role (join to client/account/supplier)
- `frameworks` — name, awarding_body, start, end, rate_card_id
- `leads`, `opportunities` — thin CRM, convert into accounts/WPs

**Delivery hierarchy**
- `programmes` — account_id, framework_id (nullable), name, target_sites, dates
- `work_packages` — programme_id, wp_type_id, code, pm_user_id, commercial_user_id, status, budget, dates, config_json
- `work_package_types` — key ("levi_onstreet", "hub", "icp"), default_workflow_id, default_template_bundle_id
- `wp_team` — work_package_id, user_id, role
- `wp_access` — external portal access (as above)

**Site & assets** (wrappers)
- `wp_sites` — work_package_id, site_id (FK to existing `sites`), sequence, local_ref
- `site_assets` — site_id, asset_type, spec_json, install_status
- `site_tasks` — site_id, stage_id, template_task_id, assignee, due, status
- `site_inspections`, `site_photos`, `site_documents`

**Workflow & templates**
- `workflows` — key, name, version, stages_json (array of stages + gates + required artefacts)
- `workflow_instances` — wp_id or site_id, workflow_id, current_stage, state_json
- `template_bundles` — name, items (survey, BOQ, RAMS, permit, QA, commissioning template refs)
- `templates` — kind, name, version, body_json (renderable form / doc schema)

**Ops & commercial**
- `variations`, `risks`, `issues` — polymorphic parent (wp | site | task)
- `procurement_orders`, `supplier_directory`
- `dno_applications` — site_id, dno_key, ref, status, submitted_at, artefacts[]
- `permits` (streetworks/TTRO), `rams_docs`

**Reused (unchanged)**
- `sites`, `studies`, `design_scenarios`, `design_elements`, `design_cables`, `unit_rates`, `dno_rulesets`, `cable_catalogue`, `organisations`, `org_members`, `user_roles`, `profiles`, `notifications`, `audit_log`.

**FK wiring to existing world:**
- `wp_sites.site_id → sites.id`
- `studies.wp_id` (new nullable column, back-fill later) → `work_packages.id`
- `unit_rates` gains optional `framework_id` for framework-specific rate cards; global rates keep null.

---

## 6. Workflow engine (config-driven JSON)

A workflow document (versioned, immutable once published):

```jsonc
{
  "key": "levi_onstreet_v1",
  "stages": [
    { "id": "site_selection",  "label": "Site selection",  "owner_role": "pm",
      "gates": [ { "type": "field", "field": "site.postcode", "op": "not_null" } ] },
    { "id": "grid_feasibility","label": "Grid feasibility","owner_role": "gridwise_engineer",
      "gates": [ { "type": "artefact", "template": "gridwise_connect_report" } ],
      "auto_advance_when": { "study.workflow_status": "validated" } },
    { "id": "estimate",        "label": "Estimate",        "gates": [ { "type": "artefact", "template": "boq_v1" } ] },
    { "id": "client_approval", "gates": [ { "type": "approval", "role": "client_admin" } ] },
    { "id": "survey" }, { "id": "design" }, { "id": "dno" }, { "id": "streetworks" },
    { "id": "traffic_management" }, { "id": "permits" }, { "id": "construction" },
    { "id": "commissioning" }, { "id": "energisation" }, { "id": "as_built" },
    { "id": "invoice" }, { "id": "closed" }
  ]
}
```

- Instances live in `workflow_instances`; a background worker (Edge Function) evaluates `auto_advance_when` on relevant DB events.
- Existing `design_workflow_events` and `studies.workflow_status` feed events into the engine — direct reuse, no duplication.
- Gates support: `field`, `artefact` (template rendered & signed), `approval` (role gate with audit), `external` (DNO ack).

---

## 7. Template engine

- `template_bundles` = named set of templates a Client/Account/WP-type uses.
- Resolution order (first hit wins): WP override → WP type default → Account → Client → Framework → Gridwise default.
- Templates render to HTML/PDF for docs, or React forms for surveys/QA (schema-driven, no hard-coded forms per client).

---

## 8. Work Package dashboard (spec, not build)

Single roll-up view driven by materialised views:
- **Progress** — % sites past each stage.
- **Programme** — Gantt of WP milestones + site delivery dates.
- **Commercial** — budget vs forecast vs actual (from estimates + variations + POs).
- **Risks/Issues** — top N by severity.
- **Resources** — assigned team + supplier load.
- **Permits & DNO** — status counters + overdue list.
- **Designs & Studies** — links into existing Gridwise Connect pages.

Roll-ups computed by SQL views (`wp_summary`, `wp_stage_counts`) refreshed on write via triggers on child tables; keeps read latency flat as data grows.

---

## 9. Folder & document strategy

- One canonical tree per WP in Supabase Storage: `wp/{wp_code}/{site_code}/{stage}/{artefact}`.
- `site_documents` and `wp_documents` rows are the source of truth; storage paths derived.
- Every doc has: template_id, version, generated_by (system|user), signed_by, retention_class.

---

## 10. GIS integration

Reuse the existing MapLibre + PostGIS stack:
- Sites already carry lat/lng and boundary → surfaced at WP level as a WP map (all sites of a WP on one canvas).
- New `wp_areas` (optional polygon) for programme boundaries / LA areas.
- Existing DNO / OS / planning layers unchanged; layer toggles now aware of WP context (e.g. auto-focus WP bbox).

---

## 11. AI integration points (hooks only, no build in Phase 1)

Reserved seams:
- **AI Estimator** — reads BOQ template + Gridwise Connect output + rate card → drafts estimate lines.
- **AI PM** — watches `workflow_instances` + overdue tasks → recommends actions.
- **AI Cable/Design Advisor** — already exists; will be called from Design stage gate.
- **AI Doc Generator** — RAMS / permit narratives from template + site facts.

All AI calls route through Lovable AI Gateway; each seam is a named Edge Function with a stable contract so modules can be swapped.

---

## 12. API structure

- **Data plane:** Supabase Data API (PostgREST) with RLS. Client code uses generated types.
- **Compute plane:** Edge Functions, one per bounded capability:
  - `wp-summary`, `wp-rollup-refresh`
  - `workflow-tick`, `workflow-transition`
  - `template-render`, `doc-generate`
  - `estimate-generate`, `boq-recipe-apply`
  - existing: `gridwise-*`, `ev-hub-engine`, DNO ingesters, etc.
- **Portal boundaries:** external partners hit the same Supabase project but under scoped roles + `wp_access` policies; no separate API surface required.

---

## 13. Migration & compatibility plan

1. Ship new tables **empty**; RLS locked.
2. Back-fill: create one default Client + Account + Programme + WP per existing `organisations` row, attach all their existing `sites`/`studies`.
3. Existing pages keep working (they read `sites`/`studies` directly). New WP pages read the new tables. No breaking change.
4. Deprecate ad-hoc "portfolio" grouping once WP dashboard reaches parity.

---

## 14. Scalability decisions

- Every operational table indexed on `(tenant_org_id, work_package_id)` and appropriate parent FK.
- List queries paginated (keyset) — no `OFFSET` on large tables.
- Roll-up views instead of client-side aggregation.
- Heavy compute stays in Edge Functions with chunked/resumable patterns (same approach used for DNO ingesters).
- GIS queries continue to use GiST + `ST_DWithin` (project standard).

---

## 15. Future modules — architectural readiness

Reserved without building: AI Estimating, Recipe Engine, BOQ Automation, Construction Pack, RAMS Generator, Permit Generator, Resource Planner, Procurement, Commercial Mgmt, PM, Client/DNO/Installer Portals, Maintenance, AI PM. Each maps to a table group + Edge Function slot already listed above.

---

## 16. Open questions for your review

1. Confirm the **Account** insertion between Client and Framework, and Framework being optional.
2. Confirm **Work Package Type** (not Client) as the owner of the default workflow.
3. Confirm keeping **Lead/Opportunity** separate from delivery hierarchy (convert-on-win).
4. Confirm hybrid tenancy roles list in §4 — anyone missing (e.g. Local Authority observer, Landlord)?
5. Confirm the 16-stage workflow in §6 as the seeded default for `levi_onstreet_v1`; different default for `hub` / `icp`?
6. Confirm reuse of existing `studies` / `design_scenarios` as-is (with an added nullable `wp_id`).
7. Any Phase 1 modules from the "future" list you actually want promoted into Phase 1?

---

## 17. Deliverable

This document. **No schema, no code, no UI changes.** On approval (with answers to §16), the next step is a Phase 1 build plan broken into vertical slices: (a) core hierarchy + RLS, (b) WP dashboard read-only, (c) workflow engine + seeded workflow, (d) template engine + one bundle, (e) back-fill migration.
