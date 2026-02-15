# Gridwise v2 — Implementation Plan

## Overview
Refactor + intelligence layering on existing Gridwise app. No redesign, no deletions.

## Decisions (confirmed)
- **Hierarchy**: DNO-level filtering using existing licence area polygons. Spatial hierarchy later.
- **EV Deployment**: v2-lite proxy-based panel. Design for future CSV upload.
- **Scoring weights**: connection 0.55, civils 0.35, deployment 0.10
- **Scoring**: Hybrid — edge function returns raw metrics, client calculates viability_index
- **Vector tiling**: Not needed. bbox GeoJSON + caching + min_zoom + clustering + feature caps.
- **Refetch threshold**: bbox overlap <70% OR moved >30-35% bbox dimension. Debounce 300ms.
- **Large point layers**: enforce min_zoom + clustering (e.g. SSEN)
- **min_zoom crossing**: auto-fetch when zoom crosses layer.min_zoom upward; hide when below
- **DNO filter**: sidebar filtering AND spatial PostGIS ST_Intersects clip via DNO polygon
- **Feature caps by geometry**: Points 1000, Lines 2000, Polygons 1000

---

## Phase 1: MapView Decomposition

### Goal
Reduce MapView.tsx from 668 lines to ~100 lines (orchestrator only).

### New hooks
1. **`src/hooks/useLayerManager.ts`**
   - Owns: visibility state, layer loading, cache, click handlers, moveend refresh
   - Exports: `visibility`, `handleLayerToggle`, `loadingLayers`, `selectedFeature`, `selectedLayerLabel`
   - Implements smart refetch (70% overlap threshold, 30-35% dimension shift)
   - Stores last-fetched bbox per layer
   - Debounce: 300ms on moveend
   - min_zoom threshold crossing: fetch when zoom >= layer.min_zoom (was below); hide when below
   - Feature caps: Points 1000, Lines 2000, Polygons 1000

2. **`src/hooks/useConnectTool.ts`**
   - Owns: connectSource, connectWaypoints, connectEndpoints, waypoint markers, connect line
   - Exports: state + handlers (handleFinishRoute, handleUndoWaypoint, clearConnect)
   - Deduplicates the finish-route logic (currently duplicated in dblclick + button)

3. **`src/hooks/usePinDrop.ts`**
   - Owns: pinLocation, showSiteCheck, pin marker
   - Exports: state + handler

4. **`src/hooks/useMapScreenshot.ts`**
   - Owns: screenshot capture logic with temporary GeoJSON markers
   - Exports: `captureScreenshot(endpoints) => Promise<string | null>`

### MapView.tsx becomes
- Refs: containerRef
- Hooks: useMap, useLayerManager, useConnectTool, usePinDrop, useMapScreenshot, usePolygonDraw, useMeasure
- Map click dispatcher: routes clicks to connect tool or pin drop based on activeTool
- JSX: panels + toolbar (unchanged)

---

## Phase 2: Smart Data Fetching

### Changes to useLayerManager
- `lastBboxMap: Map<string, [number, number, number, number]>` — per-layer last-fetched bbox
- On moveend:
  1. Calculate new bbox
  2. For each visible layer, compute overlap with lastBbox
  3. Skip refetch if overlap >= 70%
  4. Refetch only layers where overlap < 70% OR bbox dimension shifted > 30%
- Cache is NOT cleared on refetch — new data replaces old
- Manual "Refresh Layers" button in LayerTogglePanel for force-reload

### min_zoom enforcement
- When adding a layer to map, check `layer.min_zoom`
- Set MapLibre layer `minzoom` property accordingly
- Large point layers (feature_count > 5000) get clustering enabled automatically

### Clustering
- For circle layers with feature_count > 5000:
  - Use MapLibre cluster source: `cluster: true, clusterMaxZoom: 14, clusterRadius: 50`
  - Add cluster count layer
  - Individual points visible at zoom > clusterMaxZoom

---

## Phase 3: DNO Hierarchy Filter

### UI
- Add DNO dropdown filter above layer tree in LayerTogglePanel
- Options: "All DNOs" + list of distinct DNOs from layer_registry
- When DNO selected, only show layers matching that DNO
- Persist selection in component state

### Data
- No schema changes needed — `layer_registry.dno` already exists
- DNO licence area polygons already uploaded as a layer

---

## Phase 4: Intelligence Panels

### 4a. Connection Intelligence Panel (enhanced SiteCheckPanel)
- Triggered by pin drop or postcode search
- Shows:
  - Nearest substation (name, distance, headroom_kw, utilisation_pct)
  - Feeder utilisation band
  - Recommended connection voltage (LV/HV/EHV based on proposed_kw)
  - Estimated connection cost (using existing connectionCosts.ts)
- Data source: enhanced `score-site` edge function response

### 4b. EV Deployment Panel (v2-lite)
- Proxy-based: uses existing data to estimate deployment viability
- Inputs: location, proposed_kw
- Shows:
  - Grid capacity indicator (from substation headroom)
  - Deployment class: "Fast Deploy" / "Needs Reinforcement" / "Complex"
  - Placeholder for future: traffic density, chargepoint density
- No new tables — derives from existing score-site response

### 4c. ICP Planning Panel
- Shows:
  - POC options (nearest substations ranked by headroom)
  - Reinforcement probability (based on utilisation_pct + proposed_kw vs headroom)
  - Cable route feasibility (distance bands + highway width data if available)
  - Budget estimate (existing cost engine)
- Data source: enhanced score-site + client-side calculation

---

## Phase 5: Scoring Engine

### Edge function enhancement (`score-site`)
Add to response payload:
```json
{
  "raw_metrics": {
    "connection": {
      "nearest_substation_distance_m": 450,
      "headroom_kw": 1200,
      "utilisation_pct": 65,
      "feeder_congestion": "low"
    },
    "civils": {
      "highway_width_m": 7.2,
      "constraint_count": 1,
      "excavation_type": "footway"
    },
    "deployment": {
      "capacity_vs_demand_ratio": 1.8,
      "distance_band": "close"
    }
  }
}
```

### Client-side scoring (`src/lib/scoringEngine.ts`)
```typescript
interface RawMetrics { connection: {...}, civils: {...}, deployment: {...} }
interface ScoringWeights { connection: number, civils: number, deployment: number }

const V2_WEIGHTS: ScoringWeights = { connection: 0.55, civils: 0.35, deployment: 0.10 }

function calculateViabilityIndex(metrics: RawMetrics, weights: ScoringWeights): number
function getViabilityBand(index: number): "GREEN" | "AMBER" | "RED"
```

Each sub-score normalized to 0-100:
- connection_score: f(headroom, utilisation, distance, congestion)
- civils_score: f(highway_width, constraints, excavation_type)
- deployment_score: f(capacity_ratio, distance_band)

---

## Phase 6: Performance

- Smart bbox refetch (Phase 2)
- min_zoom on layers (Phase 2)
- Clustering for large point layers (Phase 2)
- Feature cap: edge function limits to 2000 features per request (already has _limit param)
- Debounce moveend: 600ms

---

## Build Order

1. Phase 1 — MapView decomposition (hooks extraction)
2. Phase 2 — Smart data fetching (in useLayerManager)
3. Phase 3 — DNO filter (UI only, no schema)
4. Phase 5 — Scoring engine (edge function + client lib)
5. Phase 4 — Intelligence panels (using scoring engine)
6. Phase 6 — Performance tuning (clustering, feature caps)

Each phase is independently testable. No phase depends on a later phase.
