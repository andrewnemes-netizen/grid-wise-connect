# Work Package Import Wizard

Foundation of the Gridwise Portfolio Import Engine. Not a generic CSV importer — a batch-safe, versioned, auditable pipeline that lands sites into Programme + Work Package + Portfolio + GIS + Site Register in one governed action.

## User journey

1. Entry points
   - Delivery → Work Package → “Import Sites”
   - Portfolio → “Import Portfolio”
   - Assistant chat → paperclip → “Import sites…” (opens the same wizard in a drawer)
2. Step 1 — Upload
   - Drag/drop or browse: `.csv`, `.xlsx`, `.xls`, `.pdf`, `.docx`. Or “Paste table”.
   - Files stored in a private `imports` bucket keyed by `import_batch.id`.
   - For PDF/DOCX we run AI extraction (Gemini) into a tabular preview the user still reviews.
3. Step 2 — Column mapping
   - Auto-detects and suggests mappings for: Address, UPRN, Site Name, Latitude, Longitude, Postcode, Client Reference, Charger Type, Power Demand (kW), Estimated Sockets, DNO, LPA, Notes, Client, Programme, Work Package.
   - User can rename, ignore, or remap any column. Mapping saved on the batch for re-use.
4. Step 3 — Validate
   - Per-row status: OK / Warning / Error / Duplicate.
   - Checks: required fields, kW numeric range, valid UK postcode, UPRN format, duplicate detection (existing site UPRN or address+postcode, and within-batch dupes), coord sanity (UK envelope + auto lat/lng swap fix).
   - Inline edit for any cell; re-validates on change.
5. Step 4 — Geocode
   - “Geocode missing coordinates” action. Uses OS Places via existing edge proxy (batched). Rate-limited, resumable. Rows update in place with `geocode_confidence`.
6. Step 5 — Map preview
   - MapLibre map with a pin per site, colour-coded by status. Click a pin → row detail. Bounding-box fit; large batches clustered.
7. Step 6 — Destination
   - Choose Client (existing Account, or “new”), Programme (existing or new), Work Package (existing or new). Autosuggest from existing records the user can access.
   - If new: inline forms for Programme (name, code, dates) and WP (name, code, type).
8. Step 7 — Summary
   - Total sites, valid, warnings, errors, duplicates, total requested kW, estimated sockets, client, programme, WP, contract value if provided. Prominent “N errors — review” link back to Validate step.
9. Step 8 — Approve Import
   - Button disabled until 0 blocking errors. Confirmation dialog with counts.
   - Server writes everything in one transactional edge function (see below). Progress toast for large batches.
10. Step 9 — Post-import
    - Success screen with three actions:
      - Run Gridwise Connect on all sites
      - Run only selected sites (opens map with multi-select)
      - Save for later
    - Deep links so the sites appear immediately in Portfolio, Work Package, GIS Map, Site Register.

## Data model additions

Seven new tables (all `public`, RLS by `org_id` via existing `has_role`/`org_members` pattern):

- `import_batches` — id, org_id, created_by, source (`csv|xlsx|pdf|docx|paste`), file_path, filename, status (`draft|validating|geocoding|ready|approved|failed|rolled_back`), mapping_json, summary_json, target_programme_id, target_wp_id, target_client_id, version, parent_batch_id, created_at, approved_at.
- `import_rows` — id, batch_id, row_index, raw_json, mapped_json, status (`ok|warning|error|duplicate|skipped`), errors_json, warnings_json, dedupe_key, geocode_confidence, resolved_site_id (nullable, filled after approval).
- `import_column_mappings` — org_id, name, mapping_json (saved templates the user can reapply).
- `import_audit` — id, batch_id, actor_id, action (`create|edit_row|remap|geocode|validate|approve|rollback`), diff_json, at.
- `import_created_records` — batch_id, entity_type (`programme|work_package|site|portfolio_entry|geo_point|wp_site`), entity_id (uuid), created (bool), reversible (bool). Enables true rollback.
- Extend `sites` with `import_batch_id` (nullable FK) and `import_row_id` for traceability.
- Extend `programmes` and `work_packages` with `import_batch_id` (nullable) so import-created parents can be rolled back.

RLS: all scoped to caller’s `org_id`; `service_role` full access for the edge function.

## Backend

Two edge functions:

- `import-wizard` (thin per-step API)
  - `POST /parse` — parses uploaded file (CSV via `papaparse`, XLSX via `xlsx`, PDF/DOCX via existing document parser + Gemini extraction), inserts `import_batches` + `import_rows` rows, returns preview.
  - `POST /remap` — updates `mapping_json`, re-derives `mapped_json` per row.
  - `POST /validate` — runs deterministic checks + duplicate lookup against `sites`.
  - `POST /geocode` — calls existing OS Places proxy in batches of 50 with backoff, updates rows.
  - `POST /approve` — the transactional writer (below).
  - `POST /rollback` — deletes/undoes all `import_created_records` in reverse order, marks batch `rolled_back`.

- `import-approve-worker` (invoked by `/approve` for batches > 200 rows via Inngest)
  - Emits `gridwise/import.approve.requested` event; Inngest function chunks the batch (250 rows/step), writes with `service_role`, streams live progress to a `import_progress` channel the UI subscribes to via Supabase realtime.

### Write order inside approval
For each batch, in one logical transaction per chunk:
1. Upsert Client → Programme → Work Package (skip if existing IDs supplied).
2. For each row: insert `sites` row, insert `wp_sites` link, insert `geo_points` (from coords), insert portfolio row (`site_utilisation` seed or the portfolio table you use — I’ll follow the existing pattern found during exploration).
3. Record every insert in `import_created_records`.
4. Update `import_rows.resolved_site_id` and `import_rows.status = ok`.
5. Update `import_batches.status = approved`, write `summary_json`.

Feasibility engine is **not** triggered here — that is a separate user action from the post-import screen.

## Frontend

- Route: `/import/wizard/:batchId?` (new). Stepper shell with the 9 steps above.
- Reusable `<ImportEntry />` button placed on Work Package detail, Portfolio page, Delivery landing, and as a chat composer attachment handler.
- Components: `UploadDropzone`, `MappingTable`, `ValidationGrid` (virtualised, up to 10k rows via `@tanstack/react-virtual`), `GeocodePanel`, `ImportMap` (MapLibre reused), `DestinationPicker`, `ImportSummaryCard`, `ImportSuccessPanel`.
- Assistant integration: paperclip button on the chat composer starts a batch, then hands off to `/import/wizard/:batchId` in the same tab. The assistant remains read-only; it does not perform the write.

## Scale + safety

- Up to 10,000 rows per batch. Server always writes in 250-row chunks.
- Files are private-bucket; presigned URLs only.
- Geocoding, parsing, and writing are resumable — every step is idempotent and safe to re-run.
- Rollback restores state by deleting `import_created_records` in reverse dependency order.
- Every action is logged in `import_audit`; each batch has a monotonically increasing `version` (parent_batch_id used when re-importing a corrected file).

## Phased delivery (single PR-worth per phase)

- Phase A (this ticket): DB migrations, `imports` bucket + RLS, `import-wizard` edge function with parse/remap/validate/geocode/approve/rollback for CSV + XLSX + paste, wizard UI end-to-end, entry points on Delivery WP + Portfolio + Assistant, post-import success actions (Run All / Run Selected / Save for later — the two “Run” actions just deep-link to the existing feasibility runner selected-set).
- Phase B: PDF/DOCX AI extraction, saved mapping templates, Inngest background worker + realtime progress for > 200-row batches.
- Phase C: Rollback UI + batch version history, admin dashboard of imports, CSV export of failures.

## Out of scope for this ticket

- Automatic feasibility runs on import.
- Editing imported sites in bulk after approval (existing site editor covers single-site edits).
- Multi-tenant sharing of mapping templates across orgs.

Ready to build Phase A on approval.
