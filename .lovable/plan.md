## Plan: Wire Award Code into Generic Rate Card import

The uploaded `GenericRateCardImport-fixed.tsx` is a targeted patch on the existing importer at `src/components/admin/GenericRateCardImport.tsx`. It aligns the importer with the recently-shipped `rate_items.award_code` column ('C' / 'I' / 'E') and also tightens the `needs_pricing` logic.

### Changes to apply (all inside `GenericRateCardImport.tsx`)

1. **FieldKey type + labels** — add `award_code` as a new optional mapping field ("Award Code (C/I/E, optional)").
2. **`guessMapping`** — auto-detect columns named `Award Code`, `Scope`, or containing "award".
3. **Preview rows** — include the raw `award_code` value from the mapped column so the reviewer sees it.
4. **Insert payload** — normalise the mapped value: trim + uppercase, keep only `C`/`I`/`E`, otherwise store `null`. This matches the DB check constraint from the recent migration.
5. **`needs_pricing` fix** — change from sheet-level ("was the column mapped?") to per-row ("does this row have a positive cost and price?"). Rows missing either become `needs_pricing = true`, which the relaxed approval trigger now allows to be filled in later.
6. **Preview table** — add an "Award Code" column showing the normalised value or `—`.

### Out of scope
- No schema changes (award_code column and check constraint already exist).
- No changes to CK Synthetic or ICP SOR importers.
- No changes to `EstimatingLibrary.tsx` wiring — the component signature is unchanged.

### Verification
- Typecheck passes (only added field, unions widen).
- Import a sample workbook with an `Award Code` column: values `C`/`I`/`E` land on `rate_items.award_code`; malformed values become `null`; rows missing cost/price are flagged `needs_pricing = true`.
