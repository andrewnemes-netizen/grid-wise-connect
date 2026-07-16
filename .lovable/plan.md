## Goal

Every outgoing PDF (invoice, payment application, purchase order, quotation) and every uploaded surveys/project file is automatically mirrored to a **single company Microsoft OneDrive** account, filed into a predictable **Project → Work Package → Category** folder tree. New documents only — no historical backfill.

## 1. Connector

- Link the existing workspace connection **"Microsoft OneDrive"** (`std_01kp0dz103ekdr7vs124a8q4ee`) to the project via `standard_connectors--connect` with `connector_id: microsoft_onedrive`. This injects `MICROSOFT_ONEDRIVE_API_KEY` alongside the existing `LOVABLE_API_KEY` — no user secret entry needed.
- All Graph calls go through `https://connector-gateway.lovable.dev/microsoft_onedrive/v1.0/...` with `Authorization: Bearer ${LOVABLE_API_KEY}` and `X-Connection-Api-Key: ${MICROSOFT_ONEDRIVE_API_KEY}`.

## 2. Folder layout

Root is configurable in `app_settings` (default `EcoPower UK`). Structure:

```text
/{root}/Projects/
  {ProjectName} [{project_id-short}]/
    _General/
    {WP-Code} {WP-Name}/
      Invoices/
      Payment Applications/
      Purchase Orders/
      Quotations/
      Surveys/
      Project Files/
```

Rules:
- Names sanitised (strip `/ \ : * ? " < > |`, collapse whitespace, cap 120 chars).
- Short id suffix keeps folders unique when project names collide.
- Documents not tied to a work package (project-level uploads) go under `{Project}/_General/{Category}/`.
- Folders are created on-demand using Graph `PATCH /me/drive/root:/{path}:` with `folder` + `conflictBehavior: replace` (idempotent), or `POST /children` per segment. Path IDs cached in a new `onedrive_folder_cache` table to avoid re-lookups.

## 3. New shared edge function: `onedrive-upload`

Server-only helper called by other edge functions. Not called from the browser.

Input:
```ts
{ project_id?: uuid, work_package_id?: uuid, category:
  'invoice'|'payment_application'|'purchase_order'|'quotation'|'survey'|'project_file',
  filename: string, source: { bucket: string, path: string } | { base64: string, mime: string } }
```

Steps:
1. Verify caller JWT (service-to-service invocations pass user JWT through).
2. Resolve project/WP names → build folder path → ensure folders exist (uses cache).
3. Download bytes from Supabase Storage (if `bucket/path`) or decode base64.
4. `PUT /me/drive/root:/{full/path/filename}:/content` (files ≤ 4 MB) or upload-session (larger). Include conflict behaviour `rename` so re-sends don't overwrite.
5. Return `{ onedrive_item_id, web_url, path }`.
6. Log to new `onedrive_uploads` audit table (see §5).

## 4. Wiring existing flows

Each place additively calls `onedrive-upload` **after** the primary action succeeds. Failure is logged but never blocks the user flow (toast: "OneDrive sync failed — will retry").

| Flow | File touched | Category | Notes |
|---|---|---|---|
| Send invoice / payment application | `supabase/functions/send-invoice/index.ts` | `invoice` / `payment_application` | Uses already-downloaded PDF bytes; call after Outlook send succeeds. Resolve project via `invoice.project_id`, WP via `invoice.work_package_id` if present. |
| Send purchase order | `supabase/functions/send-purchase-order/index.ts` | `purchase_order` | Resolve WP via `po.work_package_id`; project via WP. |
| Send quotation | `supabase/functions/send-quotation/index.ts` (existing behind `SendQuotationDialog`) | `quotation` | Same pattern. |
| Site surveys | wherever survey PDF is generated + saved (search `survey-pdf`/survey submit path) | `survey` | Fire on survey completion. |
| Project files upload | `src/components/delivery/ProjectFiles.tsx` → call new `project-file-mirror` edge fn after `storage.upload` + row insert | `project_file` | Client passes `project_files.id`; edge fn streams from `project-files` bucket into OneDrive. |

No changes to the primary storage buckets — OneDrive is a mirror, not a replacement, so signed-URL downloads keep working.

## 5. Schema (single small migration)

```sql
-- Folder path cache (keyed on category + project + wp)
create table public.onedrive_folder_cache (
  id uuid primary key default gen_random_uuid(),
  project_id uuid,
  work_package_id uuid,
  category text not null,
  folder_path text not null,
  onedrive_item_id text not null,
  created_at timestamptz not null default now(),
  unique (project_id, work_package_id, category)
);

-- Per-upload audit
create table public.onedrive_uploads (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,           -- 'invoice' | 'purchase_order' | ...
  entity_id uuid,
  project_id uuid,
  work_package_id uuid,
  onedrive_item_id text,
  web_url text,
  path text not null,
  status text not null,                -- 'ok' | 'error'
  error text,
  created_at timestamptz not null default now(),
  created_by uuid
);

-- App-settings row for root folder name (upsert 'onedrive.root_folder')
```

Grants + RLS: `authenticated` SELECT own-org rows (via project → org), `service_role` ALL. Only edge functions insert.

## 6. Admin UI

Add a small **OneDrive Integration** card alongside `XeroIntegration` in `src/pages/Admin.tsx`:
- Connection status (calls a `onedrive-status` edge fn → `GET /me/drive` for display name & quota).
- Editable "Root folder" input (default `EcoPower UK`).
- "Test upload" button (sends a placeholder text file).
- Recent uploads table (last 20 rows from `onedrive_uploads`).

No per-user OAuth UI — this is a single company connector, linked once by admin via the standard connect flow.

## 7. Out of scope (explicit)

- No historical backfill.
- No per-user OneDrive accounts.
- No two-way sync / file browsing inside the app.
- No changes to Xero, Outlook, or the existing storage buckets.

## Migration plan

1. Migration: create `onedrive_folder_cache`, `onedrive_uploads`, seed `app_settings` row.
2. Edge fns: `onedrive-upload` (shared), `onedrive-status`, `project-file-mirror`.
3. Wire `send-invoice`, `send-purchase-order`, `send-quotation`, survey submit path.
4. Wire `ProjectFiles.tsx` post-upload call.
5. Add `OneDriveIntegration.tsx` admin card.
6. Link the connector (`standard_connectors--connect` for `microsoft_onedrive`).

## Open confirmations before I build

- OK to use the existing workspace **"Microsoft OneDrive"** connection (not "Andrew's Microsoft OneDrive")?
- Root folder name **"EcoPower UK"** OK as default?
- For invoices/POs without a project link, file under `/{root}/Unassigned/{Category}/` — acceptable?
