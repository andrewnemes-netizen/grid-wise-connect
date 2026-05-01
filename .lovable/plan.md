## Goal

Ingest the Leeds City Council unmetered street lighting dataset (~109,708 columns lights with BNG eastings/northings) into Gridwise as a managed admin layer, queryable on the map and usable by analytical engines.

## What's in the file

- 109,708 rows, headers: `Operational Area, Road Name, Road Ref., Unit ID, Unit Ref, Unit Type, Unit Location, Easting, Northing, Lamps Per Lantern`
- Coordinates are British National Grid (need conversion via existing `bngToWgs84`)
- Geometry: Point per lighting unit
- No electrical loading; treat as **asset/context** layer (supports unmetered-supply demand estimation later)

## Proposed approach

Treat this as a one-off bulk import (not a live API), with a permanent layer entry so it appears in the map and is selectable for analytics.

### 1. Database — register the layer

New migration to seed `layer_registry`:
- `slug`: `leeds-street-lighting-unmetered`
- `display_name`: "Leeds Street Lighting (Unmetered)"
- `dno`: `Local Authority` (new bucket) — or `LCC` if you prefer city codes
- `category`: `Street Lighting`
- `subcategory`: `Unmetered Supply`
- `storage_table`: `geo_points`
- `geometry_type`: `Point`
- `style_json`: small amber dot, min_zoom ~12 (dense at city scale)
- `attribution`: "Leeds City Council, Apr 2026"

### 2. Admin UI — new "Local Authority Datasets" section

Add a small panel in `src/pages/Admin.tsx` (new tab **LA Data**, or reuse the **External APIs** tab) with one entry: **Leeds — Unmetered Street Lighting**. The panel has:
- Status badge (registered / ingested / count)
- "Upload CSV" button — opens a file picker scoped to this dataset
- Re-uses the existing ingestion pipeline (browser parses → batches → `ingest-geo-features` edge function → `geo_points`)

This avoids generic uploader confusion; it's a named, reusable slot.

### 3. Client-side parser

New helper `src/lib/parsers/leedsStreetLighting.ts`:
- Streams the CSV (PapaParse already used elsewhere, or simple split)
- For each row: convert `Easting`/`Northing` → WGS84 via existing `bngToWgs84`
- Emits a GeoJSON Feature with:
  - `geometry`: Point [lng, lat]
  - `properties`: `unit_id`, `unit_ref`, `road_name`, `road_ref`, `operational_area`, `unit_location`, `lamps_per_lantern`, `unit_type`
  - `name`: `${unit_ref} — ${road_name}`
  - `asset_id`: `LCC-${unit_id}`
- Batches of 2,000 features → calls `ingest-geo-features` with the registered `layer_id`

### 4. Map layer wiring

- The layer auto-appears in `LayerTogglePanel` once registered (layers are pulled from `layer_registry`)
- Default off; group under a new "Local Authority" bucket in the existing DNO hierarchy filter
- Style: small amber circle, max-zoom clustered above z14 to keep performance acceptable for ~110k points

### 5. Optional follow-up (not in this change)

- Use lighting density as a proxy for unmetered base load when scoring LV feeders (typical ~0.05–0.15 kW per unit × hours/day)
- Add similar slots for other LAs

## Technical details

- **No edge function changes needed** — `ingest-geo-features` already accepts `geo_points` GeoJSON with attrs_json
- **Coordinate accuracy**: existing `bngToWgs84` (Helmert 7-param) is accurate to ~1 m — good enough for asset placement
- **Performance**: 110k points × ~150 bytes = ~16 MB JSON in transit, batched in 55 chunks of 2k. Expect ~2–3 min upload
- **Idempotency**: include a "Clear & re-ingest" toggle that deletes existing `geo_points` rows for this `layer_id` before inserting
- **No new tables** — reuses `geo_points` and `layer_registry`

## Files to add / change

- **new** `supabase/migrations/<ts>_seed_leeds_street_lighting_layer.sql` — insert layer_registry row
- **new** `src/lib/parsers/leedsStreetLighting.ts` — CSV → GeoJSON streaming parser
- **new** `src/components/admin/LocalAuthorityDatasets.tsx` — the upload panel
- **edit** `src/pages/Admin.tsx` — add new tab `LA Data`
- **edit** (optional) `src/components/map/LayerTogglePanel.tsx` — only if "Local Authority" group needs explicit hierarchy entry

## Out of scope

- Electrical loading model for unmetered supplies (separate engine work)
- Other LA datasets (Manchester, Birmingham etc.) — same pattern, future
- Live API sync (Leeds publishes as static CSV, no streaming endpoint)

After approval I'll run the migration, build the admin tab, and you can immediately upload the file you've attached.