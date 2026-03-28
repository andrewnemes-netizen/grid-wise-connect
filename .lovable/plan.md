

## NPG Layers End-to-End Test — Results

### Status: PASS — Everything works correctly

The full data pipeline has been verified at every stage:

### Database Audit Results

| Layer | Storage Table | Actual Rows | Geometry SRID | Enabled |
|-------|--------------|-------------|---------------|---------|
| HV Substations (Utilisation) | geo_substations | 27,402 | 4326 ✅ | ✅ |
| EHV Feeders | geo_feeders | 47,100 | 4326 ✅ | ✅ |
| HV Underground Cable | geo_cables | 262,589 | 4326 ✅ | ✅ |
| HV Underground Cables (API) | geo_cables | 10,000 | — | ✅ |
| 132kV Circuit Live Data | geo_cables | 47,100 | — | ✅ |
| EHV & HV Supports | geo_points | 447,000 | — | ✅ |
| LV Support | geo_points | 74,500 | — | ✅ |
| Embedded Capacity Register | geo_substations | 8,993 | — | ✅ |
| Substation Map Data | geo_substations | 2,680 | — | ✅ |
| NPg Thermal Demand Headroom | geo_substations | 954 | — | ✅ |
| Carbon Intensity by GSP | geo_polygons | 3,556 | — | ✅ |
| Heat Map Data - Sub Areas | geo_polygons | 1,366 | — | ✅ |
| Flexibility Zones | geo_polygons | 3,129 | — | ✅ |
| LCT by Postal Sector | geo_polygons | 1,215 | — | ✅ |
| Distribution Sub Service Areas | geo_polygons | 683 | — | ✅ |
| NDP Planned Interventions | geo_constraints | 265 | — | ✅ |

### Pipeline Checks

- **RPC `get_geo_layer_geojson`**: Works — tested bbox query returning 5,000 features in viewport ✅
- **RLS policies**: All spatial tables have `SELECT` for authenticated users ✅
- **`getRenderType()`**: Handles Point→circle, LineString/MultiLineString→line, Polygon→fill ✅
- **`fetchLayerGeoJSON()`**: Correctly resolves by UUID or slug, calls RPC ✅
- **Layer Toggle Panel**: Fetches enabled layers, groups by DNO/category ✅
- **`selectedDno` default**: `null` (shows all DNOs) ✅

### No code changes needed

The layers are working. To see them on the map, ensure:

1. **Navigate to NPG territory** — northern England (Newcastle, Leeds, Hull area)
2. **Zoom to level 8+** — most layers have `min_zoom: 8`
3. **Toggle layers ON** in the Layer Toggle Panel (right side)
4. **DNO filter** can be set to "NPG" or left on "All"

### Layers with zero data (expected)

These are registered but have no ingested data yet — they need a sync from the NPG API:
- DFES Primary Forecasts, NDP Generation Headroom, HV Overhead Feeders, IDNO Zones, Substation Sites List, Primary Substation Points

These can be populated by running "Sync All Active" from Admin → NPG Dataset Registry.

