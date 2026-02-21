

## Fix: Make Voltage Selector Visible Before Assessment

### The Problem

The "Connection Voltage" dropdown (Auto / LV / HV / EHV) is currently inside `CostEstimatePanel`, which only appears after clicking "Assess Feasibility & Cost" and getting results back. Users cannot see or interact with it beforehand.

### The Fix

Move the voltage override state up to `ConnectAssessmentPanel` so the dropdown appears alongside the "Proposed Load (kW)" input -- visible before running the assessment. The selected value is then passed down to `CostEstimatePanel`.

### Changes

**1. `src/components/map/ConnectAssessmentPanel.tsx`**
- Import `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from UI components
- Import `VoltageOverride` type from `@/lib/connectionCosts`
- Add `voltageOverride` state (`useState<VoltageOverride>("Auto")`)
- Add a "Connection Voltage" dropdown below the "Proposed Load (kW)" input (before the Assess button)
- Pass `voltageOverride` as a new prop to `CostEstimatePanel`

**2. `src/components/map/CostEstimatePanel.tsx`**
- Add `voltageOverride` to `CostEstimatePanelProps`
- Remove the internal `voltageOverride` state (use the prop instead)
- Remove the voltage selector UI from this component (it now lives in the parent)
- Keep the "Using: LV/HV/EHV" indicator text

This way the user sees the voltage selector as soon as the Connect Assessment panel opens, right next to the load input.

### Technical Details

**ConnectAssessmentPanel additions (around lines 69-71, 184-193):**
```text
+ state: const [voltageOverride, setVoltageOverride] = useState<VoltageOverride>("Auto")
+ UI: Connection Voltage dropdown (same options: Auto, LV, HV, EHV) placed after the kW input
+ prop: <CostEstimatePanel voltageOverride={voltageOverride} ... />
```

**CostEstimatePanel changes:**
```text
+ prop: voltageOverride: VoltageOverride added to CostEstimatePanelProps
- removed: internal voltageOverride state
- removed: voltage selector UI (Select dropdown)
  kept: "Using: {voltage_level}" indicator text
```

