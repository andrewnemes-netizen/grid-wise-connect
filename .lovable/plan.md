

## Add Gas Network Registry & Map Layer Tab

### Overview
Create a parallel Gas Distribution Network (GDN) registry system alongside the existing DNO (electricity) registry, starting with Cadent as the first source. This includes a new admin tab, a new map layer tab, and the Cadent crawler edge function.

### Changes

| # | File | Change |
|---|------|--------|
| 1 | `supabase/functions/cadent-catalog-crawler/index.ts` | Create Opendatasoft v2.1 crawler for `cadentgas.opendatasoft.com`. No API key needed (public). Clone UKPN crawler pattern, set `DNO_KEY = "CADENT"`. Map `geo_shape` fields to `geo_cables`, `geo_point_2d` to `geo_points`. |
| 2 | `supabase/config.toml` | Add `[functions.cadent-catalog-crawler]` with `verify_jwt = false`. |
| 3 | `src/components/admin/GasDatasetRegistry.tsx` | New component — clone of `NpgDatasetRegistry.tsx` but for gas networks. Initial `gdnConfig` map with `CADENT: { label: "Cadent Gas", crawler: "cadent-catalog-crawler", portalUrl: "cadentgas.opendatasoft.com" }`. Same crawl/ingest/auto-link/sync-all UI. Uses same `dno_dataset_registry` table (the `dno` column will store `CADENT`, `NGN`, `SGN`, `WWU` etc). |
| 4 | `src/pages/Admin.tsx` | Add new "Gas Registry" tab (with a `Flame` icon) between "DNO Registry" and "External APIs". Import and render `GasDatasetRegistry`. |
| 5 | `src/components/map/LayerTogglePanel.tsx` | Add a 5th tab called "Gas" (with `Flame` icon) in the tabs grid (change `grid-cols-4` to `grid-cols-5`). Filter `registryLayers` where `dno` matches gas operators (`CADENT`, `NGN`, `SGN`, `WWU`) and render them in the same DNO→Category tree structure as the Network tab. Remove gas operators from the Network tab filter so they don't appear in both. |
| 6 | Migration | Add Cadent matching rules to `auto_create_dno_layers` RPC: `gas.*pipe\|gpi` → "Cadent Gas Pipes" (`geo_cables`, LineString), `network.*zone\|boundary` → "Cadent Network Zones" (`geo_polygons`, Polygon), `pressure` → "Cadent Pressure Data" (`geo_points`, Point). |

### Gas GDN Operators (Future-Ready)
The `gdnConfig` in the Gas Registry will be extensible for:
- **CADENT** — Opendatasoft API (building now)
- **NGN** — Northern Gas Networks (future, pending API verification)
- **SGN** — Scotia Gas Networks (future, login required)
- **WWU** — Wales & West Utilities (future, request-based)

### How It Works
- Gas datasets use the **same `dno_dataset_registry` table** — the `dno` column stores `CADENT`, `NGN`, etc.
- Gas layers use the **same `layer_registry` + `geo_*` storage tables** — they just have `dno = "CADENT"` etc.
- The map layer panel separates gas from electricity by checking the `dno` value against a known gas operator list.
- The admin console has a dedicated "Gas Registry" tab so gas and electricity discovery are managed independently.

### After Implementation
1. Go to **Admin → Gas Registry → Cadent Gas**
2. Click **Discover All Datasets** to crawl the Cadent portal
3. Click **Auto-Link Layers** to create GIS layer entries
4. Click **Sync All Active** to ingest gas pipe data
5. On the map, click the **Gas** tab in the Layers panel to toggle gas layers

