

## Gaps Found

### 1. Cost Engine: LA Programme uses separate inline logic
The `score-sites-batch` edge function (lines 370-430) has a hardcoded cost calculator that does NOT reflect the recent changes made to `src/lib/connectionCosts.ts`:
- Still includes WC meter cost (should be removed for LV)
- Does not conditionally exclude pot ends
- Does not include excavation joint bays per joint
- LV joint team has no 1-day minimum floor
- No feeder pillar toggle support

### 2. PDF Export with Map Screenshot: Not implemented
The LA Programme dashboard only exports CSV. There is no PDF report generation or map screenshot capture for programme sites or portfolio entries.

---

## Plan

### Step 1 — Align batch cost engine with shared logic
**File:** `supabase/functions/score-sites-batch/index.ts`

Update the inline `computeCost` function to match the rules now in `connectionCosts.ts`:
- Remove WC meter from LV estimates
- Only include pot ends when mains extension is triggered
- Add excavation joint bay cost (quantity = joint count)
- Set LV joint team minimum to 1 day (not 0.5)
- Default feeder pillar to included (no toggle needed in batch — batch always includes it)

### Step 2 — Add PDF export to Programme Dashboard
**Files:** `src/components/la/ProgrammeDashboard.tsx`, new helper or extend `generateAssessmentPdf.ts`

Add an "Export PDF" button that generates a programme summary report containing:
- Summary stats (total sites, phases, total kW, total estimate)
- Phase breakdown table
- Per-site table with key metrics
- No map screenshot per site (batch context — too many sites)

### Step 3 — Add map screenshot to Portfolio site PDF
**File:** `src/components/portfolio/PortfolioAnalytics.tsx` (or wherever individual portfolio site export lives)

When a user exports a single portfolio site, use the existing `generateAssessmentPdf` flow which already captures map screenshots. Verify the `includeFeederPillar` flag propagates from the portfolio context.

---

### Technical detail

**Batch cost function changes** (edge function):
```
// Remove: equipment += r.whole_current_meter_each (for LV)
// Add: equipment += jointCount * r.excavation_joint_bay_each
// Change: labourDays floor from 0.5 to 1.0 for LV joint team
// Conditional: pot ends only when needsMainsExtension
```

### Files changed
| File | Change |
|------|--------|
| `supabase/functions/score-sites-batch/index.ts` | Align cost calc with shared rules |
| `src/components/la/ProgrammeDashboard.tsx` | Add PDF export button + generation |

