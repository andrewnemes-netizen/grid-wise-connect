## Why you see "0 layers created, undefined reused, 0 datasets linked"

Two separate problems combine into that single confusing toast:

### 1. `undefined reused` — frontend bug
The toast reads `result.layers_reused`, but the SQL function `auto_create_dno_layers` only returns `layers_created` and `datasets_linked`. The "reused" field was never added, so JavaScript prints `undefined`.

### 2. `0 layers created, 0 datasets linked` — pattern matching missed everything
You actually have **94 SSEN Distribution datasets** in the catalogue (Discover All Datasets worked fine — the "0 Total Rows" counter on screen only counts *synced* rows, not catalogue entries).

The auto-link function runs `ILIKE` patterns against the dataset titles, but the patterns I added in the last migration don't match what SSEN actually publishes. For example, SSEN's titles look like:
- `[SHARED DATA] GIS Network Line Data`
- `Primary Substation Electricity Supply Areas`
- `Secondary Substation Electricity Supply Areas`
- `Smart Meter LV Feeder Usage`
- `SSEN Distribution Licence Area Boundaries`
- `Embedded Capacity Register`
- `NaFIRS HV Faults` / `NaFIRS LV Faults`

But my migration looked for things like `'%hv cable%'`, `'%lv overhead%'`, `'%distribution transformer%'` — none of which appear in SSEN's titles. SSEN publishes mostly **reports, registers and supply-area boundaries**, not raw asset geometry layers like NPG does.

## The fix

### A. Update the toast (small UI fix)
In `src/components/admin/NpgDatasetRegistry.tsx`, change the toast string to drop `layers_reused` (or default it to `0`) so it stops showing "undefined".

### B. Rewrite the SSEN match patterns (SQL migration)
Replace the SSEN-section patterns inside `auto_create_dno_layers` with ones that actually hit SSEN's catalogue:

| Layer key | Match (ILIKE on title) |
|---|---|
| `ssen_dx_gis_network_lines` | `%gis network line%` |
| `ssen_dx_primary_supply_areas` | `%primary substation%supply area%` |
| `ssen_dx_secondary_supply_areas` | `%secondary substation%supply area%` |
| `ssen_dx_gsp_bsp_supply_areas` | `%grid supply point%supply area%` |
| `ssen_dx_licence_area` | `%licence area boundaries%` |
| `ssen_dx_smart_meter_lv_feeder` | `%smart meter%lv feeder%` |
| `ssen_dx_embedded_capacity_register` | `%embedded capacity register%` |
| `ssen_dx_nafirs_hv_faults` | `%nafirs hv faults%` |
| `ssen_dx_nafirs_lv_faults` | `%nafirs lv faults%` |
| `ssen_dx_low_carbon_connections` | `%low carbon technolog%connection%` |
| `ssen_dx_generation_availability` | `%generation availability%network capacity%` |
| `ssen_dx_realtime_outages` | `%real time outage%` |

(Reports without geometry — Long Term Development Statement, Flexibility bidding, etc. — will deliberately not become map layers.)

### C. Also return `layers_reused` from the SQL function
So the toast can show a real number going forward. Default it to `0` for now since the function doesn't yet detect reuse.

## What you'll see after

Click **Auto-Create & Link Layers** again and the toast will read something like  
`"8 layers created, 0 reused, 12 datasets linked"`, and the new SSEN Distribution layers will appear in the map's layer panel ready to sync.
