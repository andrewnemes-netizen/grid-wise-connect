

## Fix: OSM Road Layers Not Visible in Layer Panel

### Problem
The three Overpass road layers (`osm_major_roads`, `osm_minor_roads`, `osm_footways`) were inserted into `layer_registry` with `dno = 'OSM'`, but:
- The **Network tab** filters them out because `'OSM'` is not a recognized DNO, and selecting a DNO filter hides them
- The **Gas tab** only shows GAS_OPERATORS (CADENT, NGN, SGN, WWU)
- No other tab renders registry layers

The layers exist in the database but have no UI surface.

### Solution: Add a "Roads" tab to the Layer Toggle Panel

Add a 6th tab called "Roads" (with a road icon) that shows all registry layers where `dno = 'OSM'` (i.e., the Overpass layers). This keeps them separate from electricity/gas infrastructure.

### Changes

**File: `src/components/map/LayerTogglePanel.tsx`**

1. Add `import { Route } from "lucide-react"` (road icon)
2. Change `grid-cols-5` → `grid-cols-6` on the TabsList
3. Add a new `TabsTrigger` for `"roads"` tab
4. Build an `osmTree` memo filtering layers where `dno === 'OSM'`, grouped by category
5. Add a `TabsContent` for `"roads"` rendering those layers with the existing `CategoryGroup` component
6. Include OSM road visible count in the tab badge and total visible count

The Overpass layers will show as:
```
Roads tab
  └─ Roads (category)
     ├─ Major Roads (OSM)     [toggle]
     ├─ Minor Roads (OSM)     [toggle]  
     └─ Footways (OSM)        [toggle]
```

Since these are live viewport layers (`source_type = 'overpass'`), the `feature_count` will be 0 — so the `LayerRow` component should treat Overpass layers as non-empty (skip the "No data" badge) since they fetch on-demand rather than from ingested data.

**File: `src/components/map/LayerTogglePanel.tsx` — LayerRow**

Update the `isEmpty` check on line 134:
```typescript
const isEmpty = layer.source_type !== 'overpass' && (!layer.feature_count || layer.feature_count === 0);
```

This ensures Overpass layers show without the dimmed "No data" badge.

