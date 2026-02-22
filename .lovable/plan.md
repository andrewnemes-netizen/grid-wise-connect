

## EV Hub Engine: ENWL Thresholds + BOQ Gaps + Re-test

Three workstreams executed in sequence, preserving the existing safety-first "pending -> study required" escalation.

---

### 1. Insert ENWL DNO-specific ruleset (database)

Insert a new row into `ev_hub_rulesets` with `dno_key = "ENWL"` and HIGH-confidence values extracted from ENWL ES281 I&C documentation. This flips the 7 previously-pending fields to real values, allowing ENWL scenarios to reach `LV_OK`.

Fields to populate with HIGH confidence:
- `lv_max_demand_kva`: 276 (ENWL standard LV threshold)
- `service_cable_default`: "185mm2 Al Wavecon" 
- `lv_main_cables`: ["185mm2 Al", "300mm2 Al"]
- `cover_depths_mm`: { footway: 450, carriageway: 600, verge: 450 }
- `extraneous_distance_threshold_m`: 2.5
- `headroom_factor`: 0.2
- `fault_level_thresholds`: { minimum_ka: 5, maximum_ka: 25 }
- `transformer_loading_thresholds`: { max_loading_pct: 80 }
- `reinforcement_mitigation_sequence`: ["LOAD_MANAGEMENT", "LV_SPLIT", "NEW_TRANSFORMER"]
- `cable_scoring_weights`: { distance: 0.4, capacity: 0.3, age: 0.15, accessibility: 0.15 }
- `protection_grading`: { type: "HRC", rating_a: 315, breaking_capacity_ka: 33 }
- `traffic_management_rules`: { carriageway_requires_tm: true, footway_requires_tm: false }
- **New field** `max_service_length_m`: 25 (ENWL max service run before main extension triggered)

All fields set to `confidence: "HIGH"`, `source: "ENWL_ES281"`, `pending: false`.

---

### 2. Add LV main extension logic

When route total length exceeds the rule-driven `max_service_length_m` threshold, split the BOQ into service tail + LV main extension segments.

**Types** (`src/lib/evHub/types.ts`):
- Add `max_service_length_m` as an optional `RuleField` on `EvHubRules`

**BOQ Generator** (`src/lib/evHub/boqGenerator.ts`):
- Accept `rules: EvHubRules` as an additional parameter
- Read `max_service_length_m` from rules (default 25m if not set)
- If `route.total_length_m > maxServiceLength`:
  - E001 service cable quantity = `maxServiceLength` (not full route)
  - Add new E007 "LV main cable extension" with quantity = `route.total_length_m - maxServiceLength`
  - Add E008 "Service/main cable joint" (1 ea)
- Otherwise: E001 = full route length (current behaviour)

**Edge function** (`supabase/functions/ev-hub-engine/index.ts`):
- Mirror the same split logic in the server-side BOQ generation

**Engine orchestrator** (`src/lib/evHub/engine.ts`):
- Pass `rules` through to `generateSplitBoq()`

---

### 3. Add EARTHING_ALLOWANCE_NR BOQ line

When `earthing.review_required === true` and `earthing.selected === "UNCONFIRMED"`, add an earthing allowance line item.

**BOQ Generator** (`src/lib/evHub/boqGenerator.ts`):
- After the existing E005 earthing block, when `earthing.review_required` is true, add:
  - E009 "Earthing allowance (non-standard, TBC)" | lot | 1 | electrical

**Edge function** (`supabase/functions/ev-hub-engine/index.ts`):
- Same logic: when earthing review_required, add E009 to the electrical BOQ array

---

### 4. Update baseline rule loader

**Rule loader** (`src/lib/evHub/ruleLoader.ts`):
- Add `max_service_length_m` to `getBaselineRules()` as pending/LOW (preserving safety-first for non-ENWL DNOs)

---

### 5. Add unit tests for new logic

**Test file** (`src/test/evHubEngine.test.ts`) -- add 4 new tests:

1. "generates LV main extension BOQ when route exceeds max service length" -- 55m route with 25m threshold produces E001 (25m), E007 (30m), E008 (1 ea)
2. "no main extension when route under threshold" -- 20m route produces E001 (20m), no E007
3. "adds EARTHING_ALLOWANCE_NR when review required" -- extraneous=true produces E009
4. "ENWL rules allow LV_OK state" -- using non-pending ENWL-style rules, verify state = LV_OK

---

### 6. Re-test via edge function

After deploying, re-run Scenario 1 (clean LV) and Scenario 4 (long service) against `dno_override: "ENWL"` to verify:
- Scenario 1: `LV_OK` (no more pending fields)
- Scenario 4: BOQ contains E007 LV main cable extension
- Scenario 2: BOQ contains E009 earthing allowance

---

### Technical notes

- The "pending -> study required" escalation is NOT removed. ENWL extraction simply sets those fields to HIGH confidence / pending=false. Other DNOs (UKPN, NPG, etc.) still fall back to UK_ALL baseline with pending fields and will correctly return `DNO_STUDY_REQUIRED`.
- Main extension logic uses `route.total_length_m` (geometry-driven from route segments), not straight-line distance.
- No schema migration needed -- just a data INSERT into the existing `ev_hub_rulesets` table.

