## Goal
Turn the **Programme detail** page's Work Packages list into the same Monday-style board used for WP Tasks — grouped grid, inline-edit cells, coloured status pills, custom columns, saved views and automations — scoped to the programme.

## What changes

### 1. Database (migration)
Extend the board config tables so they can also be scoped to a programme.

- `board_columns`, `board_views`, `board_automations`: add nullable `programme_id uuid references programmes(id) on delete cascade`.
- Replace the current unique constraints with per-scope ones (project / WP / programme).
- RLS: add policies allowing members of a programme (via its `org_id` on the parent programme → `org_members`) to read/write config rows scoped to that programme. Existing project/WP policies stay.

### 2. Board engine generalisation
Make `TaskBoard` scope-aware for a third target: `work_packages` rows inside a programme.

- `BoardScopeColumn` gains `"programme_id"`.
- New `BUILTIN_COLUMNS_WP` set for the work-package board: Code, Name, Status, Approved value (£), Start, Target end, Target sites, Progress (avg of task % via server field if present, else editable).
- `useBoardConfig` accepts a `builtinSet` and seeds the correct columns on first load.
- `TaskBoard` accepts `scope.table = "work_packages"` and a `fieldMap` describing which DB column each builtin key writes to (name, code, status, approved_value, start_date, target_end_date, target_site_count). `renderCell` uses the map instead of the hard-coded task fields.
- Row creation uses the programme's default lifecycle status and a generated code stub; delete works via `work_packages` table.
- Grouping by status uses a new `WP_LIFECYCLE` options list (reused from `DeliveryWorkPackage.tsx`).

### 3. Programme detail page
`src/pages/DeliveryProgrammeDetail.tsx`:

- Replace the current WP cards grid with `<TaskBoard scope={{ table: "work_packages", scopeCol: "programme_id", scopeId }} statusOptions={WP_LIFECYCLE} tasks={wps} milestones={[]} invalidateKeys={[["programme-wps", id]]} />`.
- Keep the existing "New work package" action; the board handles inline edits so the standalone inline-edit fields for each WP are removed to avoid duplication.
- Clicking the Name/Code cell still navigates to the WP detail page via a small link overlay on the first column.

### 4. Types
`src/lib/board/types.ts`: add `BUILTIN_COLUMNS_WP` and export a `BuiltinSet` union so callers pick one.

## Out of scope
- Projects list, Proposals, Revenue (per your answer).
- Changing WP Tasks board behaviour.
- New automation triggers for WP lifecycle (existing status/percent triggers still work).

## Technical notes
- Custom column values live in `work_packages.metadata_json.custom` (column already exists as `jsonb`; migration adds it if missing).
- Formula / aggregate / views / automations reuse existing components unchanged.
- `board_automations.runAutomations` already targets a table via `scope.table`; passes through for work_packages.