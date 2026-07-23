## Goal
Add the uploaded `GenericRateCardImport-2.tsx` as a new, independent fourth card in **Admin → Estimating Import**, alongside the existing Rate Library, Recipe Library, and ICP SOR importers — without touching those three.

## Changes

1. **Create `src/components/admin/GenericRateCardImport.tsx`**
   - Copy the uploaded file verbatim (contents of `user-uploads://GenericRateCardImport-2.tsx`).
   - It already exports `GenericRateCardImport` and uses the same shadcn UI, XLSX, supabase client, react-query and `sonner` imports the existing importer uses, so no wiring changes required.
   - Writes into the same `contracts` / `rate_cards` / `rate_card_versions` / `rate_items` tables the existing Rate Library importer uses — no schema change, no duplication of business entities.

2. **Update `src/components/admin/EstimatingImport.tsx`** (small, surgical edit)
   - Add `import { GenericRateCardImport } from "./GenericRateCardImport";`
   - In the `EstimatingImport()` layout (lines 475–481), render `<GenericRateCardImport />` after `<IcpSorImport />` as the fourth card.
   - Do not modify `RateLibraryImport`, `RecipeLibraryImport`, or `IcpSorImport` — per the "don't touch the existing importers" rule established for the ICP SOR card.

## Not changing
- `Admin.tsx` (already renders `<EstimatingImport />`).
- Any database schema, RLS, or Edge Functions.
- The other three importer components or their parsers.

## Verification
- Build succeeds.
- Admin → Estimating Import shows four cards: Rate Library, Recipe Library, ICP SOR, and the new "Rate Card import (generic)".
- Uploading e.g. a CK MSA Rates workbook lets the user map columns and imports as a new DRAFT version under the chosen (or newly-created) contract.
