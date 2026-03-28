

## Unify Cost Engine Across All System Entry Points

### Problem

The system has **two separate cost engines** producing different results:

1. **`estimateConnectionCost`** in `src/lib/connectionCosts.ts` — the canonical engine used by the map connection assessment, portfolio, site detail, quick estimate, and PDF export. Most of these correctly pass dynamic `unitRates` from the admin console via `useUnitRates()`.

2. **`estimateTotalCost`** in `supabase/functions/score-sites-batch/index.ts` (lines 123-143) — a hardcoded simplified clone used by the LA Programme batch scorer. It uses **fixed inline rates** (£85/m cable, £147/m blended excavation, flat 1.24× multiplier, always adds transformer cost even for LV).

Additionally, **`useActiveStudy.ts`** calls `estimateConnectionCost` without passing unit rates (line 108), so it falls back to `DEFAULT_UNIT_RATES` instead of the admin-configured rates.

### Misalignments Found

| Location | Uses Admin Rates? | Issue |
|----------|:-:|-------|
| `score-sites-batch` edge function | No | Entirely separate hardcoded engine; adds transformer for LV; flat 1.24× instead of % fees |
| `useActiveStudy.ts` (study save) | No | Calls `estimateConnectionCost()` without `unitRates` param |
| `gridwise/commercialEngine.ts` | Optional | Falls back to `DEFAULT_UNIT_RATES` if caller doesn't pass rates |
| Portfolio page | Yes | Already correct |
| CostEstimatePanel | Yes | Already correct |
| SiteDetail page | Yes | Already correct |
| QuickEstimate page | Yes | Already correct |
| PDF export | Partial | Uses passed rates but some call sites don't pass them |

### Fix Plan

**1. `supabase/functions/score-sites-batch/index.ts`** — Replace `estimateTotalCost` with logic that mirrors `estimateConnectionCost`:
- Fetch `unit_rates` row from the database at the start of the function (one query, reused for all sites)
- Apply the same voltage thresholds (LV ≤80kW, HV ≤1500kW, EHV above)
- Only add transformer cost for HV/EHV (not LV)
- Use separate footway/carriageway/verge excavation with surface split
- Apply design_fee_pct + project_management_pct + contingency_pct instead of flat 1.24×
- Include LV-specific items (service cable, feeder pillar, cutout, pot end) matching the main engine
- Include mains extension logic when distance > threshold

**2. `src/hooks/useActiveStudy.ts`** — Pass unit rates to `estimateConnectionCost`:
- Import and call `useUnitRates()` hook
- Pass the rates to both `estimateConnectionCost()` and `generateBom()` calls

**3. `src/lib/generateAssessmentPdf.ts`** — Audit call sites to ensure rates are passed through (the function accepts `unitRates` param but callers may not pass it)

### Files to Change

| File | Change |
|------|--------|
| `supabase/functions/score-sites-batch/index.ts` | Rewrite `estimateTotalCost` to mirror `connectionCosts.ts` logic; fetch `unit_rates` from DB |
| `src/hooks/useActiveStudy.ts` | Import `useUnitRates`, pass rates to `estimateConnectionCost` and `generateBom` |
| `src/lib/generateAssessmentPdf.ts` | Verify rates are passed at all call sites |

