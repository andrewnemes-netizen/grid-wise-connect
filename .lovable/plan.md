

# Merge Three Assessment Tools into One Master "Assess" Function

## Duplicate Analysis

After examining all engine files, here are the exact duplications:

### 1. Voltage Resolution — duplicated 3 times
- `connectionCosts.ts:176` → `resolveVoltageLevel()`: `kva = kw / 0.95; kva <= 275 → LV`
- `evHub/electricalSizing.ts:27` → `totalDemandKva = diversifiedKw / 0.95; lvMaxKva ?? 276`
- `gridwise/electricalEngine.ts:29-30` → `kva = proposed_kw / 0.95; kva <= 275 → LV`

All three use the same 275 kVA / 0.95 PF threshold but implement it independently.

### 2. DNO Options List — duplicated 2 times
- `EvHubPanel.tsx:51-58` → `DNO_OPTIONS` array (6 DNOs)
- `GridwisePanel.tsx:54-62` → `DNO_OPTIONS` array (same 6 DNOs + auto)

### 3. Feasibility State Config — duplicated 2 times
- `EvHubPanel.tsx:43-49` → `STATE_CONFIG` (5 states with icons/colors)
- `GridwisePanel.tsx:64-70` → `FEASIBILITY_CONFIG` (identical 5 states)

### 4. DNO Lookup Logic — duplicated 2 times
- `EvHubPanel.tsx:79-99` → calls `supabase.rpc("lookup_dno_by_location")`
- `GridwisePanel.tsx` → same RPC call with same error handling

### 5. Haversine Distance — duplicated in Connect panel
- `ConnectAssessmentPanel.tsx:76-87` → `haversineM()` — only used here, could use Turf.js or shared util

### 6. Surface Split Derivation — duplicated 2 times
- `connectionCosts.ts:159-174` → `deriveSurfaceSplit()` from constraint widths
- `gridwise/routeEngine.ts:269-279` → identical calculation inline

### 7. EV Hub Engine = Subset of Gridwise
- `EvHubPanel` calls `runEvHubEngine()` directly
- `GridwisePanel` calls `runGridwiseProject()` which calls `runFeasibilityEngine()` which calls `runEvHubEngine()` internally
- The EV Hub panel is a strict subset — it produces less output with the same inputs

### 8. Cost Estimation — two separate paths
- `ConnectAssessmentPanel` calls `estimateConnectionCost()` directly with drawn route distances
- `GridwisePanel` calls `runCommercialEngine()` which calls `estimateConnectionCost()` with asset-discovered distances
- Same underlying function, different distance sources

## What's NOT duplicated (unique per tool)

| Feature | Owner | Status |
|---------|-------|--------|
| LV/HV/EHV Voltage Comparison | Connect only | Keep — absorb into merged panel |
| LV Optimiser (cable catalogue ranking) | Connect only | Keep — absorb into merged panel |
| Saved Assessments + Comparison | Connect only | Keep — absorb into merged panel |
| PDF/JSON Export | Connect only | Keep — absorb into merged panel |
| Score-site GREEN/AMBER/RED | Connect only | Keep — run alongside pipeline |
| Manual Route Drawing mode | Connect only | Keep — becomes sub-mode |
| Asset Discovery (PostGIS spatial) | Gridwise only | Keep |
| Commercial Pack (audience filter) | Gridwise only | Keep |
| Viability Index (0-100) + banding | Gridwise only | Keep |
| Pipeline progress stages | Gridwise only | Keep |
| Save to Portfolio | Gridwise only | Keep |
| Engineering BOQ (4-category split) | EV Hub / Gridwise | Keep (already shared) |
| Earthing + Reinforcement | EV Hub / Gridwise | Keep (already shared) |

## Implementation Plan

### Step 1: Extract shared constants to a shared module

Create `src/lib/shared/assessmentConstants.ts`:
- `resolveVoltageLevel(kw, override)` — single source of truth for 275 kVA threshold
- `DNO_OPTIONS` array
- `FEASIBILITY_STATE_CONFIG` (icons, colors, labels)
- `deriveSurfaceSplit()` — move from `connectionCosts.ts`

Update `connectionCosts.ts`, `evHub/electricalSizing.ts`, `gridwise/electricalEngine.ts` to import from shared module instead of duplicating.

### Step 2: Create unified `AssessmentPanel.tsx` (~1200 lines)

Combines all three panels:
- **Input section**: Site name, charger count/kW, diversity, voltage override, DNO selector, extraneous toggle (from all three)
- **Two entry modes**: Pin drop (auto pipeline) OR Route draw (manual source→destination)
- **Run button**: Always calls `runGridwiseProject()` — which internally runs EV Hub
- **Results sections** (merged from all three):
  1. Feasibility verdict + viability index (Gridwise)
  2. Site score GREEN/AMBER/RED (Connect's score-site call)
  3. Asset discovery (Gridwise)
  4. Route & streetworks (Gridwise)
  5. Electrical & safety (Gridwise)
  6. Cost estimate breakdown (Connect's CostEstimatePanel)
  7. LV Optimiser button (Connect)
  8. Voltage Comparison button (Connect)
  9. Commercial pack with audience filter (Gridwise)
  10. Engineering BOQ (Gridwise/EV Hub)
  11. Audit trail (Gridwise)
- **Actions**: Save to Portfolio, Export PDF/JSON, Convert to Design, Saved Assessments drawer

### Step 3: Update `MapToolbar.tsx`

Remove tool IDs: `evhub`, `connect`, `gridwise`
Add single tool ID: `assess` (Zap icon, label "Assess")

Tool type union becomes:
```ts
"pin" | "measure" | "polygon" | "assess" | "boundary" | "design" | "streetview"
```

### Step 4: Update `MapView.tsx`

- Remove conditional renders for EvHubPanel and ConnectAssessmentPanel
- Single `<AssessmentPanel>` render when `activeTool === "assess"`
- Pass `useConnectTool` outputs for route-draw sub-mode

### Step 5: Update orchestrator for drawn route injection

Update `gridwise/orchestrator.ts` to accept manual route distances so drawn routes override automated asset discovery distances in the commercial engine.

### Step 6: Delete duplicate files

- Delete `src/components/map/EvHubPanel.tsx` (450 lines)
- Delete `src/components/map/ConnectAssessmentPanel.tsx` (850 lines)

### Step 7: Keep unchanged

All engine files remain (`evHub/*`, `gridwise/*`, `connectionCosts.ts`, `electricalEngine.ts`, `voltageComparison.ts`, `lvOptimiser.ts`, `hvOptimiser.ts`, `ehvOptimiser.ts`). Only the UI panels and shared constants change.

## Files Summary

| Action | File |
|--------|------|
| **Create** | `src/lib/shared/assessmentConstants.ts` |
| **Create** | `src/components/map/AssessmentPanel.tsx` |
| **Edit** | `src/components/map/MapToolbar.tsx` |
| **Edit** | `src/pages/MapView.tsx` |
| **Edit** | `src/lib/connectionCosts.ts` (import shared `deriveSurfaceSplit`) |
| **Edit** | `src/lib/evHub/electricalSizing.ts` (import shared voltage fn) |
| **Edit** | `src/lib/gridwise/electricalEngine.ts` (import shared voltage fn) |
| **Edit** | `src/lib/gridwise/routeEngine.ts` (import shared `deriveSurfaceSplit`) |
| **Edit** | `src/lib/gridwise/orchestrator.ts` (route distance injection) |
| **Edit** | `src/hooks/useConnectTool.ts` (type cleanup) |
| **Delete** | `src/components/map/EvHubPanel.tsx` |
| **Delete** | `src/components/map/ConnectAssessmentPanel.tsx` |

**Net result**: ~1300 lines removed, 6 duplicated functions consolidated into 1 each, single toolbar button, one cost path.

