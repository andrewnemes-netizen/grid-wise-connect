# Estimating & Commercial Flow

End-to-end pipeline from rate-card ingestion to invoiceable quotation. Each stage lists **where it lives**, **what it does**, and **the safeguards** that stop bad data flowing downstream.

---

## 1. Admin — Rate & Recipe ingestion

### 1a. Estimating Import → Rate Library
- **UI**: `Admin → Estimating Import` (tab `rate-library-import`) — `src/components/admin/EstimatingImport.tsx` (`RateLibraryImport`).
- **What**: Parses the `SoR MASTER` sheet of the CK Synthetic Rates workbook, creates a `rate_cards` row and a `rate_card_versions` row (v1, `DRAFT`), then batch-inserts `rate_items`. Rows with `#REF!` / null / zero prices are flagged `needs_pricing = true`.
- **Safeguards**:
  - Import blocked until a **Contract** and **Rate card name** are chosen.
  - **`needs_pricing` count** shown as an amber badge on the parsed preview.
  - **Inline "Approve now" button** appears in the success alert:
    - If any row has `needs_pricing = true` → button is **disabled**, badge shows the count, and the user is linked to `Admin → Rate Library` to price them.
    - If everything is priced → clicking calls the `approve_rate_card_version(_version_id)` RPC (same RPC as the Rate Library UI) and flips the version to `APPROVED`.

### 1b. Rate Library (pricing + approval)
- **UI**: `Admin → Rate Library` — `src/components/admin/RateLibrary.tsx`.
- **What**: Edit `rate_items.total_unit_cost` / `client_unit_price` on DRAFT versions, clear `needs_pricing`, then approve.
- **Safeguard**: `approve_rate_card_version` RPC enforces version state transitions server-side.

### 1c. Recipe Library import
- **UI**: `Admin → Estimating Import` (tab `recipe-library-import`) — `RecipeLibraryImport` in the same file.
- **What**: Groups rows in the workbook into `estimate_recipes` + `recipe_items` per contract.
- **KNOWN GAP (not fixed in this pass)**: `RecipeLibraryImport` inserts every `recipe_items` row with `rate_item_id: null` — the code comment says "link them later". Recipes seed cost/price by joining `recipe_items → rate_items` at estimate-creation time; until the link is populated, recipe-seeded lines carry zero unit cost/price. Track as an open item.

---

## 2. Site estimate creation

- **UI**: launched from `Portfolio` or `WP → Site Register` → **New site estimate** — `src/components/delivery/SiteEstimatesPanel.tsx` (`NewSiteEstimateDialog`).
- **What**: Creates a `site_estimates` row (DRAFT, auto-incremented `version_number`) and optionally seeds lines from:
  1. **Socket-build fixed price** — `unit_rates.hub_build_by_layout` looked up by `(build_type, socket_count)`; inserts a locked line with `source = "SOCKET_BUILD"`.
  2. **ICP study auto-seed** — latest `studies` row for the site with a non-null `cost_estimate_json`; inserts a summary line (`source = "ICP_STUDY"`) plus optional BoM detail lines (`source = "ICP_STUDY_DETAIL"`, `line_price = 0`, locked, allowance).
  3. **Recipe** — `recipe_items` joined to `rate_items` for cost/price defaults, if a recipe is selected and *Seed from recipe* is on.
- **Safeguards**:
  - Name required.
  - **Contract + rate card version required** when at least one APPROVED `rate_card_versions` row exists anywhere in the tenant. Button is disabled until both are set.
  - When there are **zero approved rate cards anywhere**, the dialog allows creation but shows a loud amber inline warning: *"No rate card selected — items will be unfiltered until one is chosen."* This stops the previous silent fallback where `RateItemPicker` would drop its filter and return 30 arbitrary rows from every rate card in the DB.

---

## 3. Site estimate editing & approval

- **UI**: `SiteEstimateEditor` (opens from the Site Estimates panel).
- **What**: Add lines via `RateItemPicker` (filtered by `rate_card_version_id`) or free-form. Totals recompute on save.
- **Approval**: `site_estimates.status` transitions DRAFT → APPROVED via the editor's approve action. Only APPROVED site estimates can be rolled into a WP estimate.
- **Safeguards**:
  - `RateItemPicker` filters by the estimate's `rate_card_version_id`.
  - Client-decision workflow: `client_decision = 'rejected'` sets a Commercial gate blocker on the site.

---

## 4. WP-level roll-up

- **UI**: `WP → Commercial → Estimating` — `src/components/delivery/WpEstimatePanel.tsx`, `src/pages/wp/tabs/WpEstimatingTab.tsx`.
- **What**: Aggregates APPROVED site estimates under one Work Package estimate. Contract + rate-card version selected at WP level (used for WP-only lines and rate-card-driven additions in `RateItemPicker`). Adjustments layer applied via `wp_estimate_adjustments` (contingency, prelims, overheads, discounts) and `wp_estimate_variations`.
- **Safeguards**:
  - Only APPROVED site estimates are eligible for inclusion.
  - Variations tracked in `wp_estimate_variations` / `wp_estimate_variation_lines` with their own approval state.

---

## 5. Send Quotation

- **UI**: `SendQuotationDialog` triggered from the WP estimate or the site estimate editor — `src/components/delivery/estimate/SendQuotationDialog.tsx`.
- **What**: Renders a client-facing PDF via `src/lib/quotation-pdf.ts`, logs the send in `quotation_sends`, and dispatches via the `send-quotation` Edge Function. `quotation_sends` accepts either `estimate_id` (WP) or `site_estimate_id` (site) — exclusive-OR enforced by a check constraint.
- **Safeguards**:
  - PDF preview must render before send.
  - `send-quotation` Edge Function branches on whichever ID is present and refuses if the referenced estimate has zero lines.

---

## 6. Purchase Orders & Variations

- **UI**:
  - Purchase Orders — `WP → Commercial → Purchase Orders` (`WpPurchaseOrdersTab.tsx`, `SendPurchaseOrderDialog.tsx`). PDFs from `src/lib/po-pdf.ts`; optional Xero push via `XeroPoButton.tsx`.
  - Variations — `WP → Commercial → Variations` (`WpVariationsTab.tsx`, `WpEstimateVariations.tsx`). Variations roll into the WP estimate once approved.
  - Invoices — `WP → Commercial → Revenue` and `SendInvoiceDialog.tsx`; Xero mirroring via `XeroInvoiceButton.tsx`.
- **Safeguards**:
  - POs require a supplier and at least one line.
  - Xero connection state validated before push.

---

## Safeguards summary (fast reference)

| Stage | Safeguard |
|---|---|
| Rate Library import | `needs_pricing` count surfaced; **Approve now** blocked until zero |
| Rate card approval | Server-side `approve_rate_card_version` RPC enforces state transitions |
| Site estimate create | Contract + rate card required when approved cards exist; loud warning when none exist |
| Site estimate lines | `RateItemPicker` filters by `rate_card_version_id` |
| WP roll-up | Only APPROVED site estimates included |
| Send Quotation | Requires ≥1 line; exclusive site vs WP estimate ID |

---

## Known gaps (not fixed here)

- **Recipe → rate item linking at import time**: `RecipeLibraryImport` in `src/components/admin/EstimatingImport.tsx` sets `rate_item_id: null` on every imported recipe item (per its own inline comment: "link them later"). Recipe-seeded site-estimate lines therefore start at zero cost until an operator manually links each recipe item to a `rate_items` row. Needs either a matching step during import (e.g. by `rate_code`) or a bulk-link UI in Recipe Library.