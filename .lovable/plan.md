

## Add LV Connection Architecture, Voltage Override, and DNO-Specific LV Cable Joints

### The Problem

The current cost engine picks voltage automatically based on load and is missing key LV-specific equipment. Real-world LV connections from an HV source involve a transformer feeding LV underground cable to a feeder pillar and 100A 3-phase cutout. Additionally, LV cable joints are DNO-specific (different specification and cost from HV/EHV joints) and need their own unit rate.

### What Changes

**6 areas updated** across cost engine, database, UI, and BOM

---

### 1. New Unit Rates (Database Migration)

Add three new columns to the `unit_rates` table:

| Column | Default | Description |
|---|---|---|
| `feeder_pillar_each` | £3,200 | LV feeder pillar / distribution cabinet |
| `cutout_100a_3ph` | £850 | 100A 3-phase cutout at customer boundary |
| `jointing_lv_each` | £1,800 | DNO-specific LV cable joint (lower spec than the existing HV/EHV joint at £2,800) |

The existing `jointing_each` (£2,800) continues to apply to HV and EHV connections only.

### 2. Update `UnitRates` Interface and Defaults (`src/lib/connectionCosts.ts`)

Add the three new rate fields to the `UnitRates` type and `DEFAULT_UNIT_RATES`:

```text
feeder_pillar_each: 3200
cutout_100a_3ph: 850
jointing_lv_each: 1800
```

### 3. Add Voltage Override to Cost Engine (`src/lib/connectionCosts.ts`)

- Add optional `voltage_override?: "Auto" | "LV" | "HV" | "EHV"` to `EstimateInput`
- When set to anything other than "Auto", use that voltage level instead of the kW-based auto-detection
- This lets users model an LV connection even at higher loads (or force HV for smaller loads)

### 4. Add LV-Specific Equipment and DNO Joint Logic to Cost Estimate

When voltage = LV, the connection architecture and costing becomes:

```text
HV Source Asset
   |
   +-- Transformer (sized by kW, as today)
   |
   +-- LV Underground Cable (185mm2 4-core XLPE, £85/m)
   |       |
   |       +-- LV Cable Joints (DNO-specific, £1,800/ea, 1 every 250m)
   |
   +-- LV Feeder Pillar (£3,200)
   |
   +-- 100A 3-Phase Cutout (£850)
   |
   +-- Whole Current Meter (£1,200)
```

When voltage = HV or EHV, joints use the existing `jointing_each` rate (£2,800) as today.

The joint selection logic in `estimateConnectionCost`:
```text
jointRate = (voltageLevel === "LV") ? rates.jointing_lv_each : rates.jointing_each
```

This applies to both the cost breakdown line items and the BOM.

### 5. Add Voltage Selector to UI

Add a "Connection Voltage" dropdown in **ConnectAssessmentPanel** and **CostEstimatePanel**, with options:

- **Auto** (default -- determines voltage from kW as today)
- **LV** -- forces LV cable + DNO LV joints + feeder pillar + cutout
- **HV** -- forces HV cable + HV joints + RMU + CT metering
- **EHV** -- forces EHV architecture

### 6. Update BOM Generator

- When voltage = LV: use "LV straight joint (DNO-specific)" description and `jointing_lv_each` rate; add feeder pillar and cutout items
- When voltage = HV/EHV: use existing joint type and rate (unchanged)

### 7. Update Unit Rates Hook and Admin Settings

- `useUnitRates.ts` -- read the three new columns (`feeder_pillar_each`, `cutout_100a_3ph`, `jointing_lv_each`)
- `UnitRatesSettings.tsx` -- add three new fields in appropriate groups:
  - "LV cable joint" (£/ea) in the **Equipment** group
  - "Feeder pillar" (£/ea) in a new **LV Endpoint** group
  - "100A 3ph cutout" (£/ea) in the **LV Endpoint** group

---

### Technical Details

**Database migration SQL:**
```sql
ALTER TABLE public.unit_rates
  ADD COLUMN feeder_pillar_each numeric NOT NULL DEFAULT 3200,
  ADD COLUMN cutout_100a_3ph numeric NOT NULL DEFAULT 850,
  ADD COLUMN jointing_lv_each numeric NOT NULL DEFAULT 1800;
```

**Joint rate selection in estimateConnectionCost (simplified):**
```text
jointRate = voltageLevel === "LV" ? rates.jointing_lv_each : rates.jointing_each
jointDescription = voltageLevel === "LV" ? "LV cable joints (DNO-specific)" : "Cable joints"
```

**Voltage override logic:**
```text
if voltage_override is set and not "Auto":
  voltageLevel = voltage_override
else:
  voltageLevel = kW <= 80 ? "LV" : kW <= 1500 ? "HV" : "EHV"
```

**LV equipment additions in estimateConnectionCost:**
```text
if voltageLevel === "LV":
  + feeder_pillar_each  (1x, fixed)
  + cutout_100a_3ph     (1x, fixed)
  + jointing_lv_each    (replaces jointing_each for LV joints)
  + whole current meter  (existing)
  - no switchgear/RMU   (existing behaviour)
```

**Files changed:**
- `supabase/migrations/` -- new migration for three unit_rates columns
- `src/lib/connectionCosts.ts` -- UnitRates type, defaults, joint logic, LV equipment, BOM
- `src/hooks/useUnitRates.ts` -- read three new columns
- `src/components/admin/UnitRatesSettings.tsx` -- admin editing for three new rates
- `src/components/map/CostEstimatePanel.tsx` -- voltage selector + pass-through
- `src/components/map/ConnectAssessmentPanel.tsx` -- voltage selector dropdown

