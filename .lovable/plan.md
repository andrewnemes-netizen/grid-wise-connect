## Problem

The street-lighting points are offset by ~3 metres from their true positions. This is the **expected error** of the current conversion method — the Helmert 7-parameter transform with OS-published parameters is only accurate to ~3–5 m across the UK.

The Ordnance Survey's own definitive transformation, **OSTN15**, is a grid-shift file that achieves sub-metre (typically ±0.1 m) accuracy. It's the only way to get the points sitting on the actual lampposts.

## Plan

### 1. Add OSTN15 grid-shift transformation

- Add the **OSTN15 grid** (a ~3 MB binary file of east/north shift values on a 1 km grid covering GB) to the project under `public/ostn15/`.
- Create `src/lib/ostn15.ts`:
  - Loads the OSTN15 grid lazily (fetched once, cached in memory).
  - Performs bilinear interpolation of the shifts at the input easting/northing.
  - Returns precise WGS84 lat/lng (sub-metre accuracy).
- Update `src/lib/bngToWgs84.ts` to:
  - Export an async `bngToWgs84Precise(e, n)` that uses OSTN15.
  - Keep the existing Helmert version as a synchronous fallback (used only if grid load fails).

### 2. Update Local Authority ingest UI

- Update `src/components/admin/LocalAuthorityDatasets.tsx` to:
  - Pre-load the OSTN15 grid before parsing the CSV.
  - Use `bngToWgs84Precise` for every row.
  - Show a small progress note "Loading OS national grid…" on first run.

### 3. Re-ingest the Leeds street lighting dataset

- Add a "Re-ingest with precise coordinates" button that:
  - Clears the existing 108k rows for layer `leeds-street-lighting-unmetered`.
  - Re-uploads the same CSV through the new precise pipeline.
- Alternatively (faster): a one-shot SQL migration is **not** possible because OSTN15 interpolation needs the original easting/northing values, which we did not persist. So a re-upload from the CSV is required.
  - Optional improvement: store original `easting`/`northing` in `attrs_json` going forward so we can re-project in-database later if needed.

### 4. Apply the same upgrade to other BNG consumers

- `src/lib/gpkgParser.ts` and `src/lib/gmlParser.ts` and `src/components/admin/GeoFileUploader.tsx` also use the imprecise Helmert version. Switch them to the new precise function so all future BNG ingests are accurate.

## Technical details

- **OSTN15 source**: Ordnance Survey publishes OSTN15 as a free open dataset (`OSTN15_NTv2_OSGBtoETRS.gsb` ~3 MB, or as ASCII text). We will host a compact JSON/binary version in `public/ostn15/`.
- **Algorithm**: For a point at (E, N): find the four surrounding 1 km grid nodes, look up their (ΔE, ΔN, ΔH) shifts, bilinearly interpolate, then add the interpolated shifts to (E, N) to get ETRS89 eastings/northings — which we then run through the standard projection inverse. ETRS89 ≈ WGS84 to within a few cm for GB.
- **Performance**: ~3 MB one-time fetch, cached. Interpolation per point is ~10 µs — 108k points complete in ~1 second.
- **Backwards compatibility**: existing data already in `geo_points` for other DNO layers is unaffected unless re-ingested.

## Out of scope

- Re-projecting historical data in other layers (we'll only re-ingest Leeds street lighting now; other layers can be re-ingested on request).
