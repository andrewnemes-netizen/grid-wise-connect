

## Fix: kW Estimation From Charger Columns

### Two Bugs

**Bug 1 — Fallback default of 7kW is wrong**
Lines 207-210: if `estimateKwFromChargers` returns 0 (because all counts are zero, or no `proposed_kw` column), the code defaults to 7kW. This is incorrect — 0 chargers means 0kW. Remove the default.

**Bug 2 — Fuzzy matching may miss actual WYCA headers**
The current matching logic uses nested string-contains checks that are brittle. The actual WYCA headers look like:
- "Number of Lower Range Standard Chargers (3.7kW - < 6kW)"
- "Number of Rapid Sockets (50kW - 149kW)"

The normalization replaces spaces with `_` but the matching checks for substrings like `"lower"` + `"3.7"` + `"charger"/"socket"`. This should work, but the issue might be that `charger` and `socket` columns for the same band are matching the wrong entry due to iteration order. Need to make matching more robust.

### Changes

**`src/components/la/CsvIntakePanel.tsx`**

1. **Remove the 7kW default** (lines 207-210) — if kW is 0, store 0. A site with all-zero charger counts has 0kW capacity.

2. **Simplify `estimateKwFromChargers`** — replace the fragile nested-loop fuzzy matching with a cleaner approach: normalize all column names, then match each against a pattern table using simple keyword sets:

```text
Pattern: ["lower", "3.7"] → 3.7kW per unit
Pattern: ["higher", "6kw"] or ["higher", "6_kw"] → 7kW per unit  
Pattern: ["fast", "8kw"] or ["fast", "49kw"] → 22kW per unit
Pattern: ["rapid", "50kw"] or ["rapid", "149kw"] → 50kW per unit
```

Iterate all columns once, check which band they match, sum `count × rate`. No double-counting (track matched columns).

3. **Show 0kW in the preview table** when a site genuinely has zero chargers — this gives the user visibility that something may be wrong with that row.

### Files to Change
| File | Change |
|------|--------|
| `src/components/la/CsvIntakePanel.tsx` | Remove 7kW default; rewrite `estimateKwFromChargers` with simpler pattern matching |

