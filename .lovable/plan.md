
# Monday-style Task Board — Delivery Project Detail

Turn the current `List` tab on `/delivery/:id` into a fully customisable, grouped, inline-edit board (Monday-inspired, on-brand). Kanban and Gantt tabs stay as-is.

## What the user gets

- **Groups** — collapsible group headers with row count and coloured left bar. Default group by Milestone; switch to Status / Priority / Owner / None from a header dropdown.
- **Coloured status pills** filling the cell (todo grey, in_progress blue, review amber, blocked red, done green). Click to open a colour-swatch popover — same for priority.
- **Inline edit everywhere** — title, dates, %, owner, any custom field. Enter/Esc/blur to commit. Optimistic updates.
- **Custom columns per board** — user adds columns of type: `text`, `number`, `date`, `status` (labelled colour options), `person`, `currency`, `checkbox`, `dropdown`, `formula`. Stored in `metadata_json` per row; column definitions on the project.
- **Show / hide / reorder / resize columns**, sticky title column, saved as named **Views** (per user).
- **Filter + sort + search bar** above the board. Multi-column sort.
- **Automations (simple)** — "When status changes to X, set date column Y to today" and "When % = 100, set status = done". Rule list editable in a side panel.
- **Formula column** — reference other columns, e.g. `{estimated_hours} * 85`.
- **Footer aggregations** per group and grand total (sum / avg / count) on numeric + currency columns.
- **Row expand** for description, subtasks (uses existing `parent_task_id`), comments, files.
- **Bulk actions** — select rows, change status/owner/date, delete.

## Visual language (on-brand)

- Use existing tokens (`--primary`, `--muted`, `--border`). Introduce semantic status tokens in `index.css`:
  `--status-todo`, `--status-progress`, `--status-review`, `--status-blocked`, `--status-done`, plus `-fg` variants. Add matching Tailwind colours.
- Row height 36px, group header 32px with 4px coloured left accent, hover row `bg-muted/40`. Zebra off. Column resizer on hover.
- Pills are full-cell coloured blocks (Monday signature) but use our token palette, not Monday's exact hues.

## Data model

New tables (migration):

- `board_columns` — `project_id`, `key`, `label`, `type`, `options_json` (status labels + colours, dropdown options, formula expr), `width`, `sort_index`, `is_system` (built-ins flagged so they can't be deleted).
- `board_views` — `project_id`, `user_id`, `name`, `is_default`, `config_json` (visible cols, order, group_by, sort, filter).
- `board_automations` — `project_id`, `name`, `trigger_json`, `action_json`, `enabled`.
- `project_task_custom` values live in existing `project_tasks.metadata_json` under `{ custom: { <col_key>: value } }` — no new row-per-value table needed.

Seed built-in columns per project on first open (title, status, owner, priority, due_date, percent_complete, estimated_hours) with `is_system=true`.

RLS: mirror `project_tasks` policies (org member or project member). GRANT to authenticated + service_role.

## Files

New:
- `src/components/delivery/board/TaskBoard.tsx` — top-level, replaces current List body.
- `src/components/delivery/board/BoardToolbar.tsx` — search, group-by, filter, sort, view picker, add-column, automations.
- `src/components/delivery/board/BoardGroup.tsx` — collapsible group + footer aggregations.
- `src/components/delivery/board/BoardRow.tsx` — inline-edit row, checkbox select, expand.
- `src/components/delivery/board/cells/` — `StatusCell`, `PersonCell`, `DateCell`, `NumberCell`, `CurrencyCell`, `TextCell`, `CheckboxCell`, `DropdownCell`, `FormulaCell`.
- `src/components/delivery/board/AddColumnPopover.tsx`, `ColumnHeader.tsx` (resize + menu), `ViewsMenu.tsx`, `AutomationsPanel.tsx`.
- `src/lib/board/formula.ts` — safe expression evaluator (no `eval`, whitelist ops).
- `src/lib/board/automations.ts` — client-side runner triggered after task mutations.
- `src/hooks/useBoardConfig.ts` — loads columns/views/automations.

Edited:
- `src/pages/DeliveryProjectDetail.tsx` — List tab renders `<TaskBoard />`; keep Kanban/Gantt/others.
- `src/index.css` + `tailwind.config.ts` — status tokens.

## Technical details

- Groups computed in-memory; virtualise rows with `@tanstack/react-virtual` once >100 rows.
- Column drag-reorder + resize via `@dnd-kit` (already available through shadcn); persist to `board_columns.sort_index` / `.width` (debounced).
- Views config is per-user JSON; default view is per-project.
- Automations run in the client after successful mutation (best-effort). Doc note: server-side triggers can come later.
- Formula parser: tokenise, resolve `{col_key}` against the row, support `+ - * / ( ) min max round`. Reject anything else.
- Optimistic updates via React Query `setQueryData`; roll back on error.

## Out of scope (this pass)

- Server-side automations / webhooks.
- Cross-board relations ("connect boards").
- Time-tracking column, file column, mirror column.
- Board templates gallery (existing `ApplyTemplateDialog` remains for milestone/task seeding).

## Build order

1. Migration (`board_columns`, `board_views`, `board_automations`) + seed built-ins on first load.
2. `TaskBoard` shell + `BoardRow` with inline status/text/date/number cells reading built-ins.
3. Grouping + group-by switcher + footer sums.
4. Add-column popover, custom cells, `metadata_json` reads/writes.
5. Views (save/rename/switch/default).
6. Filter/sort/search + bulk actions.
7. Formula + automations.
8. Status colour tokens + polish pass.
