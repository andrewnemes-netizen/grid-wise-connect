
# Gridwise Estimating Engine — Import mapping, schema and duplicate rules

Two workbooks inspected. This is the proposal only — no schema is created until you approve.

## 1. What is actually in the two workbooks

### A. `CK_SITE_BOQ_RECIPES_v2_1.xlsx` — the recipe library (283 BOQ rows)
Single flat sheet with a repeating block per recipe. Header row 7 columns:

`BOQ Recipes Name | Product/Service | Record Id (BOQ Item) | BOQ Item Name | Description | Qty | Unit of Measure | (gap) | Unit Cost | Markup as £ | Unit Price | Total Cost | Total Markup | Total Price | Stage | Allowance | Related Allowance | Include in Create Task Widget | Cost Code | Cost Code Category | Gross Margin %`

Recipe names encountered:
- `Buildout 4 Sockets CK Site`
- `Horizontal 4 Sockets CK Site`, `Horizontal 6 Sockets CK Site`
- `Vertical 4 Sockets CK Site`, `Vertical 6 Sockets CK Site`

Product/Service prefix (`CK Civils Partner_...`) tells us the delivering partner/discipline. `Stage` = Civils / Electrical / etc. `Cost Code` / `Cost Code Category` carry finance codes (`5800 - ... Civils CK`, `5000 - CK Civils`). Quantities are the default line quantities for that recipe; every row already carries cost, markup, price and GM% for that particular contract.

### B. `CK_Synthetic_rates_Partner_template_for_completion_v0.6_Bauer_Return_1.xlsx` — the rate & activity library
16 sheets. Only some are useful for import:

| Sheet | Purpose | Import? |
|---|---|---|
| `SoR - MASTER (2)` / `Overview of socket costs` | Roll-up per site type (target install / BoM / connection). Summary only, not a rate row. | No — treated as validation targets |
| `Version Control` | Rate card version metadata. | Yes — into `rate_card_versions` |
| `Example of Synthetic Workpack` | Sample work-package layout. | No — reference only |
| `Horizontal 4 socket ABC`, `Horizontal 6 socket ABC`, `Vertical 4 socket ABC`, `Vertical 6 socket ABC`, `Buildout 4 socket ABC` | Activity-based rate rows (Ser, Activity, #, Av unit £, Total £, Partner-provided, CK-provided). This is the actual SoR per site type. | **Yes — primary rate source** |
| `*_layout` sheets | Physical layout diagrams. | No |
| `Line Painting Spec` | Standard bay-marking spec text. | Reference note attached to the bay-marking rate |
| `Exceptions` | Empty exception slots (Ser 1–23). | Schema only — no data to import |

**Important:** the ABC sheets are the authoritative unit-rate source. The `_v2_1` recipe workbook is a *materialised* view of those rates × standard quantities × markup, so we treat the recipe workbook as the **default recipe quantities and prices** and the ABC sheets as the **rate items** underneath.

## 2. Proposed import mapping

### Rate items (from `*_ABC` sheets)
| Sheet column | `rate_items` field |
|---|---|
| Ser (`1.1`, `4.2`, …) | `rate_code` (prefixed with site-type slug to guarantee uniqueness across ABC sheets) |
| Activity/sub activity | `description` |
| `#` | `default_quantity` (informational, not stored on rate) |
| `Av unit £` | `total_unit_cost` (labour+material+plant combined — the ABC sheet doesn't split them, so we import into `total_unit_cost` and leave `labour_cost` / `material_cost` / `plant_cost` / `subcontract_cost` null with a `cost_split_available = false` flag) |
| Total £ | ignored (derived) |
| Partner provided / CK provided | `notes` (concatenated), plus `provided_by` enum (`partner` / `client` / `both`) |
| Sheet section (1 Survey, 4 Excavation, 5 Installation, …) | `category` |

Unit inference: rows whose activity mentions "m in footpath / trench" → `unit = 'm'`; ducting / cabling → `m`; everything else defaults to `Per Item` (matching the recipe workbook).

### Recipes (from `CK_SITE_BOQ_RECIPES_v2_1.xlsx`)
| Column | `estimate_recipes` / `recipe_items` field |
|---|---|
| BOQ Recipes Name | `estimate_recipes.name`, plus parsed → `build_type` (`horizontal/vertical/buildout`) and `socket_count` (4/6) |
| Product/Service | `estimate_recipes.delivering_partner` |
| BOQ Item Name | `recipe_items.description_override` (matched against a rate item by fuzzy name → `rate_item_id`) |
| Qty | `recipe_items.default_quantity` (unless quantity rule overrides) |
| Unit of Measure | `recipe_items.unit` (validated against rate item) |
| Unit Cost | snapshotted at approval, not stored per row (derived from rate item) |
| Markup as £ | `recipe_items.markup_amount` (per unit) |
| Unit Price | derived (`unit_cost + markup_amount`) |
| Stage | `recipe_items.stage` |
| Allowance / Related Allowance | `recipe_items.is_allowance`, `recipe_items.related_allowance_ref` |
| Include in Create Task Widget | `recipe_items.create_project_task` (→ maps to Phase-2 site tasks) |
| Cost Code / Cost Code Category | `recipe_items.cost_code`, `recipe_items.cost_code_category` |
| Gross Margin % | derived, not stored |

### Quantity rule inference (post-import mapping the estimator will confirm)
Because the recipe workbook has fixed quantities, the importer will *propose* a `quantity_rule` for each row that a user must approve before publishing v1 of the recipe. Proposal table:

| Item name contains | Proposed rule |
|---|---|
| `Trench ... footpath` / `footway` | `ROUTE_SURFACE_LENGTH` (surface=FOOTWAY) |
| `Trench ... carriageway` / `road` | `ROUTE_SURFACE_LENGTH` (surface=CARRIAGEWAY) |
| `Verge` | `ROUTE_SURFACE_LENGTH` (surface=VERGE) |
| `Lateral trench` | `FIXED` (from workbook default, editable) |
| `Ducting` | `ROUTE_LENGTH × duct_multiplier` |
| `Cabling` | `CABLE_LENGTH` |
| `EVCP` / `Chameleon duels` / `Node box` | `CHARGER_COUNT ÷ 2` (dual charger units) |
| `Feeder Pillar` | `FEEDER_PILLAR_COUNT` (default 1) |
| `Bollards` | `MANUAL_INPUT` (default from workbook) |
| `Signage` / `Bay marking` | `SOCKET_COUNT` or `MANUAL_INPUT` |
| `Survey` / `Report` / `Prelims` / `Commissioning` / handover docs | `FIXED = 1` |

Nothing is auto-published — the estimator confirms the proposed rule per row on first import.

## 3. Proposed database schema (Phase 3a)

Hierarchy: `clients → contracts → rate_cards → rate_card_versions → rate_items → estimate_recipes → recipe_items → site_estimates → site_estimate_lines → wp_estimates → wp_estimate_lines → approved_baselines`.

### New tables (all `public`, all `org_id` scoped, all with GRANTs to `authenticated`+`service_role`, all with RLS on `org_members`/`wp_access`, all with `updated_at` trigger)

```text
contracts             (client_id, name, code, currency, start_date, end_date, status)
rate_cards            (contract_id, name, code)
rate_card_versions    (rate_card_id, version_number, effective_from, effective_to,
                       status enum DRAFT|APPROVED|SUPERSEDED, source_workbook,
                       imported_at, approved_by, approved_at)
rate_items            (rate_card_version_id, rate_code, description, unit,
                       labour_cost, material_cost, plant_cost, subcontract_cost,
                       total_unit_cost, client_unit_price, cost_split_available bool,
                       category, cost_code, cost_code_category,
                       provided_by enum partner|client|both, notes,
                       UNIQUE(rate_card_version_id, rate_code))
estimate_recipes      (contract_id, name, build_type enum horizontal|vertical|buildout,
                       socket_count, delivering_partner, version_number,
                       status enum DRAFT|APPROVED|SUPERSEDED,
                       UNIQUE(contract_id, name, version_number))
recipe_items          (recipe_id, rate_item_id, description_override, unit,
                       default_quantity, quantity_rule_json,
                       markup_amount, markup_pct,
                       stage, cost_code, cost_code_category,
                       is_allowance bool, related_allowance_ref,
                       create_project_task bool, task_stage_tag,
                       sort_index)
site_estimates        (site_id, wp_id nullable, recipe_id, rate_card_version_id,
                       status enum DRAFT|REVIEW|APPROVED|SUPERSEDED,
                       revision_number,
                       total_cost, total_price, gross_profit, gross_margin_pct,
                       generated_from_design_run_id nullable,
                       approved_at, approved_by,
                       snapshot_json  -- FULL frozen copy at approval)
site_estimate_lines   (site_estimate_id, recipe_item_id nullable, rate_item_id,
                       description, unit,
                       system_quantity, manual_quantity, effective_quantity,
                       quantity_source enum SYSTEM|MANUAL|OVERRIDE,
                       unit_cost, unit_price, markup_amount,
                       total_cost, total_price, gross_profit,
                       is_allowance, is_exception, exception_reason,
                       sort_index)
site_estimate_exceptions (site_estimate_id, ser_number, type enum NON_STANDARD|PROVISIONAL|CLARIFICATION|APPROVAL_REQUIRED|EXCLUDED,
                          description, cost, price, status, raised_by, resolved_by)
wp_estimates          (wp_id, name, status enum DRAFT|REVIEW|APPROVED,
                       total_sites, total_sockets,
                       total_cost, total_price, gross_profit, gross_margin_pct,
                       cost_per_site, cost_per_socket,
                       preliminaries_cost, mobilisation_cost,
                       common_allowances_cost, contingency_pct, contingency_cost,
                       bulk_procurement_adjustment,
                       approved_at, approved_by, snapshot_json)
wp_estimate_lines     (wp_estimate_id, site_estimate_id, snapshot_totals_json)
approved_baselines    (wp_id, wp_estimate_id, baseline_number,
                       frozen_at, frozen_by,
                       boq_snapshot_json, budget_snapshot_json,
                       cost_codes_snapshot_json, procurement_requirements_json)
```

Notes:
- Every `snapshot_json` field is the immutable frozen copy referenced in your spec point 6 & 9.
- `wp_estimate_lines.snapshot_totals_json` freezes each site estimate's totals as of the WP approval, so re-estimating a site later never mutates an awarded WP.
- `approved_baselines` is what Project Management reads for BOQ/budget/procurement (point 9).

### Reuse of existing tables (no schema break)
- `accounts` → `clients`
- `work_packages` → parent for `wp_estimates`
- `sites` + `wp_sites` → parent for `site_estimates`
- `project_tasks` (aka site tasks per Phase 2) → generated from `recipe_items.create_project_task = true` at approval time, tagged with `metadata_json.stage` so the readiness matrix updates itself
- `unit_rates` (existing) → **kept**, but re-scoped as fallback/global "system rates" when no contract rate card applies. Contract-scoped `rate_items` always win.

## 4. Duplicate & inconsistency rules

Importer runs in a staging area first; nothing lands in `rate_items` / `recipe_items` until the estimator approves the diff report.

| Case | Rule |
|---|---|
| Same `rate_code` within one draft version | Reject; importer flags row |
| Same `rate_code` across versions | Allowed — that's what versioning is for |
| Same description, different `rate_code` in same version | Warn ("possible duplicate"), estimator resolves |
| Unit mismatch for same `rate_code` between two versions | Allowed but forces a new version; never mutate an approved row |
| Approved rate item edited | Blocked. Must create a new `rate_card_version` (status DRAFT) and re-approve |
| Recipe references a `rate_item_id` that's now SUPERSEDED | Recipe stays valid; approval snapshot uses the version pinned on the recipe |
| Site estimate references a recipe that's later edited | No effect — site estimate holds `recipe_id` + `rate_card_version_id`; snapshot is immutable |
| Two rows with same recipe name in the recipe workbook | Merged if item lists identical, otherwise second becomes v2 draft |
| Empty `Av unit £` in ABC sheet | Imported as `total_unit_cost = 0` and flagged `needs_pricing = true` — recipe items referencing it can't be approved until priced |
| Cost code missing on a rate item | Import allowed; recipe row requires cost code before recipe can be approved |

## 5. Migration order (when approved)

1. **M9** — contracts, rate_cards, rate_card_versions, rate_items (+ GRANTs, RLS, updated_at, unique constraints).
2. **M10** — estimate_recipes, recipe_items.
3. **M11** — site_estimates, site_estimate_lines, site_estimate_exceptions.
4. **M12** — wp_estimates, wp_estimate_lines, approved_baselines + `approve_site_estimate(site_estimate_id)` and `approve_wp_estimate(wp_estimate_id)` RPCs that write snapshots and, on WP approval, materialise `approved_baselines` and trigger site-task generation.

## 6. UI (Phase 3a, after schema)

- `/admin/rate-library` — clients → contracts → rate cards → versions → items, with staging-area import diff.
- `/admin/recipe-library` — recipes per contract with quantity-rule editor.
- **Site page** in `/delivery/wp/:id/site/:siteId` gains an **Estimate** tab: recipe picker, auto-populated quantities from the site's Gridwise design run, manual overrides, exceptions, approval action.
- **WP page** gains an **Estimate** tab: roll-up (sites, sockets, cost, price, GM%, per-site/per-socket, variance) + prelims/mobilisation/allowances/contingency editor + approval action.

## 7. Explicitly out of scope for this phase

- No invoicing, no procurement PO issuance, no supplier catalogue.
- No changes to Connect / Design / DNO rules engines.
- No auto-mutation of any existing `unit_rates` row.

## 8. Awaiting decision from you

Please confirm before I run **M9**:

1. Rate items imported from ABC sheets carry a **combined** `total_unit_cost` only (labour/material/plant split unavailable in that workbook) — accepted?
2. `quantity_rule` on every imported recipe row starts as the proposal in §2 and requires estimator confirmation before the recipe can be marked APPROVED — accepted?
3. Existing `unit_rates` becomes a fallback "system" rate card and is not modified — accepted?
4. Snapshotting model as described in §3 / §4 (approved rows immutable, edits force new version, awarded WP holds full JSON snapshot) — accepted?

On your yes I'll create M9 (rate library) as the first migration and stop there for approval before M10–M12.
