

## Fix & Complete ENWL + SPEN Ingestion Pipeline

### Current State

| DNO | Layers | With Data | Empty | Datasets Linked | Issues |
|-----|--------|-----------|-------|-----------------|--------|
| **ENWL** | 21 | 4 | 17 | 85 | 6 sync errors (timeouts + 520s), 17 layers never ingested |
| **SPEN** | 4 | 3 | 1 | **0** | Auto-link never ran; "SPEN Line asset" has wrong config (Geometry type → geo_substations for line data) |

### What Needs to Happen

**1. Fix SPEN auto_create_dno_layers rules**

The SPEN rules in the RPC created layers before datasets were linked (0 linked datasets). The existing 4 SPEN layers appear to have been created manually or from the old ingestion engine. The RPC needs to actually match SPEN dataset titles to layers. Looking at the discovered SPEN geospatial datasets:

- GIS Line Assets (SPD/SPT + SPM) — 6M rows total, should map to `geo_cables` with LineString override
- GIS Point Assets (SPD/SPT + SPM) — 683k rows, should map to `geo_substations` with Point override  
- Secondary Substation Polygons — 90k, `geo_polygons`
- LV Monitoring — 45k points, `geo_points`
- Smart Meter by Transformer — 35k points, `geo_points`
- Smart Meter by Census Area — 16k polygons, `geo_polygons`
- DFES Substation Polygons (SPD + SPM) — ~800 polygons, `geo_polygons`
- Primary Substation Polygons (SPD + SPM + NDP variants) — ~1500 polygons, `geo_polygons`
- Flexibility Assets + Deferred Reinforcement — ~400 polygons, `geo_polygons`
- DNOA Polygons — 49 polygons, `geo_polygons`
- Aggregated Smart Meter (Wirral + Ayrshire) — ~1500 points, `geo_points`

The current SPEN rules may be too narrow or pattern-mismatched. I'll update the RPC with corrected SPEN rules that properly match these dataset titles.

**2. Fix "SPEN Line asset" layer config**

Currently has `geometry_type: Geometry` and `storage_table: geo_substations` — should be `geometry_type: LineString` and `storage_table: geo_cables`.

**3. Trigger ingestion for all empty ENWL layers**

17 ENWL layers have linked datasets but 0 features. These need their datasets activated and synced. The ingestion is done via the admin UI ("Sync All Active") but requires datasets to be marked `active = true` first.

**4. Handle timeout/520 errors**

Some ENWL datasets (LV Overhead Conductors, DFES LV Headroom/Peak Demand, DSO Primary Polygons) failed with timeouts or 520 errors. These are likely large datasets hitting the 150s edge function timeout. The fix is to ensure the ingest function handles these gracefully.

### Implementation Steps

| Step | File | Change |
|------|------|--------|
| 1 | New migration | Update `auto_create_dno_layers` RPC with corrected SPEN matching rules covering all geospatial datasets above |
| 2 | New migration | Fix existing "SPEN Line asset" layer: update `storage_table` to `geo_cables`, `geometry_type` to `LineString` |
| 3 | New migration | Activate (set `active = true`) all ENWL datasets that are linked to a layer but not yet active, so "Sync All" will pick them up |
| 4 | `src/components/admin/NpgDatasetRegistry.tsx` | After auto-link, auto-activate all newly linked datasets so they're ready for Sync All |

After implementation, the workflow is:
1. Go to DNO Registry → select SPEN → click "Auto-Create & Link Layers"
2. Click "Sync All Active" to start ingestion
3. Switch to ENWL → click "Sync All Active" for remaining empty layers
4. Check Layers panel on the map — data should appear

### Technical Notes
- SPEN GIS Line/Point Assets are very large (3M-6M rows). These will hit the 10k Opendatasoft API limit unless geographic partitioning is applied. Initial ingestion will capture the first 10k records per dataset — this is a known limitation documented in the architecture.
- The 520 errors on ENWL DSO Primary Polygons suggest the backend was overloaded during batch insert; sequential re-sync should resolve this.

