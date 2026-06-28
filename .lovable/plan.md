## Goal
Make SSEN substation popups display **firm capacity, peak demand and headroom** — matching the UKPN experience — by ingesting SSEN's LTDS data, which is where this information actually lives.

## What SSEN publishes (confirmed)
The `dx-sepd_long_term_development_statement` dataset exposes three usable API resources for headroom:

1. **LTDS Capacity Heatmap** (GeoJSON, May 2026) — polygons with capacity attributes ready for the map.
2. **LTDS Tables** (XLSX, Nov 2025) — Tables 1–6: transformer ratings, peak demand, fault levels per primary/grid site.
3. **LTDS Data Definitions** (CSV) — column dictionary.

`dx-shepd_long_term_development_statement` follows the same pattern for the North-Scotland region.

Everything else in the dataset is PDF/zip CIM — out of scope for V1.

## What to build

### 1. New `ssen-ltds-ingest` Edge Function
Mirrors `ukpn-ltds-ingest`. For each SSEN region (SEPD, SHEPD):
- Pull the latest XLSX LTDS Tables resource from CKAN.
- Parse via SheetJS (`xlsx` npm import) — read sheets named like `Table 2 – Transformers`, `Table 3 – Peak Demand`, `Table 4 – Fault Levels`.
- Normalise rows into the new tables below.
- Pull the Capacity Heatmap GeoJSON straight into `geo_polygons` under a new layer.

### 2. New tables (mirror UKPN LTDS schema)
- `ssen_ltds_transformers` — site_name, voltage_kv, transformer_id, rating_mva, region (SEPD/SHEPD), source_date
- `ssen_ltds_peak_demand` — site_name, voltage_kv, winter_peak_mw, summer_peak_mw, year, region
- `ssen_ltds_fault_levels` — site_name, voltage_kv, three_ph_ka, single_ph_ka, region
- All with `service_role` full + `authenticated` SELECT grants and RLS.

### 3. New layer: "SSEN LTDS — Capacity Heatmap"
- `layer_registry` entry → `geo_polygons` storage, SEPD + SHEPD merged, RAG-styled by available capacity.
- Auto-fly-to behaviour from the existing layer bbox logic.

### 4. Popup integration (`FeatureInfoPanel.tsx`)
For any SSEN substation point, look up the LTDS row by **site name + voltage class** (with fuzzy match — SSEN names are inconsistently cased/spaced).
- If a match is found, render the same **Capacity & Headroom (N-1)** + **Estimated spare capacity** cards used for UKPN sites.
- Headroom formula: `Σ(transformer ratings) − Σ(largest transformer) − peak demand` (standard N-1).
- If no LTDS match (typical for LV/pole-mounted), keep the existing "open register does not publish firm capacity" footnote.

### 5. Admin Registry wiring
- Flip `dx-sepd_long_term_development_statement` and `dx-shepd_long_term_development_statement` from "pending" to routed-through-`ssen-ltds-ingest` (registry entry pointing to the new function instead of `npg-dataset-ingest`).

## Out of scope
- CIM EQ Profile zips (different ingestion problem; deferred).
- LV/pole-mounted substations — SSEN does not publish capacity for these anywhere; the existing footnote stays.
- Embedded Capacity Register cross-referencing (separate dataset, separate ticket).

## Verification
1. Ingest SEPD LTDS → confirm `ssen_ltds_transformers` rows > 0.
2. Open a known Primary/Grid site in Oxford (e.g. APPLETON 11kV/LV is LV → won't match; pick a 33kV primary).
3. Confirm Capacity & Headroom card renders with non-zero MVA.
4. Toggle the Capacity Heatmap layer → polygons render across SEPD region.
