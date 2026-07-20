# PoC Estimate — separate entity alongside EV Build Estimate

## Guardrails
- The existing `estimates` / `estimate_groups` / `estimate_lines` engine (EV Build) is **not** modified. No new columns on it, no shared code paths, no shared totals.
- PoC Estimate is a brand-new, standalone entity with its own table, its own line items, its own rate card reference, and its own status.

## Data model (new tables only)

1. `public.poc_estimates`
   - `id`, `work_package_id` (FK), `site_id` (FK, nullable — WP-level PoC estimate also allowed), `dno_offer_id` (FK, nullable — the trigger source)
   - `ref` (auto), `name`, `rate_card_version_id` (FK to existing `rate_card_versions`, nullable)
   - `status` `poc_estimate_status` enum: `draft | sent | accepted | rejected` (no billing/milestones)
   - `currency` default `GBP`, `notes`, `total_cost` / `total_price` computed columns from lines
   - Standard `created_at/updated_at/created_by`
   - RLS: WP membership (same pattern as `estimates`), plus GRANTs to `authenticated` + `service_role`

2. `public.poc_estimate_lines`
   - `id`, `poc_estimate_id` (FK, cascade), `sort_index`
   - `rate_item_id` (FK, nullable), `description`, `unit`, `quantity`, `unit_cost`, `unit_price`, `line_cost`, `line_price` (generated)
   - RLS via parent membership; standard GRANTs

3. Trigger `poc_estimates_totals_refresh` on `poc_estimate_lines` insert/update/delete → recomputes parent totals.

No changes to `estimates`, `estimate_groups`, `estimate_lines`, `site_estimates`, `wp_estimate_*`.

## Auto-creation trigger

Extend the existing `trg_dno_offers_precon` chain (or add a sibling trigger on `public.dno_offers`) so that when a DNO offer row is inserted/updated to a "PoC offer received" state (e.g. `status = 'received'` with `offer_kind = 'poc'` or the current column your DNO Offers tab writes — verified against `dno_offers` schema at build time):
- Create one `poc_estimates` row per linked site (from `dno_offer_sites`), or a single WP-level row if no site linkage.
- Idempotent: skip if a `poc_estimates` row already exists for `(work_package_id, site_id, dno_offer_id)`.
- Notify the WP owner with a deep-link to the new PoC Estimate.

Existing EV Build estimate creation flow is untouched.

## UI

New route + tab so PoC and EV Build sit visibly side by side, never merged:

- New tab `WpPocEstimatesTab` at `/wp/:id/commercial/poc-estimates` (added to WP sidebar under Commercial, next to existing "Estimating").
- New component `src/components/delivery/poc-estimate/PocEstimatesTab.tsx` — list + create + open editor.
- New component `src/components/delivery/poc-estimate/PocEstimateEditor.tsx` — line editor reusing the existing `RateItemPicker` for rate card selection (read-only reuse; no changes to it).
- Existing `WpEstimatingTab` remains exactly as-is (EV Build only).

Work Package Overview (`WpOverviewTab`) gets a new "Commercial" summary block showing two clearly separated cards:

```text
┌──────────────────────────┐  ┌──────────────────────────┐
│  EV Build Estimates      │  │  PoC Estimates           │
│  3 estimates · £142,500  │  │  2 estimates · £8,750    │
│  [Open Estimating]       │  │  [Open PoC Estimates]    │
└──────────────────────────┘  └──────────────────────────┘
```

Each card links to its own tab. No combined total is ever shown. Labels on every screen explicitly say "EV Build" or "PoC" so neither implies the other.

Site Register / Site Detail: add a small "PoC Estimate" chip next to the existing "Estimate" chip for the site, each linking to its own record.

## Out of scope (explicit)
- No billing milestones, no % splits, no invoice generation on PoC estimates.
- No changes to EV Build estimate schema, code, PDFs, or rate logic.
- No auto-conversion between PoC and EV Build.

## Verification
After build, open the Work Package detail view and confirm:
1. Overview shows the two separate Commercial cards with independent counts/totals.
2. Sidebar has both "Estimating" (EV Build) and "PoC Estimates" tabs.
3. Creating a DNO PoC offer row auto-creates a PoC Estimate without touching any EV Build estimate.
4. A site with both types shows two distinct records, never a combined figure.
