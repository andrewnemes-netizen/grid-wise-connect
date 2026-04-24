# Why the Commercial total (£6,371) and Budget Estimate (£18,581) disagree

## Root cause

The two panels are powered by **two independent calculations** that receive **different cable lengths**:

1. **Commercial section — £6,371**
   Comes from `project.commercial.cost_range` and `filteredPack.total_shown`, produced by `runCommercialEngine` inside `runGridwiseProject`. It uses `assets.distances` — the distances the Asset engine measured from the destination pin to the nearest substation **at the moment the orchestrator ran**. This number does not know about the drawn route or the spur-to-POC measured by the new `findNearestLvMainForRoute` lookup.

2. **Budget Estimate — £18,581**
   Computed locally inside `CostEstimatePanel` by `estimateConnectionCost(...)`, fed by the panel's `distances` memo (`AssessmentPanel.tsx` lines 293–314), which **overrides** primary/feeder/capacity to the new `effectiveCableLengthM = routeDistanceM + spurToPocM` (~88 m in your screenshot).

Same pricing function, different inputs → different totals. The Commercial pack also doesn't see the 25 m service / 185mm² mains-extension split, so its BoQ is internally inconsistent with the DNO Rules Validator.

```text
runGridwiseProject ──► assets.distances (pin → nearest substation)
        │                       │
        │                       ▼
        │              runCommercialEngine ──► cost_range £6,371   ◄── stale
        │
        ▼
project (state)

[user draws route, lvCableMatch resolved AFTER orchestrator]
        │
        ▼
AssessmentPanel.distances  (effectiveCableLengthM = route + spur, ~88 m)
        │
        ▼
CostEstimatePanel.estimateConnectionCost ──► £18,581             ◄── current
```

## Plan — one source of truth, route-aware

### 1. Centralise effective distances
In `AssessmentPanel.tsx`, build a single `effectiveDistances` object derived from `effectiveCableLengthM` (route + spur, capped/split by the mains-extension threshold). Use it everywhere a cost engine is invoked: the inline `CostEstimatePanel`, `runLvOptimiser`, the saved-assessment payload, and the new orchestrator re-run below.

### 2. Re-run the Commercial engine after the route is known
Two options, pick whichever the user prefers:

- **A. Re-run `runGridwiseProject` once `lvCableMatch` resolves**, passing the route + spur so the Asset engine reports `assets.distances` with `effectiveCableLengthM`. Cleanest, but doubles work.
- **B. Lighter patch**: keep one orchestrator run, then call `runCommercialEngine` again locally with overridden `assets.distances` and update `project.commercial`. Faster, smaller blast radius.

Recommendation: **B** for now (fast, accurate), with a follow-up to fold route-awareness into the Asset engine itself.

### 3. Mains-extension split inside the BoQ
Pass `effectiveCableLengthM`, `serviceCableLengthM`, `mainsExtensionLengthM`, and `needsMainsExtension` into `runCommercialEngine` (extend `SiteInput` or add a `routeOverrides` arg). Update `generateSplitBoq` / `generateBom` so the cable line items reflect:
- 25 m × 35 mm² CNE service, plus
- (effective − 25) m × 185 mm² 4c XLPE/SWA mains extension,
mirroring exactly what the DNO Rules Validator already shows.

### 4. UI reconciliation
- Commercial "Estimated Cost Range", `Total` (Client / Installer views), Engineering BOQ, and Budget Estimate `Estimated Total` will now all derive from the same cable length and unit rates → totals will agree (within the ±15/+25 % range bands the Commercial card already shows).
- Add a tiny caption under the Commercial total: *"Based on effective cable length: {effectiveCableLengthM} m ({serviceCableLengthM} m service + {mainsExtensionLengthM} m mains extension)"* so the alignment is auditable at a glance.

### 5. Verify against the screenshot
After the fix, with route ≈ 47 m + spur ≈ 41 m → 88 m effective, both panels should converge near the £18 k figure (the Budget Estimate is the engineering-grade number). The £6 k value was the stale "pin-to-substation" estimate from before the route was drawn.

## Files to change

- `src/components/map/AssessmentPanel.tsx` — build `effectiveDistances`, post-route `runCommercialEngine` re-run, pass route overrides, update saved payload and PDF inputs, add reconciliation caption.
- `src/lib/gridwise/commercialEngine.ts` — accept optional `routeOverrides` ({ effective_length_m, service_length_m, extension_length_m, needs_mains_extension }) and forward to `estimateConnectionCost` / `generateBom` / `generateSplitBoq`.
- `src/lib/gridwise/types.ts` — extend `SiteInput` (or a new arg type) with the route overrides.
- `src/lib/connectionCosts.ts` — honour `effective_length_m` and the service/extension split when present, instead of recomputing from `distances`.
- `src/lib/evHub/boqGenerator.ts` (`generateSplitBoq`) — emit the two cable line items when `needs_mains_extension`.
- `src/lib/generateAssessmentPdf.ts` — already updated for the cable split; confirm it now reads from the unified Commercial pack, not the local re-estimate, so the PDF and UI agree.

## Out of scope (call out only)

- Re-architecting the Asset engine to be route-aware end-to-end (option A above) — defer to a follow-up.
- Changing unit rates or margin policy — none of that needs to move to fix the divergence.
