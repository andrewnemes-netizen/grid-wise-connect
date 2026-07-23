## Goal

Replace the current `src/components/delivery/estimate/RateItemPicker.tsx` with the uploaded version so that when picking rate items:

- **EV Build** estimates (`estimates.kind = 'build'`) default to the **Synthetic** rate card.
- **PoC/ICP** estimates (`estimates.kind = 'poc'`) default to the **ICP** rate card.
- Any card whose name contains **"MSA"** is always ranked last and labelled as the Fallback.

Nothing else about picking, insertion, groups, or pricing changes.

## Changes

1. **`src/components/delivery/estimate/RateItemPicker.tsx`** — overwrite with the uploaded file (`user-uploads://RateItemPicker.tsx`). This adds:
   - New optional prop `estimateKind?: "build" | "poc"`.
   - Name-based classification of `rate_card_versions` (Primary / Fallback / other) driving default selection order.
   - A "· Primary" / "· Fallback (MSA)" tag in the rate-card dropdown label.

2. **`src/components/delivery/estimate/EstimateEditor.tsx`** (line ~524) — pass `estimateKind={e.kind}` to `<RateItemPicker />` so the picker knows which card to default to. `e.kind` already exists on the estimate record (added when PoC/Build split was introduced).

## Not touched

- The three existing importers, `RateLibrary`, `UnitRatesSettings`, and `GenericRateCardImport`.
- Line insertion logic, group auto-routing, quantities, currency formatting.
- Database / RLS / rate card schema.

## Verification

- Open a Build estimate → "Add from rate card": Synthetic card preselected, MSA shown last tagged "Fallback (MSA)".
- Open a PoC estimate → same picker: ICP card preselected, MSA still last.
- Estimate with no matching primary card → first non-MSA card selected (previous behaviour preserved).
