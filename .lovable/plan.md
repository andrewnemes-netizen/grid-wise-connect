## Goal

Ingest the six UKPN LTDS tables so every Grid & Primary substation on the map carries firm capacity, peak demand, derived headroom, and fault levels — the same enrichment pattern already used for NPG live data.

## Datasets

| Dataset ID | Records | Role |
|---|---|---|
| `ltds-table-2a-transformer-2w` | 2,175 | 2-winding transformer ratings (firm/cyclic MVA) |
| `ltds-table-2b-transformer-data-3w` | 142 | 3-winding transformer ratings |
| `ltds-table-3a-load-data-observed` | 1,964 | Observed peak demand (MW/MVAr) |
| `ltds-table-3b-load-data-true` | 1,964 | True (weather-corrected) peak demand |
| `ltds-table-4a-3ph-fault-level` | 2,037 | 3-phase fault levels (kA) |
| `ltds-table-4b-earth-fault-level` | 2,037 | Earth fault levels (kA) |

All are non-geospatial tabular data on UKPN's Opendatasoft portal, joined to substations via the `sitefunctionallocation` (SFL) site code.

## Plan

### 1. Schema — one table per LTDS table

Six new tables in `public.ukpn_ltds_*` (matching DNO style of existing `feeders_*` and `primary_substations_*`):

- `ukpn_ltds_transformers_2w` — sfl, site_name, voltage_kv, firm_capacity_mva, cyclic_rating_mva, nameplate_mva, year, raw_json
- `ukpn_ltds_transformers_3w` — same shape, plus tertiary winding fields
- `ukpn_ltds_peak_demand_observed` — sfl, site_name, voltage_kv, peak_mw, peak_mvar, year, season
- `ukpn_ltds_peak_demand_true` — same shape
- `ukpn_ltds_fault_3ph` — sfl, site_name, voltage_kv, fault_level_ka, x_r_ratio, year
- `ukpn_ltds_fault_earth` — sfl, site_name, voltage_kv, fault_level_ka, year

Each table:
- Index on `sitefunctionallocation` (join key) and `(site_name, voltage_kv)`.
- RLS on, `GRANT SELECT TO authenticated, anon`, `GRANT ALL TO service_role`.

### 2. Ingestion edge function — `ukpn-ltds-ingest`

One function, six modes (`?table=2a|2b|3a|3b|4a|4b`):

- Auth: `getUser()` + `has_role(admin)` (dual-client pattern).
- Pulls full dataset from `https://ukpowernetworks.opendatasoft.com/api/explore/v2.1/catalog/datasets/{id}/exports/json` using `UKPN_API_KEY`.
- Maps Opendatasoft field names → schema columns (per-table mapping object).
- Batched upsert (1k rows) on `(sitefunctionallocation, voltage_kv, year)`.
- Self-continues on timeout, same pattern as `npg-dataset-ingest`.

### 3. RPC — `ukpn_substation_capacity_lookup(_sfl text)`

Returns a single row joining all six tables for one SFL:
```
firm_capacity_mva, cyclic_mva, peak_observed_mw, peak_true_mw,
headroom_observed_mva, headroom_true_mva,
fault_3ph_ka, fault_earth_ka, year
```
`headroom_*` derived as `firm_capacity_mva − peak_*` (MVA basis, configurable pf in code if needed).

### 4. UI wiring

- **Admin → DNO Datasets**: add "Ingest LTDS" action on each of the six rows in `NpgDatasetRegistry.tsx` calling `ukpn-ltds-ingest` with the right `table` param.
- **Map → FeatureInfoPanel**: when a UKPN Grid/Primary substation is clicked, if the feature carries an SFL, fetch `ukpn_substation_capacity_lookup` and render a new "LTDS Capacity & Headroom" block (firm MVA, peak MW, derived headroom, fault levels, year).
- **NetworkVisibilityPanel**: when nearby substations are UKPN, prefer LTDS-derived headroom over the generic `transformer_headroom_kw` field already shown.

### 5. Out of scope (deliberately)

- DFES NSHR + Secondary Site Utilisation (we'll do these in a follow-up — confirmed earlier).
- Historic half-hourly power-flow datasets (tens of millions of rows; needs a different storage strategy).
- Embedded Capacity Register (generation, not network headroom).

## Technical notes

- LTDS uses **MVA**, not kW — keep MVA in storage; convert to kW only at the UI edge if needed, alongside existing kW fields.
- Join key is `sitefunctionallocation`; existing `geo_substations` rows for UKPN already include this in `attrs_json` from the catalog crawler — confirm before ingest and patch the crawler mapping if not.
- Year column is critical (multiple years per site); always select `MAX(year)` in the lookup RPC.
- Six small tabular datasets → total ~10k rows; ingest runs in seconds, no partitioning needed.
