
# Estimate-Driven Project Plan Builder

Turn an estimate into a full, structured work plan for the Work Package: **WP → Site → Stage → Task**, where Stages come directly from the estimate's groups, and task durations are computed from productivity rates on each rate item.

## 1. Data model changes

### `rate_items` (existing)
- `productivity_qty_per_day numeric` — units of the item's UoM a standard crew delivers per day (e.g. 40 for m of trench)
- `default_crew_size int default 1`
- `default_stage text` — optional hint (e.g. 'Civils') for auto-mapping when group name is ambiguous

### `estimate_groups` (existing)
- `stage_code text` — slug used as the stage identifier when generating the plan (defaults to slugified group name)
- `stage_color text`
- `stage_order int`
- `default_predecessor_stage_code text` — for auto FS dependencies (e.g. Electrical follows Civils)

### `wp_tasks` (existing — extend)
- `site_id uuid` — link task to a site (nullable for WP-level tasks)
- `stage_code text` — which stage the task belongs to
- `parent_task_id uuid` — supports the Site and Stage summary rows
- `task_kind text check in ('site_summary','stage_summary','work')` default 'work'
- `estimate_line_id uuid references estimate_lines(id)` — provenance back to the BoQ
- `generated_from_estimate_id uuid` — which estimate build produced it
- `qty numeric`, `uom text`, `crew_size int`, `productivity_qty_per_day numeric` — snapshot for recompute
- Unique index on `(work_package_id, site_id, stage_code, estimate_line_id)` to make regeneration idempotent

### `wp_task_dependencies` (existing) — unchanged; used for stage-to-stage FS links.

All new columns nullable/defaulted so existing rows keep working.

## 2. Generation engine (Edge Function `generate-wp-plan`)

Input: `{ work_package_id, estimate_id, options: { site_ids?, overwrite: 'merge'|'replace' } }`

Algorithm:

```text
1. Load estimate + groups + lines (with joined rate_items for productivity).
2. Load wp_sites for the work package (or the subset in site_ids).
3. Derive stages from estimate_groups:
     stage_code = group.stage_code ?? slug(group.name)
     stage_order = group.sort_index
4. For each site:
     upsert site_summary task (parent = null)
     for each stage present in the estimate:
        upsert stage_summary task (parent = site_summary)
        for each estimate line in that group:
            duration_days = ceil( qty / (productivity_qty_per_day * crew_size) )
            upsert work task (parent = stage_summary, estimate_line_id = line.id)
            set start_date/due_date sequentially within the stage
5. Create FS dependencies between consecutive stages per site
   (using default_predecessor_stage_code where set, else stage_order-1).
6. Roll up parent bars (Gantt already renders these from children).
```

Idempotency: the unique index on `(wp, site, stage, estimate_line_id)` means re-running merges. `overwrite='replace'` clears only generated rows (`generated_from_estimate_id = :id`), preserving manual tasks.

## 3. UI

### On the Estimate editor
- New button in header: **"Generate plan from estimate"** (only enabled when at least one group + one site exist)
- Opens a confirmation modal:
  - Site multi-select (defaults: all sites on WP)
  - Preview list: `Site × Stage × #tasks × total days`
  - Mode: **Merge** (default) or **Replace generated**
  - Warns about missing productivity rates (lists items that will use fallback of 1 day)

### On the WP page
- Interactive Gantt gets a **grouping selector**: `By Site → Stage` (default) / `By Stage → Site` / `Flat`
- Site summary rows and Stage summary rows render as darker, wider bars auto-computed from children
- Task rows show a small chip with the source rate code (e.g. `CIV-TR-450`)
- Right-click a task → "Open estimate line"

### On each Site row (Sites tab)
- New pill: **"Plan: X tasks / Y days"** with a link that filters the Gantt to that site

## 4. Stage inference & colours

Because stages are derived from estimate groups, we normalize once:
- `slug(group.name)` → stage_code (Civils, Electrical, `bay-marking`, `icp-connection`, etc.)
- Colour = `estimate_groups.color` when set, else a hash-based palette
- Order = `sort_index`
- Dependencies default to sequential FS in that order; user can override per group via a new small "Stage settings" popover on the group header (sets `default_predecessor_stage_code`)

## 5. Recompute & drift

- Editing an estimate line's `qty`, `uom`, or the linked rate item's productivity **does not auto-push** — instead, the WP shows a **"Estimate changed — 4 tasks out of date"** banner with a **Rebuild** button that re-runs the generator in Merge mode.
- Manual edits to a generated task (dates, %) are preserved on merge; only `qty`, `duration`, `title` re-sync unless user unlinked the task.

## 6. Delivery scope

1. Migration: extend `rate_items`, `estimate_groups`, `wp_tasks`; add unique index.
2. Edge function `generate-wp-plan` with the algorithm above.
3. Admin: add productivity fields to `RateLibrary` editor.
4. Estimate editor: "Generate plan" button + modal with preview and warnings.
5. Interactive Gantt: hierarchical rendering (Site → Stage → Task), grouping selector, summary bars.
6. WP tabs: drift banner + Rebuild.
7. Tests: idempotency (re-run keeps same row count), manual-edit preservation, duration math.

## Out of scope for this iteration
- Resource levelling / crew calendars
- Cross-site dependency editing UI (still possible via existing dependency table)
- Cost baseline snapshots on plan generation (can follow once plan is stable)
