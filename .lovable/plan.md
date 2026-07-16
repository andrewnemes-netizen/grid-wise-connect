# Xero Integration Plan

Single shared Xero tenant for the whole app. Custom OAuth 2.0 (no Lovable native connector exists).

## 1. Prerequisites (you do this)

Create a Xero app at https://developer.xero.com/app/manage → Web app.
- **Redirect URI:** `https://xqmrnfimcuktyyltikoy.supabase.co/functions/v1/xero-oauth-callback`
- **Scopes:** `offline_access accounting.transactions accounting.contacts accounting.settings`
- Copy the **Client ID** and **Client Secret** — I'll ask for them as secrets.

## 2. Database (one migration)

- `xero_connection` (single-row table, admin-only): `tenant_id`, `tenant_name`, `access_token`, `refresh_token`, `expires_at`, `scopes`, `connected_by`, timestamps.
- `xero_contacts` cache: `xero_contact_id`, `name`, `email`, `contact_status`, `is_customer`, `is_supplier`, `last_synced_at`.
- Add to `revenue_invoices`: `xero_invoice_id`, `xero_status` (DRAFT/SUBMITTED/AUTHORISED/PAID/VOIDED), `xero_amount_paid`, `xero_amount_due`, `xero_synced_at`.
- Add to `purchase_orders`: `xero_purchase_order_id`, `xero_status`, `xero_synced_at`.

RLS: only admins can read/write `xero_connection`; org members can read `xero_contacts` and their sync columns.

## 3. Edge functions

- `xero-oauth-start` — builds authorize URL with state (admin JWT check).
- `xero-oauth-callback` — exchanges code, calls `/connections` to pick tenant, stores in `xero_connection`. Redirects back to `/admin?xero=connected`.
- `_shared/xero.ts` — helper: `getValidAccessToken()` (refreshes when `expires_at < now + 60s`), `xeroFetch(path, init)`.
- `xero-push-invoice` — `POST /api.xro/2.0/Invoices` (type ACCREC). Matches/creates contact by email. Saves `xero_invoice_id`.
- `xero-push-po` — `POST /api.xro/2.0/PurchaseOrders`.
- `xero-sync-contacts` — pulls `/Contacts` (paged), upserts `xero_contacts`.
- `xero-sync-payments` — pulls invoice status for rows with a `xero_invoice_id`, updates `xero_status` / `xero_amount_paid`.
- `xero-status` — returns `{ connected, tenant_name, expires_at }` for the UI.

## 4. Auto-triggers

- `send-invoice` and `send-purchase-order` will best-effort invoke the matching `xero-push-*` after Outlook succeeds — email flow never blocked by Xero.
- `pg_cron` job every 30 min → `xero-sync-payments`.

## 5. UI

- **Admin → Integrations → Xero panel** (`src/components/admin/XeroIntegration.tsx`): status card, "Connect Xero" button (opens `/xero-oauth-start` result in new window), tenant name + disconnect, "Sync contacts now", "Sync payments now".
- **Delivery → Revenue**: small Xero badge per invoice (`Not synced` / `Draft` / `Authorised` / `Paid £X of £Y`) + "Push to Xero" button when not synced, "Refresh from Xero" when synced.
- **WP → Purchase Orders**: same pattern on each PO row.
- **Send dialogs**: recipient email dropdown gains contact suggestions from `xero_contacts` (when populated).

## 6. Secrets requested

`XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`. Access + refresh tokens are stored in `xero_connection`, not as env secrets, so we can refresh them programmatically.

## Technical notes

- Xero access tokens expire after 30 min; refresh tokens rotate on every use and expire after 60 days of inactivity — the helper always writes the new refresh token back.
- All Xero calls include `Xero-Tenant-Id` from the stored connection.
- On any `401` from Xero, helper refreshes once and retries.
- All fetch errors from Xero surfaced with status + body per project convention.
- No client secret ever reaches the browser — OAuth flow lives entirely in edge functions.

## Build order

1. Ask for the two secrets.
2. Migration.
3. Shared helper + all edge functions.
4. Admin Xero panel + wire up push buttons on invoice/PO rows.
5. Auto-push hooks in `send-invoice` / `send-purchase-order`.
6. Cron job for payment sync.

Reply "go" and I'll start with step 1.
