## Problem

The Cambridge file (`ECO power cambridge (1).xlsx`, 50 sites) uses headers:

`Site Description, Address, Postcode, Latitude, Longitude, Easting, Northing, Status, Google Maps Link, 01 Lsoa Code, 02 Ward Name, 03 Dno Operator, LA`

It has **no kW column and no charger counts**, so the current LA Programme intake rejects it with "Missing capacity column". It also doesn't alias `Site Description` to `site_name`.

## What I'll change

Edit only `src/components/la/CsvIntakePanel.tsx` (presentation/intake — no scoring engine changes).

### 1. Header aliases
Add to the alias map so the Cambridge headers map cleanly:
- `site_description` → `site_name`
- `address` → `address` (kept as metadata, appended to display name if site_name is just an ID like `SC_004`)
- `easting`, `northing` → recognised but ignored (lat/lng already present)
- `01_lsoa_code` → `lsoa_code`, `02_ward_name` → `ward_name`, `03_dno_operator` → `dno`, `la` → `local_authority`

### 2. Default capacity (your answer: 4 × 7 kW = 28 kW)
Add a small control above the file picker:

```
Default capacity when missing:  [ 4 ] chargers × [ 7 ] kW  = 28 kW/site
```

- Two numeric inputs, defaulting to **4** and **7** (= 28 kW), persisted in component state.
- When a row has no `proposed_kw` and no charger-count columns, use `count × kW` as the fallback instead of erroring.
- Validation rule relaxed: kW column is no longer mandatory — if absent, the defaults are applied and a single info banner shows "Using default 28 kW (4 × 7 kW) for N sites".

### 3. Site name fallback
If `site_name` is something like `SC_004` and an `address` column exists, display as `SC_004 — 7 Denson Close` so the scored output is human-readable. The underlying `site_name` field stays as the unique ID.

### 4. 500-row cap
Cambridge file is 50 rows — well within the existing cap, no change needed.

## What stays the same

- Scoring engine (`score-sites-batch` edge function), `ProgrammeDashboard`, and `SiteRow` shape — unchanged. We still emit `{ site_name, postcode, proposed_kw, site_type, lat, lng }`.
- Lat/Lng path already exists and will be used directly (Easting/Northing ignored since WGS84 is provided).
- `site_type` defaults to `"other"` (Cambridge file has no type column).

## Verification

After build:
1. Upload `ECO power cambridge (1).xlsx` on `/la-programme`.
2. Expect: 50 rows parsed, "Using default 28 kW" banner, lat/lng badge shown.
3. Click "Score 50 Sites" → existing batch scorer runs unchanged.
