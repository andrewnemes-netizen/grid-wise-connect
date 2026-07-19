# Archive & Delete Engine + Site Lifecycle Engine

Single coordinated build. No duplicate Site/WP/Programme tables. Reuse `audit_log`, `notifications`, `onedrive_uploads`, `mirrorToOneDrive`, existing soft-delete columns, and `remove_sites_from_wp` patterns.

---

## 1. Schema (one migration)

**New tables**
- `deleted_entities` — snapshot store
  - `entity_type` (site | work_package | programme | estimate | design | survey | permit | rams | tm | document | purchase_order | variation | milestone | task | photo | offer)
  - `entity_id` (original UUID, preserved)
  - `parent_type`, `parent_id` (for cascade grouping)
  - `snapshot` jsonb (full row + child rows serialised)
  - `status` (archived | restored | purged)
  - `archived_by`, `archived_at`, `restored_by`, `restored_at`, `purged_at`
  - `retention_expires_at` (default `archived_at + 90 days`)
  - `reason` text, `onedrive_archive_path` text
- `entity_move_log` — Site Lifecycle audit
  - `site_id`, `from_wp_id`, `to_wp_id`, `moved_by`, `moved_at`
  - `reason` text NOT NULL, `partner_change` jsonb, `records_moved` jsonb (counts per table)
- `capability_grants` — capability-based RBAC (no enum extension)
  - `user_id`, `capability` text, `granted_by`, `granted_at`
  - Capabilities: `site.move`, `site.bulk_move`, `entity.archive`, `entity.restore`, `entity.delete_forever`
- Seed defaults: all `admin` role users get every capability; `engineer` gets `site.move` only.

**Grants / RLS**: standard `authenticated` + `service_role`; policies gate by `public.has_capability(auth.uid(), '...')` security-definer helper.

**Locking flags** (reused where they already exist, added where missing as boolean columns, NOT new tables):
- `revenue_invoices.locked` (approved/issued)
- `commissioning_records.completed_at`
- `handover_packs.final_signoff_at`
- `contracts.closed_at`
- `app_settings.financial_period_lock_before` (date)

---

## 2. Archive & Delete Engine

**RPCs (SECURITY DEFINER, capability-gated)**
- `archive_entity(_type, _id, _reason)` — recursively snapshots entity + all children into `deleted_entities`, marks source rows `archived_at = now()` (soft delete), mirrors snapshot JSON to OneDrive under `/Archive/{entity_type}/{id}-{timestamp}.json`, writes `audit_log`, emits `notifications` to owners.
- `restore_entity(_deleted_id)` — reads snapshot, reinserts using original UUIDs, clears `archived_at`, writes audit + notification. Blocks if any parent still archived.
- `purge_entity(_deleted_id)` — hard delete rows + snapshot; capability `entity.delete_forever` only; irreversible; writes audit.
- Nightly cron edge function `archive-retention-sweep` flags expired archives (does not auto-purge — requires explicit purge).

**Dependency scan**: `scan_entity_dependencies(_type, _id)` returns counts of dependent rows per table so the UI can show a pre-archive summary.

**UI**
- `src/components/archive/ArchiveDialog.tsx` — dependency preview, reason field, confirm.
- `src/pages/admin/ArchiveConsole.tsx` — list archived entities, filter by type/date, Restore, Purge (capability-gated), retention countdown.
- Row action `Archive` added to Site/WP/Programme kebab menus (capability-gated).

---

## 3. Site Lifecycle Engine (Move / Bulk Move)

**RPC** `move_sites_between_wps(_site_ids uuid[], _to_wp_id uuid, _reason text, _adopt_destination_partner boolean)`

Behaviour per site:
1. **Lock check** — abort with structured error if any of:
   - open approved `revenue_invoices` for the site
   - completed `commissioning_records`
   - signed `handover_packs`
   - closed `contracts`
   - artefact dated before `financial_period_lock_before`
2. **Move everything belonging to the site** by updating `wp_id` on:
   - `wp_tasks`, `site_estimates`, `site_estimate_lines`, `site_estimate_exceptions`
   - `site_surveys`, `site_survey_responses`, `design_submissions`, `dno_offers` (via `dno_offer_sites`)
   - `permits`, `rams_documents`, `traffic_management_plans`
   - `site_photos`, `project_files`, `onedrive_uploads`
   - `po_line_sites` (site-specific PO lines), site-specific `wp_estimate_variation_lines`
   - `site_precon_gates`, `site_stage_status`, `wp_milestones` scoped to the site
   - `site_handover_docs`, `snagging_items`, `inspections`, `daily_logs`, `materials_deliveries`, `test_certificates`, `commissioning_records` (if not locked)
3. **`wp_sites` link** — update `wp_id`; keep `partner_id` unless `_adopt_destination_partner = true`.
4. **OneDrive** — Graph API move of site folder from source WP folder to destination WP folder (mirrored async via `onedrive-mirror` edge function; failure logged, not blocking).
5. **Audit** — one `entity_move_log` row per site; counts of records moved; `notifications` to source + destination WP owners; `audit_log` entry.

**Bulk Move** = same RPC with multiple ids; per-site errors reported, successful sites still commit (transaction per site).

**UI**
- `src/components/site/MoveSiteDialog.tsx` — destination WP picker, mandatory reason, partner conflict warning + "Adopt destination partner" checkbox, lock-check preview.
- Bulk toolbar button in `WpSiteRegisterTab.tsx` — `Move to Work Package` (capability-gated `site.bulk_move`).
- Site Detail action `Move Site` (capability `site.move`).

---

## 4. Capability matrix (seeded)

| Capability            | Default roles                                                    |
|-----------------------|------------------------------------------------------------------|
| `site.move`           | admin, engineer                                                  |
| `site.bulk_move`      | admin                                                            |
| `entity.archive`      | admin                                                            |
| `entity.restore`      | admin                                                            |
| `entity.delete_forever` | admin (system administrator only via extra `is_platform_admin`) |

Admin console screen to grant/revoke capabilities per user (no enum churn).

---

## 5. Notifications, OneDrive, Audit reuse

- All flows write to `audit_log` (existing).
- Owner notifications via existing `notifications` table + `NotificationsBell`.
- OneDrive mirroring via existing `mirrorToOneDrive` helper — new folder targets `/Archive/...` and `/WorkPackages/{wp}/Sites/{site}/`.
- No new email templates required initially; reuse existing transactional infra if user later asks.

---

## 6. Delivery order

1. Migration: `deleted_entities`, `entity_move_log`, `capability_grants`, helper functions, RLS, grants, seed.
2. Archive RPCs + `ArchiveDialog` + `ArchiveConsole`.
3. Site Move RPC + `MoveSiteDialog` + bulk toolbar entry.
4. Retention sweep edge function + admin purge action.
5. E2E test with screenshots (archive site, restore, move site between WPs, blocked move on locked invoice).

---

## Technical details

- All RPCs `SECURITY DEFINER`, `SET search_path = public`, capability-checked at top.
- Snapshots stored as `jsonb` with `{table, rows: [...]}` per child table; restore uses `jsonb_populate_recordset`.
- Move is per-site subtransaction (`SAVEPOINT`) so a locked site in a bulk request does not roll back others.
- OneDrive move via Graph `PATCH /me/drive/items/{id}` with new `parentReference.id` — resolved via `onedrive_folder_cache`.
- Rollback: any failure inside a per-site savepoint releases with no partial move; the site stays on source WP and error is surfaced in the dialog.
