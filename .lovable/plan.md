## Goal

Ingest the two NPG **monthly** circuit operational datasets and use them to colour HV/EHV cables on the map by loading %, so the existing topology layers gain a live utilisation signal without taking on the 125M-row half-hourly burden.

## Datasets

| Dataset ID | Rows | Voltage |
|---|---|---|
| `npg-132kv-circuit-operational-data-monthly` | 27,600 | 132 kV |
| `npg-33kv-circuit-operational-data-monthly` | 80,040 | 33 kV |

Both are tabular (no geometry), one row per circuit per month, containing peak MW/MVA, peak current, and circuit identifiers — joined to `geo_cables` via circuit ID.

## Plan

### 1. Schema

One new table, `public.npg_circuit_monthly`:

- `circuit_id` (text) — join key to `geo_cables.attrs_json->>circuit_id`
- `voltage_kv` (numeric) — 33 or 132
- `licence_area` (text) — NPgY / NPgN
- `year` (int), `month` (int)
- `peak_mw`, `peak_mvar`, `peak_mva`, `peak_amps` (numeric, nullable)
- `rating_mva` (numeric, nullable — circuit rating if present)
- `utilisation_pct` (numeric, generated: `peak_mva / rating_mva * 100` when both present)
- `raw_json` (jsonb)
- Primary key: `(circuit_id, voltage_kv, year, month)`
- Indexes: `(circuit_id)`, `(circuit_id, year, month DESC)`
- RLS on. `GRANT SELECT TO authenticated, anon`; `GRANT ALL TO service_role`.

Plus a view `npg_circuit_latest_utilisation` that returns the most recent 12-month peak utilisation per `circuit_id` (single row per circuit) — this is what the map renders against.

### 2. Ingestion

Extend `npg-dataset-ingest` with a `monthly_circuit` mode (auto-routed for the two dataset IDs above):

- Pulls full dataset from NPG Opendatasoft `/exports/json` using `NPG_API_KEY`.
- Maps Opendatasoft fields → schema columns (per-table mapping; field names confirmed at ingest time from the dataset's `fields` metadata).
- Batched upsert 1k rows at a time on the composite PK.
- Self-continues on timeout (existing pattern).

Total ~108k rows → completes in well under a minute end-to-end.

### 3. Map rendering

In `src/lib/mapLayers.ts` (HV 33 kV + EHV 132 kV cable layers):

- Add an optional fill expression keyed off `utilisation_pct`:
  - `< 50%` → existing voltage colour
  - `50–75%` → amber
  - `75–90%` → orange
  - `> 90%` → red
- Source the value by fetching `npg_circuit_latest_utilisation` once per session and joining client-side onto features by `circuit_id` (same pattern as NPG live-data enrichment already in use).

Add a legend chip in `MapLegend.tsx` ("Circuit loading") and a toggle in `LayerTogglePanel.tsx` ("Colour by loading %") so users can switch between voltage-class colouring and utilisation colouring.

### 4. FeatureInfoPanel

When a 33 kV or 132 kV cable is clicked, add a "Monthly utilisation (last 12 months)" block showing latest peak MW, peak MVA, utilisation %, and the month it was recorded — pulled from `npg_circuit_monthly` filtered by `circuit_id`.

### 5. Admin wiring

In `NpgDatasetRegistry.tsx`, the existing "Ingest" button on the two monthly rows routes automatically to the new mode — no new UI. The four half-hourly + EPN/SPN tabular rows get a disabled "Too large — not ingested" badge with a tooltip explaining the constraint (so it's clear in the UI why they're skipped).

## Out of scope (explicit)

- Half-hourly datasets (`*-half-hourly`, `*-half-hourly-epn`, `*-half-hourly-spn`) — ~125M rows; would need Timescale or Parquet + an aggregation job. Revisit only when a feature actually needs sub-monthly granularity.
- Appendix G project progression (52 rows) — programme metadata, not utilisation; not relevant to cable colouring.
- Changes to engines (feasibility / route / cost) — utilisation is visualised only; engines keep using LTDS/DFES headroom as today.

## Technical notes

- Join key: `circuit_id` lives in `geo_cables.attrs_json->>'circuit_id'` for NPG features (already populated by the catalog crawler). Confirm presence on ingest; if any cables are missing it, log and skip — do not fabricate.
- Use `peak_mva` over `peak_mw` for utilisation where both exist (rating is in MVA).
- Latest-12-months view, not all-time max, so seasonal context is preserved without a year filter in the UI.
- Re-ingest is idempotent thanks to the composite PK; safe to schedule monthly via `pg_cron` later if desired (not in this plan).
