

## Connect LA Programme to Full Intelligence Flow + Portfolio Save

### Current State

The LA Programme batch scorer (`score-sites-batch` edge function) uses its **own simplified scoring logic** — it calls only `score_site_from_lnglat` RPC and substation search. It does NOT:

1. Call the `score-site` edge function (which provides traffic AADF, accessibility/NaPTAN, grid feasibility)
2. Call the `safety-engine` edge function (STATS19 accidents, AI safety narrative)
3. Save scored sites to the `sites` table (portfolio)

The results exist only in-memory on the dashboard and can be exported as CSV, but nothing persists.

### Plan

**1. Add "Save to Portfolio" button on ProgrammeDashboard**

- Add a "Save All to Portfolio" button next to the existing "Export CSV" button
- On click, batch-insert all scored sites into the `sites` table with enriched `raw_score_data` (same format the UnifiedIntelligencePanel uses)
- Each site gets: `site_name`, `postcode`, `proposed_kw`, `site_type`, `viability_index`, `score` (band), `grid_readiness`, `deployment_class`, `cost_band`, `raw_score_data` (full JSON), `geom` (PostGIS point from lng/lat)
- Skip sites that errored during scoring
- Show toast with count of saved sites

**2. Enrich batch scoring with traffic + accessibility + safety data**

Update `score-sites-batch` edge function to call the `score-site` edge function internally (via fetch to the same Supabase functions URL) for each site instead of duplicating scoring logic. This ensures each batch-scored site gets:
- Traffic AADF from DfT count points
- Accessibility counts from NaPTAN nodes
- Safety data from STATS19
- The same master score weighting used in the intelligence panel

However, calling `score-site` + `safety-engine` per site in a 500-site batch would be too slow (each takes ~5-10s). Instead:

**Pragmatic approach**: Keep the current fast batch scorer for grid-only scoring, but add the traffic/accessibility/safety queries directly into `score-sites-batch` using the same direct SQL queries that `score-site` uses (ST_DWithin on geo_points filtered by layer_id). This avoids HTTP overhead per site.

**3. Files to change**

| File | Change |
|------|--------|
| `supabase/functions/score-sites-batch/index.ts` | Add traffic (DfT), accessibility (NaPTAN), and safety (STATS19) spatial queries per site. Include results in scored row output. Compute master_score using the 4-pillar weighting. |
| `src/components/la/ProgrammeDashboard.tsx` | Add "Save All to Portfolio" button. Insert scored sites into `sites` table with full `raw_score_data`. Add traffic/accessibility/safety columns to the results table and CSV export. |
| `src/pages/LaProgramme.tsx` | No changes needed (already passes results to dashboard) |

### Technical Detail

Traffic/accessibility/safety queries in `score-sites-batch` will use the service-role Supabase client to run direct table queries:

```text
-- Traffic (per site, ~2km radius)
SELECT attrs_json->>'all_motor_vehicles' FROM geo_points
WHERE layer_id = <dft_layer_id>
AND ST_DWithin(geom, ST_Point(lng,lat)::geography, 2000)

-- NaPTAN (per site, ~500m radius)  
SELECT name, attrs_json FROM geo_points
WHERE layer_id = <naptan_layer_id>
AND ST_DWithin(geom, ST_Point(lng,lat)::geography, 500)

-- STATS19 (per site, ~200m radius)
SELECT attrs_json FROM geo_points
WHERE layer_id = <stats19_layer_id>
AND ST_DWithin(geom, ST_Point(lng,lat)::geography, 200)
```

The layer IDs are looked up once at function start from `layer_registry` by slug. The master score combines: Traffic 35% + Accessibility 25% + Grid 25% + Safety -10% + Civils -5%.

Portfolio save uses `supabase.from("sites").insert(rows)` with `created_by` set to the authenticated user.

