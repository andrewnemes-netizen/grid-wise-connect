

## Fix: Remove Transformer, Earthing, and Plinth from LV Connections

### The Issue

The cost engine currently includes a dedicated transformer (plus associated earthing and plinth civils) for **all** connections, including LV. In reality:

- **LV connections** (up to 80kW) connect to an **existing** distribution transformer on the DNO network. No new transformer is needed.
- **HV connections** require a new dedicated transformer to step down from 11kV to LV.
- **EHV connections** require transformer(s) to step down from 33kV.

This bug inflates every LV estimate by approximately £29,700.

### Changes

**File: `src/lib/connectionCosts.ts`**

1. **`estimateConnectionCost()` function (lines 184-198)** -- Wrap the transformer block so it only applies when `voltageLevel !== "LV"`:
   - LV connections: no transformer cost
   - HV/EHV connections: existing transformer logic unchanged

2. **`generateBom()` function (lines 288-296)** -- Same change: only include transformer BOM item for HV/EHV.

3. **`generateBom()` function (lines 305-309)** -- Make earthing and transformer plinth conditional on HV/EHV only, since these are transformer-associated civils. For LV, earthing at the cutout/pillar is included in the feeder pillar cost.

### Impact on the 69kW Example from the PDF

| Item | Before | After |
|------|--------|-------|
| Cable (25m LV) | £2,125 | £2,125 |
| Excavation | £3,675 | £3,675 |
| LV joints (2x) | £3,600 | £3,600 |
| Feeder pillar | £3,200 | £3,200 |
| 100A cutout | £850 | £850 |
| 500kVA transformer | £22,000 | **Removed** |
| Whole current meter | £1,200 | £1,200 |
| Earthing | (in BoM £3,500) | **Removed** |
| Transformer plinth | (in BoM £4,200) | **Removed** |
| Subtotal | £36,650 | £14,650 |
| Fees + Contingency (24%) | £8,796 | £3,516 |
| **Total** | **£45,446** | **£18,166** |

### Technical Detail

```text
// estimateConnectionCost() - transformer block becomes:
if (voltageLevel !== "LV" && proposed_kw > 0) {
  // existing transformer sizing logic (500/1000/1500 kVA)
}

// generateBom() - transformer block becomes:
if (voltageLevel !== "LV") {
  // existing transformer BOM items
}

// generateBom() - earthing & plinth become conditional:
if (voltageLevel !== "LV") {
  items.push(earthing);
  items.push(transformer plinth);
}
```

No database changes required. This is a pure logic fix in `connectionCosts.ts`.
