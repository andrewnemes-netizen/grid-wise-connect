## Goal
Consolidate the three Admin tabs (*Estimating Import*, *Rate Library*, *Recipe Library*) into a single **Estimating** tab powered by the uploaded `EstimatingLibrary.tsx`, and add a dedicated rate-card version detail page at `/admin/rate-cards/:versionId`.

## Changes

### 1. New library component
- Add `src/components/admin/EstimatingLibrary.tsx` verbatim from `user-uploads://EstimatingLibrary.tsx` (imports `GenericRateCardImport`, which already exists).

### 2. Admin page — collapse three tabs into one
`src/pages/Admin.tsx`:
- Remove tab triggers **Estimating Import**, **Rate Library**, **Recipe Library**.
- Add one new tab trigger **Estimating** (value `estimating`, `Library` icon).
- Remove the three matching `<TabsContent>` blocks and add one that renders `<EstimatingLibrary />`.
- Remove now-unused imports (`EstimatingImport`, `RateLibrary`, `RecipeLibrary`, `Receipt`, `BookOpen`).
- Preserve every other tab (Layers, Rates, EV Hub, DNO, Gas, API, LA, SSEN Drive, Users, Orgs, Partners, Audit, Learning, Flags, Xero) exactly as-is.

### 3. Rate card detail route
- Add `src/pages/admin/RateCardDetail.tsx`:
  - Reads `:versionId` from the URL.
  - Fetches the single `rate_card_versions` row (with parent `rate_cards` + `contracts`) and its `rate_card_lines`.
  - Reuses the existing edit/approve/clone/delete affordances currently in `RateLibrary.tsx` by extracting the per-version panel into a shared subcomponent `RateCardVersionPanel` (moved from `RateLibrary.tsx` into `src/components/admin/RateCardVersionPanel.tsx`) — so behaviour stays identical and there's no duplication.
  - Renders inside the standard admin shell with a back link to `/admin?tab=estimating`.
- Register the route in `src/App.tsx` under the existing admin-guarded section: `/admin/rate-cards/:versionId` → `RateCardDetail`.

### 4. Legacy files
- Delete `src/components/admin/EstimatingImport.tsx`, `src/components/admin/RateLibrary.tsx` (after extracting the shared panel), and `src/components/admin/RecipeLibrary.tsx`. Remove any remaining imports.
- Search once for stray references (`rg -n "RecipeLibrary|EstimatingImport\\b|RateLibrary\\b"`) and clean up.

### 5. Verification
- Typecheck.
- Manually confirm: `/admin` → *Estimating* tab shows the rate-card table + "Add rate card" import panel; clicking a row navigates to `/admin/rate-cards/:versionId` and lets you view/edit lines and approve/clone; Recipe Library is gone.

## Out of scope
- No schema changes.
- No changes to the individual importers (ICP SOR, MSA, Synthetic, Generic Rate Card).
- No changes to any non-Admin surface that consumes rate cards.
