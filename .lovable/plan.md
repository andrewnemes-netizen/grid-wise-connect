

## NPG Dataset Layer Strategy

The build error shown is an infrastructure issue (native SWC binding), not related to code changes. It typically resolves on retry.

Here is the recommended grouping of NPG datasets into GIS layers, based on what you already have and what should be combined.

---

### Recommended Layer Groupings

```text
LAYER NAME                          | DATASETS TO COMBINE                                    | STORAGE TABLE    | GEOMETRY
────────────────────────────────────┼────────────────────────────────────────────────────────┼──────────────────┼──────────
132kV Network                       | 132kV Circuit Live Ops + NPG EHV Feeders (already)     | geo_feeders      | LineString
  → Merge operational data as attrs   into existing EHV Feeders layer (39k features)

66kV Network                        | 66kV Circuit Live Ops                                  | geo_feeders      | LineString
  → Populate existing empty 66kV layer with live ops data

33kV Network                        | 33kV Circuit Live Ops                                  | geo_feeders      | LineString
  → Populate existing empty 33kV layer with live ops data

HV Overhead Feeders                 | npg_hv_oh_feeders (59k)                                | geo_feeders      | LineString
  → New layer, overhead HV lines

LV Overhead Feeders                 | lv_oh_feeders (19k)                                    | geo_feeders      | LineString
  → Populate existing empty LV OH layer

EHV & HV Supports                   | ehv-and-hv-supports-location (265k)                    | geo_points       | Point
  → Pole/tower locations, large dataset

Substation Sites                    | substation_sites_list (60k)                             | geo_substations  | Point
  → All substation locations with metadata

Site Utilisation (Current)          | npg-site-utilisation (28k)                              | geo_substations  | Point
  → Already have HV Substations Utilisation (27k), may be same data — verify before ingesting

Site Utilisation (Forecast)         | npg-site-utilisation-forecasted (29k)                   | geo_substations  | Point
  → Future headroom predictions — new layer

Distribution Sub Service Areas      | distribution-substation-service-areas (57k)             | geo_polygons     | Polygon
  → Service area boundaries per distribution sub

EHV Sub Combined Service Areas      | substation_combined_service_areas (683)                 | geo_polygons     | Polygon
  → Already have Heat Map Substation Areas (683) — likely same, verify

Embedded Capacity Register          | ECR <1MW (1.7k) + ECR ≥1MW (950)                       | geo_substations  | Point
  → Already have National ECR (17k) — combine or keep NPG-specific

NDP Demand Headroom                 | npg_ndp_demand_headroom (3.1k)                         | geo_substations  | Point
  → Already ingested (954 features), refresh

NDP Generation Headroom             | npg_ndp_generation_headroom (3.1k)                     | geo_substations  | Point
  → New layer, generation-side headroom

NDP Planned Interventions           | npg-network-development-report-planned-interventions   | geo_constraints  | Polygon
  → Planned reinforcement works (279)

Flexibility Services                | SLC31E Procurement (831) + Dispatch by EHV Zone (1.1k) | geo_polygons     | Polygon
  → Combine into single "Flexibility Zones" layer

DFES Forecasts                      | NPG DFES Primary (77k)                                 | geo_substations  | Point
  → Future scenario planning data per primary

Carbon Intensity by GSP             | 3_day_gsp_carbon_intensity (3.2k)                      | geo_polygons     | Polygon
  → GSP-level carbon data with geometry

LCT by Postal Sector               | lct-datasets-ps-upload (1.2k)                          | geo_points       | Point
  → Low carbon technology penetration

Smart Meter Penetration             | smartmap (34)                                          | geo_polygons     | Polygon
  → Smart meter rollout coverage

IDNO Zones                          | idno_regions (2k)                                      | geo_polygons     | Polygon
  → Areas served by independent operators
```

### Priority Order (highest engineering value first)

1. **132kV + 66kV + 33kV Live Ops** — merge operational data (loading, fault level) into existing feeder layers as `attrs_json`. This gives real-time network context.
2. **Site Utilisation Forecast** — new layer showing future headroom, critical for connection planning.
3. **HV OH Feeders + EHV/HV Supports** — complete the overhead network picture (currently only underground visible).
4. **NDP Planned Interventions + Generation Headroom** — reinforcement pipeline visibility.
5. **Distribution Sub Service Areas** — 57k polygons showing which sub feeds which area.
6. **Flexibility Zones** — where DNO is procuring flex services (affects connection offers).
7. **DFES Primary Forecasts** — future demand/generation scenarios.

### Implementation Approach

For each group above:
1. Create a layer_registry entry (or use existing one) with correct `geometry_type` and `storage_table`
2. Update the DNO_REGISTRY in `dno-open-data-ingest` to add field mappings for the new dataset
3. For "merge" cases (e.g. 132kV ops into EHV feeders), the operational data joins via `attrs_json` on the existing features rather than creating duplicates
4. For tabular-only datasets (no geometry), they attach as enrichment to the nearest spatial feature rather than standalone layers

### Datasets to Skip (no GIS value)

- Data Roadmap, Document Library, Glossary, Portal Downloads, LTDS Documents, Feature Page Dataset, ICP Briefings — pure metadata/docs
- Generation Mix, Grid Supply Point Metering — time-series only, no spatial component
- Research Use Cases, Third Party Data Sources — reference tables

