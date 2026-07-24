## Wire in QuoteBuilder, retire the old EstimateEditor

Only one place actually imports `EstimateEditor` from `src/components/delivery/estimate/EstimateEditor.tsx` — the `EstimatesTab` used by both EV Build and PoC/ICP flows. The other two similarly-named editors (`SiteEstimateEditor` in `SiteEstimatesPanel.tsx` and `EstimateEditorDialog` in `WpEstimatePanel.tsx`) operate on different tables (`site_estimates` and `work_package_estimates` — the site- and WP-level rollups), not the line-item `estimates` / `estimate_lines` model that `QuoteBuilder` targets. They are not interchangeable, so this plan leaves them alone.

### Changes

1. **Add** `src/components/delivery/estimate/QuoteBuilder.tsx` — the uploaded file, verbatim.
2. **Update** `src/components/delivery/estimate/EstimatesTab.tsx`
   - Swap `import { EstimateEditor }` for `import { QuoteBuilder }`.
   - Replace the `<EstimateEditor …>` block inside the dialog with `<QuoteBuilder estimateId={openId} onClose={…} />`.
   - Drop the `maximized` / `onToggleMaximize` / `onOpenEstimate` wiring — `QuoteBuilder` is a single-quote view and doesn't expose those props. The dialog can keep its existing large size or be simplified to a single fixed size; keep the current large size for continuity.
3. **Delete** the retired files (both are only imported by `EstimatesTab`):
   - `src/components/delivery/estimate/EstimateEditor.tsx`
   - `src/components/delivery/estimate/EstimateLineDialog.tsx`
4. **Leave untouched**: `SiteEstimatesPanel.tsx`, `WpEstimatePanel.tsx`, and everything else in `src/components/delivery/`. Those own different data models (site rollup, WP rollup) — replacing them is a separate scope.

### Verification

- `rg "EstimateEditor|EstimateLineDialog"` should return nothing under `src/` after the change (other than the untouched local `SiteEstimateEditor` / `EstimateEditorDialog` names).
- Typecheck and lint pass.
- Manual: open a Build estimate and a PoC estimate from a WP → confirm the new rate-card picker appears when no rate card is set, and quantity entry saves lines against `estimate_lines`.

### Notes / risks

- `QuoteBuilder` writes `rate_card_version_id` onto the `estimates` row (`chooseRateCard`) and inserts into `estimate_lines`. Both columns already exist per the current editor code path, so no schema change is expected.
- `QuoteBuilder` relies on the recently added `award_code` column on `rate_items` and the relaxed pricing-completion trigger — both already shipped in the last migrations.
- If any dashboard/report was reading fields only produced by the old `EstimateEditor` (e.g. detailed markup breakdowns per line), those still exist on `estimate_lines` — `QuoteBuilder` populates `unit_cost`, `markup_dollar`, `markup_type`, `vat_rate`, etc. on insert.
