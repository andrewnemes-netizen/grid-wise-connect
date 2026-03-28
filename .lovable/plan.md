

## Restructure Cost Model: Materials + Labour (SOR-Based)

### The Correction

All ICP SOR line items are **material only**. Labour is charged separately as day rates. The current system lumps material + labour into single unit prices, which overstates costs and doesn't match how ICP pricing actually works.

### Key Change

Split every cost line into **material cost** (from SOR) and **labour cost** (from day rates). The BOM and cost estimate will show both separately.

**Labour rates from SOR:**
- LV Joint Team (Day 1): **£1,620/day**
- Used for: jointing, terminations, cable pulling, testing

### What Changes

**`src/lib/connectionCosts.ts`**

1. **Add labour day rate constants:**
   - `LV_JOINT_TEAM_DAY = 1620`
   - Labour allocation rules per activity (e.g. 1 joint = 0.5 day, 1 termination = 0.25 day, cable pull per 100m = 0.5 day)

2. **Update material-only costs from SOR** — strip labour from current unit rates:
   - `jointing_lv_each`: change from £1,800 (blended) → SOR material-only price (e.g. ~£366 for 185mm joint kit, ~£182 for pot end)
   - `termination_each`: material-only cost
   - Joint bay: surface-aware material costs (£850 soft / £1,330 footway / £2,360 carriageway)
   - Cable joint kit: £366.23 (185mm waveform kit)

3. **Add labour line items to breakdown and BOM:**
   - Calculate total labour days based on scope (joints × 0.5 day + terminations × 0.25 day + cable pull days + testing)
   - Add "LV Joint Team" as a separate line: quantity = days, unit_cost = £1,620/day

4. **Add service cable vs mains extension logic** (from previous approved plan):
   - Service cable: 35mm² concentric CNE, always used
   - Mains extension: 185mm² 4c XLPE when distance > 25m
   - Joint bay + cable joint added when mains extension triggers

5. **Update `CostLineItem` and `BomItem`** — add optional `cost_type: "material" | "labour"` field for clear separation in the UI and PDF

6. **Update `UnitRates` interface and defaults** — add new fields for SOR material rates and labour day rate

**`src/components/admin/UnitRatesSettings.tsx`**
- Add the new SOR material rates and labour day rate to the admin settings panel

**`src/hooks/useUnitRates.ts`**
- Map new database fields

**Database migration**
- Add new columns to `unit_rates` table for SOR material rates and labour day rate

### Result

For a 55kW site at 13m:
- **Material**: 35mm² CNE service cable × 13m, joint kit, cutout, feeder pillar — all at SOR prices
- **Labour**: LV Joint Team × estimated days (e.g. 1.5 days = £2,430)
- **Total**: material subtotal + labour subtotal + fees/contingency
- BOM clearly separates material lines from labour lines

### Files to Change
| File | Change |
|------|--------|
| `src/lib/connectionCosts.ts` | Split material/labour, add SOR rates, service cable logic, labour day calculation |
| `src/components/admin/UnitRatesSettings.tsx` | Add SOR material + labour rate fields |
| `src/hooks/useUnitRates.ts` | Map new fields |
| Database migration | Add columns for SOR rates + labour day rate |

