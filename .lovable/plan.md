

## Auto-Create & Link DNO Layers — Final Implementation Plan

### Confirmed: `slug` is globally unique on `layer_registry`
`ON CONFLICT (slug)` is safe — no need for a composite `(slug, dno)` conflict target.

### What we're building

1. **Database migration** — a `SECURITY DEFINER` RPC `auto_create_dno_layers(p_dno text, p_force boolean default false)` containing priority-ordered matching rules as a JSON array inside the function body. ENWL rules seeded first; adding another DNO later means adding an `ELSIF` block.

2. **Admin UI button** — "Auto-Create & Link Layers" in `NpgDatasetRegistry.tsx` that calls the RPC and shows a summary toast.

### Migration: RPC function

The function will:
1. Select all geospatial datasets from `dno_dataset_registry` for the given DNO (filtered to `linked_layer_id IS NULL` unless `p_force = true`)
2. Iterate a priority-ordered rules array where each rule has: `match_patterns` (ILIKE on `dataset_id`), `exclude_patterns`, and target layer config
3. For each rule with matches: `INSERT INTO layer_registry ... ON CONFLICT (slug) DO UPDATE SET updated_at = now()` — returns the layer `id`
4. Update matched datasets: `SET linked_layer_id = <id>, geometry_type = COALESCE(override, geometry_type), storage_table = COALESCE(override, storage_table)`
5. Return JSON: `{layers_created, layers_reused, datasets_linked, datasets_skipped, unmatched}`

**Tight matching strategy** (addressing ChatGPT's concern):
- `%boundary%` is NOT used as a broad pattern. Service area datasets are matched with specific patterns: `%control-area%`, `%control-boundary%`, `%general-boundary%`, `%idno-polygon%`
- `%overhead%` is combined with `%conductor%` OR voltage-specific prefixes like `%11kv-overhead%`, `%33kv-overhead%` to avoid false positives
- Exclusion patterns prevent cross-contamination (e.g. `dfes-%` rule excludes `%sites%` which belong to substations)
- Unmatched datasets are returned for manual review, not silently dropped

**16 ENWL layers** as previously agreed (substations, ECR, capacity heatmap, HV 11kV, HV 6.6kV, distribution TX, overhead conductors, NDP headroom, DFES forecasts, connection queue, service areas, flexibility, EV registrations, LCT data, environmental constraints, biodiversity).

**Geometry overrides**: Overhead conductor datasets forced to `LineString` regardless of crawler detection.

**Storage tables**: Using existing tables only — `geo_substations` for point-based capacity/forecast data (consistent with NPG), `geo_cables` for linework, `geo_polygons` for general polygons, `geo_constraints` for environmental constraints, `geo_points` for non-substation point data like LCT.

### UI Changes

In `NpgDatasetRegistry.tsx`:
- Add "Auto-Create & Link Layers" button next to "Discover All Datasets"
- Shows loading state during RPC call
- Success toast with counts (layers created/reused, datasets linked, unmatched count)
- If unmatched > 0, show a warning with the list of unmatched dataset titles

### Files to change

| File | Change |
|------|--------|
| New migration | `auto_create_dno_layers` RPC function with ENWL rules |
| `src/components/admin/NpgDatasetRegistry.tsx` | Add auto-link button, call RPC, display summary |

