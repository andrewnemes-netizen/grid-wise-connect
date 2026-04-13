

## Plan: Fix LV BOM Quantities — Terminations, Joint Bays, and Labour

### Problem
The BOM is showing 2 LV cable terminations, 2 joint bays, and 1.5 days labour for standard LV connections that should show 1 termination, 1 joint bay, and 0.5 days.

### Root Cause
The `needsMainsExtension` flag (cable distance > 25m threshold) is likely being triggered because the `capacity_segment_m` from the scoring engine is large, even when the actual site connection is short. This cascades into doubled terminations, doubled joint bays, and inflated labour.

### Changes — `src/lib/connectionCosts.ts`

**1. Termination count** (lines ~410 and ~617)
- For LV without mains extension: force `termCount = 1`
- For LV with mains extension: `termCount = 2`
- Already coded correctly, but add a hardened guard

**2. Joint bay for terminations** (lines ~415-420 and ~621-624)
- For LV without mains extension: force `quantity = 1` (currently uses `termCount` which should be 1 but is showing 2)
- Explicitly set quantity to 1 independent of termCount for the non-extension case

**3. Labour days** (`calculateLabourDays` function, lines ~255-273)
- Ensure base case for simple LV (no mains extension, short run, 0 joints) returns exactly 0.5 days
- The `joints * 0.5` term should be 0 for standard LV — verify `totalJoints` calculation at call sites (lines ~484 and ~666) passes 0 joints when no mains extension

**4. Additional hardening at both call sites** (estimateConnectionCost line ~484, generateBom line ~666)
- For LV without mains extension, explicitly set `totalJoints = 0` to prevent any stale joint count from inflating labour

### Summary of expected output for standard LV (no mains extension)
- LV cable termination: **1 ea**
- Joint bay - termination: **1 ea**  
- LV Joint Team: **0.5 days**
- LV feeder pillar: **1 ea** (when toggle on)

