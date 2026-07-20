## Feedback on the upload

I parsed `ICP SOR 2026.xlsm` with the new importer and verified column mapping against the real sheet.

**What worked**
- Sheet detection (`INTERNAL MASTER` in A1) picked the "Example" sheet correctly.
- Column map is right: B=code, C=description, D=Quantity (ignored), E=Unit, F=Unit Cost, G=Unit Price.
- 94 rate items parsed across 14 categories (Labour, LV Service Cable, Mains Joint Kits, DNO Works, Extra Overs, Feeder Pillars, etc.).
- Blank rows (e.g. row 22, 35 with a code but no description) are already skipped.
- Contract auto-create + version = max+1 logic behaved as designed.

**Why the import crashed** (this is what your toast showed)

```
duplicate key value violates unique constraint
"rate_items_rate_card_version_id_rate_code_key"
```

The source workbook reuses the same numeric code across (and even within) categories. Confirmed 23 duplicate codes in this file, including:

```text
1.01 × 6     3.01 × 6
1.02 × 5     3.02 × 4
2.03 × 4     3.03 × 3
2.04 × 2     3.06 × 3
```

Some are legitimate cross-category reuse (`3.01` under "Extra Overs" and again under "Feeder Pillars"); others are true typos in the sheet (`2.03` appearing 4 times inside "Lay Ducting" for genuinely different ducting items). Both patterns break the DB uniqueness rule on `(rate_card_version_id, rate_code)`.

## Fix plan

**1. Uniquify `rate_code` at parse time** — keep `source_ser` as the raw workbook value (audit-preserving), derive `rate_code` deterministically so it's unique inside one version:

- Track a running category index (1, 2, 3…) in parse order.
- Base code = `${categoryIndex}-${sourceSer}` (e.g. `3-2.03`).
- If that still collides within the same category (the four `2.03`s in Lay Ducting), append `#2`, `#3`, `#4` in encounter order.

This keeps codes human-readable, category-scoped, and stable across re-imports of the same file. `source_sheet` and `source_ser` remain the raw audit trail.

**2. Normalise float-code drift** — a few codes come through as `3.09000000000001` because Excel stores them as floats. Round to 2 decimals before stringifying so the audit code shows `3.09`, not the noisy float.

**3. Show a "duplicates uniquified" badge** in the preview so users see it happened (count only, non-blocking).

**4. Nothing else changes** — RateLibraryImport and RecipeLibraryImport are not touched. The Approve flow downstream is unaffected because it reads `rate_code` as an opaque string.

## Technical notes

- Only `src/components/admin/EstimatingImport.tsx` (the `parseIcpSorWorkbook` function and the preview badge row) needs to change.
- No migration required. The unique constraint stays as is — it's correct; the parser was wrong to hand it colliding codes.
- After the fix, re-uploading this exact workbook should insert all 94 rows into a fresh DRAFT version under contract `ICP SOR`.
