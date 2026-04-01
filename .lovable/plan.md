

## Build: Nearest Compatible LV Main Selection

### What this does
When a feeder pillar location is set, instead of connecting to the nearest substation, the system finds the **nearest compatible LV underground main cable** from the existing `geo_cables` dataset, scores it, snaps to it, and routes a trench.

### Architecture

```text
Feeder Pillar point
       │
       ▼
PostGIS RPC: find_nearest_compatible_lv_main
  1. Buffer search geo_cables (25m → 50m → 100m)
  2. Parse conducting_section_type via SQL regex
  3. Join to lv_capacity_lookup for compatibility
  4. Score: compatible +1000, main-like +250, capacity bonus, distance penalty
  5. Return best candidate + snap point
       │
       ▼
Highway corridor route: pillar → snap point
```

### Why no new spatial table
The 580k LV cable records already live in `geo_cables` with geometry and `attrs_json->>'conducting_section_type'`. Duplicating into a separate `lv_cable_assets` table wastes storage and creates sync issues. The RPC will query `geo_cables` directly, parsing cable type in SQL.

### Database changes

**1. New table: `lv_capacity_lookup`** (small lookup, ~20 rows)
Columns: `id`, `family` (copper_pilc/aluminium_pilc/waveform/hybrid), `size_value`, `size_unit`, `direct_kva`, `ducted_kva`, `green_compatible`, `ev_compatible_55kva_80a`

Seeded with the exact values from the workbook (all copper PILC 0.0225-0.3, aluminium PILC 0.15/0.3, waveform 70-300, hybrid 70-300).

**2. New RPC: `find_nearest_compatible_lv_main(p_lon, p_lat, p_search_m)`**
- Queries `geo_cables` within radius using `ST_DWithin` on SRID 27700
- Filters to LV cables only (layer_id match or `attrs_json` check)
- Parses `conducting_section_type` via SQL regex to extract: size_value, size_unit, material, construction_type, core_count, family, is_unknown, is_service_like, is_main_like
- Joins to `lv_capacity_lookup` on family + size
- Applies scoring formula: compatible(+1000), main-like(+250), high-capacity(+150), medium-capacity(+75), service-like(-500), unknown(-1000), distance(-2x meters)
- Returns top result with: asset_id, conducting_section_type, feeder_name, source_site_name, distance_m, score, snap_point (ST_ClosestPoint), cable_geom, direct_kva, ducted_kva, compatibility flag

**3. RLS**: Authenticated SELECT on `lv_capacity_lookup`. RPC uses `SECURITY DEFINER` for performance.

### Frontend changes

**New file: `src/lib/gridwise/lvCableParser.ts`**
- TypeScript `parseConductingSectionType()` function (for UI display/fallback)
- `scoreCableCandidate()` function
- `isCompatibleFor55kva()` function
- Types: `ParsedCable`, `LvCableMatch`

**File: `src/lib/gridwise/assetEngine.ts`**
- Add `findNearestLvMain(lng, lat)` that calls the RPC with staged radii (25 → 50 → 100)
- Populate `AssetSearchResult.nearest_cable_segment` with the result
- Add parsed cable metadata to the NearestAsset fields

**File: `src/lib/gridwise/types.ts`**
- Add `LvCableMatch` interface (parsed cable + compatibility + score)
- Extend `NearestAsset` with optional `cable_type`, `feeder_name`, `source_site_name`, `snap_point`, `direct_kva`, `ducted_kva`

**File: `src/lib/gridwise/feasibilityEngine.ts`**
- When `nearest_cable_segment` exists and voltage is LV, use it as primary POC instead of nearest substation
- Pass cable capacity into EV Hub context

**File: `src/components/map/ConnectAssessmentPanel.tsx`**
- Display LV cable match details in side panel: cable type, feeder name, source site, capacity (direct/ducted kVA), compatibility status, distance, score, selection reason
- If no compatible LV main found: show "No compatible LV underground main found within search radius"
- Map visualization: highlight selected cable, show snap point marker, show trench route

### Files to change
| File | Change |
|------|--------|
| New migration | `lv_capacity_lookup` table + seed data + `find_nearest_compatible_lv_main` RPC |
| New: `src/lib/gridwise/lvCableParser.ts` | Parser, scorer, compatibility checker |
| `src/lib/gridwise/types.ts` | Add `LvCableMatch`, extend `NearestAsset` |
| `src/lib/gridwise/assetEngine.ts` | Add staged LV main search, populate `nearest_cable_segment` |
| `src/lib/gridwise/feasibilityEngine.ts` | Use cable as primary POC for LV |
| `src/components/map/ConnectAssessmentPanel.tsx` | Show cable selection details + map highlights |

### No separate ingestion needed
The data is already in `geo_cables`. The RPC parses `attrs_json->>'conducting_section_type'` at query time.

