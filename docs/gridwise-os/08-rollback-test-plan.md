# 08 — Rollback Test Plan

## Principle
Every migration file has a paired `*_rollback.sql`. Rollbacks are:
- **Non-destructive** to pre-Phase-1 data.
- **Rehearsed on UAT** before prod run.
- **Executed in reverse DAG order** (see doc 06).

## Standard procedure (per phase)
1. Snapshot UAT DB (`pg_dump` via Cloud → Export data — reference only, not part of app code).
2. Apply forward migration.
3. Seed 10 representative rows.
4. Run rollback SQL.
5. Assert:
   - All tables added by the phase are dropped.
   - All columns added by the phase are dropped.
   - No pre-existing row was modified or deleted.
   - RLS lint clean (nothing orphaned).
6. Re-apply forward migration.
7. Assert same 10 rows can be recreated identically.

## Phase-specific notes

### Phase 1
- `sites.current_stage_id` drop is safe — old `sites.status` retained throughout.
- Enums are NOT introduced in v3, so no `DROP TYPE` cascades.
- Views/mv drop first, then tables in reverse dependency order.

### Phase 4
- Award trigger dropped before `estimates.parent_estimate_id` column drop.
- Baseline snapshot rows in `wp_estimate_variations` remain (append-only).

### Phase 5
- Design-approval trigger dropped BEFORE `work_packages.delivery_project_id` and `wp_procurement_unlocked` are dropped.
- Any `delivery_project_id` values already set stay in place if we roll back to a state that reads them.

### Phase 7
- Assignment rows deleted before resource rows.
- No cascades onto `wp_tasks` / `project_tasks`.

### Phase 8
- `actual_costs` cascade-safe; view drop first.

### Phase 9 / 10
- File rows in `project_files` linked by polymorphic `entity_type` are NOT deleted on rollback (files retained). Only the reference tables drop.

### Phase 13 (legacy retirement)
- Rollback restores route redirects but cannot bring back deleted UI components. Ship a git tag `pre-legacy-retire` before this phase.

## Feature-flag rollback
Instant kill switch:
```sql
UPDATE app_settings SET value = 'false' WHERE key = 'gridwise_os_shell';
```
No redeploy needed.

## Sign-off
Each rollback rehearsal recorded with:
- date, operator, snapshot id, forward-migration id, rollback-file id, result (pass/fail).
Stored in `docs/gridwise-os/rollback-log/<phase>.md`.

---
**Sign-off:** Engineering ☐  DevOps ☐  Security ☐