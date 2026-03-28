

## Fix Traffic + Accessibility Pillar Data Gaps

### Problem

The site analysis runs end-to-end but two of four scoring pillars return zero data:
- **Traffic**: 0 AADF despite 46.3k DfT count points in the database
- **Accessibility**: 0 bus/0 rail despite 17k NaPTAN records

This causes strong grid sites (80/100) to receive an AVOID verdict (29/100).

### Root Cause Investigation Needed

**Traffic (0 AADF):** The `score-site` edge function and the `score_site_from_lnglat` database function likely don't query the `geo_points` table for DfT traffic data. The scoring was built before DfT data was ingested. The traffic score in the Unified Intelligence Panel may be reading from a field that was never populated.

**Accessibility (0 bus/rail):** The safety engine queries NaPTAN from `geo_points`, but only ~17k of ~300k eligible records were ingested (the chunked ingestion may not have been triggered). Leeds records likely weren't reached.

### Plan

**1. Wire traffic AADF into the scoring pipeline**

In `supabase/functions/score-site/index.ts` (or the `score_site_from_lnglat` DB function):
- Add a spatial query against `geo_points` filtered by the DfT traffic layer ID
- Find count points within 500m of the site
- Extract the `all_motor_vehicles` property and return the max AADF value
- Return this as `traffic_aadf` in the score-site response

In `src/components/map/UnifiedIntelligencePanel.tsx`:
- Read `traffic_aadf` from the score result and display it in the Traffic pillar
- Use it to calculate a traffic demand score (e.g., >10k AADF = HIGH, 5-10k = MEDIUM, <5k = LOW)

**2. Wire accessibility (NaPTAN) into the scoring pipeline**

In `supabase/functions/score-site/index.ts`:
- Add a spatial query against `geo_points` filtered by the NaPTAN layer ID
- Count bus stops within 250m and rail stations within 500m
- Return as `nearby_bus_stops` and `nearby_rail_stations`

In `src/components/map/UnifiedIntelligencePanel.tsx`:
- Read these counts and display them in the Accessibility pillar
- Score using the existing formula (bus count + rail×3 multiplier)

**3. Ensure NaPTAN data covers Leeds**

The chunked ingestion needs to be run from Admin → API Sources. If the data only covers southern England, the user needs to trigger additional sync chunks. No code change needed — just a note to run it.

### Files to Change

- `supabase/functions/score-site/index.ts` — Add geo_points queries for DfT traffic + NaPTAN within radius
- `src/components/map/UnifiedIntelligencePanel.tsx` — Read and display traffic AADF + accessibility counts from score-site response

### Technical Detail

The `geo_points` table has a `geom` geography column with a spatial index. Queries use `ST_DWithin(geom, ST_Point(lng, lat)::geography, radius_m)` filtered by `layer_id` matching the DfT or NaPTAN layer registry entry. The layer IDs are looked up from `layer_registry` by slug (`dft_traffic_count_points`, `naptan_transport_nodes`).

