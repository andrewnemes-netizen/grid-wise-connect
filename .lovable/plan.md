## Fix POC distance logic and mains-extension surfacing

Three coordinated changes so the drawn route, POC distance, BoQ and DNO mains-extension rule all reconcile.

### 1. Snap POC to the nearest point on the drawn route (PostGIS)

Update the `find_nearest_compatible_lv_main` RPC to accept the full drawn route as a LineString, not just the destination point.

- New signature: `find_nearest_compatible_lv_main(route_geojson jsonb, search_radius_m int default 100)`
- Build route geometry once: `ST_GeomFromGeoJSON(route_geojson)` → SRID 4326 → transform to 27700 for metric work
- Bounding-box prefilter on `geo_cables.geom` against the route's expanded envelope (keeps GIST index in play)
- For each candidate cable: `ST_Distance(route_27700, cable_27700)` is the **true spur length** from any point on the route to the cable
- Return: cable type, asset_id, EV-compatibility, direct/ducted kVA, **distance_m** (spur, can be 0 if route already touches main), and the snap point lng/lat (from `ST_ClosestPoint(cable, route)`)
- Keep the LV-only filter and EV-compatibility check from the current RPC

Old single-point version stays callable as a thin wrapper for backward compatibility (wraps the point in a 1-vertex LineString).

### 2. Single source of truth for cable length

In `src/components/map/AssessmentPanel.tsx`:

- Add `effectiveCableLengthM = routeDistanceM + (lvCableMatch?.distanceM ?? 0)`
- Replace every use of `routeDistanceM` that feeds an engine with `effectiveCableLengthM`:
  - `distances` memo (lines 296–308) — drives `connectionCosts.ts`, BoQ, voltage drop
  - `runLvOptimiser` route_length_m (line 1086)
  - `runVoltageComparison` route_length_m (line 1153)
- `routeDistanceM` itself stays untouched — still used for the "Route Distance" headline so the user can see what they drew

Because the snapped POC distance can now legitimately be 0 (route already touches the main), the engine never double-counts.

### 3. Surface mains extension in panel + PDF

The cost engine already implements the `> 25 m` branch (185mm² 4c XLPE/SWA + 2 terminations + 2 joint bays + pot end + extra labour). We just need to expose it.

**Electrical & Safety panel** (`AssessmentPanel.tsx`, around line 985):

- Replace the single "New Service Cable (BoQ)" row with a Mains Extension block driven by `effectiveCableLengthM > 25`:
  - **Yes**: shows two lines — `Service: 25 m × 35mm² concentric CNE` and `Mains Extension: Xm × 185mm² 4c XLPE/SWA`
  - **No**: shows one line — `Service: Xm × 35mm² concentric CNE`
- Add a small badge: "Mains Extension Required" (amber) or "Standard Service" (neutral)

**Route Distance card** (line 653):

- When a POC is found, change the headline to `effectiveCableLengthM` and add a sub-line: `21 m drawn + 50 m spur to existing LV main`
- When no POC found yet, current behaviour preserved

**Functional Proposal PDF** (`src/lib/generateAssessmentPdf.ts`):

- In the **Connection Cable & Upstream Headroom** block, add three rows:
  - Total New Cable Length: `Xm` (drawn + spur breakdown)
  - Mains Extension Triggered: `Yes / No` with the 25m DNO threshold cited
  - Cable Composition: the two-cable split when triggered, single cable otherwise
- BoQ table picks up the new lengths automatically (reads from cost engine output, no template changes needed)

### Files touched

- `supabase/migrations/<new>.sql` — updated RPC accepting LineString
- `src/lib/lvMainSearch.ts` (or wherever `findNearestLvMain` lives) — pass route GeoJSON instead of single point
- `src/components/map/AssessmentPanel.tsx` — `effectiveCableLengthM`, panel surfacing, route-card sub-line
- `src/lib/generateAssessmentPdf.ts` — Mains Extension block in Connection Cable section

### Out of scope (deliberately)

- Not changing the 25 m threshold — already DNO-configurable via `unit_rates.ln_threshold_m`
- Not auto-extending the user's drawn polyline to the main — engineer keeps control of the trench alignment
- Not changing the 35mm² CNE / 185mm² XLPE cable choices — they match NPG v3.0 standard practice

### Verification (after build)

End-to-end check on the Starbeck test site:
1. Re-draw the same 21 m route → POC lookup → confirm spur ≈ 50 m, total ≈ 71 m, **mains extension triggered**, BoQ shows 25 m of 35mm² CNE + 46 m of 185mm² 4c XLPE/SWA + 2 terminations
2. Re-draw a route that intentionally crosses the LV main → POC lookup → confirm spur ≈ 0 m, no double-counting, mains extension still fires because route itself > 25 m
3. Re-draw a short 10 m route directly onto the main → confirm spur = 0, no mains extension, single 10 m service cable in BoQ
4. Generate PDF → confirm Connection Cable section shows split, BoQ matches panel
