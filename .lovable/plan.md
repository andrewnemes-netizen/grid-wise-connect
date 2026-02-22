

# Add Cable Drawing to Design Mode

## What This Adds
The ability to draw cable routes between equipment or arbitrary points on the map, with cable type selection and automatic distance calculation.

## User Workflow
1. Open Design Mode (already working)
2. Place equipment as before (already working)
3. Select a cable type from a new "Draw Cable" section (e.g. LV Main, LV Service, HV Cable)
4. Click points on the map to draw a cable route (multi-point, like the existing Connect tool)
5. Double-click to finish the cable
6. Cable appears as a coloured line on the map with length shown
7. Cables listed in the panel with type, length, and delete option

## Technical Details

### 1. New database table: `design_cables`

```text
design_cables
  id            uuid PK
  study_id      uuid FK -> studies
  cable_type    text (lv_main, lv_service, hv_cable, pilot_cable)
  label         text
  coordinates   jsonb (array of [lng, lat] arrays)
  length_m      float8
  properties_json jsonb default '{}'
  created_by    uuid
  created_at    timestamptz
```

With RLS policies matching `design_elements`.

### 2. New cable types config

```text
Cable Types:
  lv_main      -> colour: #e74c3c (red),       dash: solid,  label: "LV Main"
  lv_service   -> colour: #3498db (blue),       dash: dashed, label: "LV Service"  
  hv_cable     -> colour: #f39c12 (orange),     dash: solid,  label: "HV Cable"
  pilot_cable  -> colour: #9b59b6 (purple),     dash: dotted, label: "Pilot Cable"
```

### 3. Update `useDesignMode` hook

- Add `drawingCable` state (cable type being drawn, or null)
- Add `cableVertices` state (array of [lng, lat] during drawing)
- Add `cables` state (loaded from DB)
- Add `addCableVertex(lng, lat)` -- appends point during drawing
- Add `finishCable()` -- saves to DB, calculates length using Haversine, renders line on map
- Add `undoCableVertex()` -- removes last point
- Add `removeCable(id)` -- deletes from DB
- Render cables as GeoJSON LineString layers on the map (colour/dash per cable type)
- Load existing cables when study changes

### 4. Update `DesignModePanel` UI

- Add a "Draw Cable" section below equipment palette
- Cable type buttons (same grid style as equipment)
- When a cable type is selected, instructions change to "Click to add cable points, double-click to finish"
- Listed cables section showing type, length (m), and delete button

### 5. Update `MapView` click dispatcher

- When `activeTool === "design"` and a cable type is being drawn:
  - Single click adds a vertex
  - Double-click finishes the cable
- When equipment type is selected, existing behaviour (place point)
- Mutually exclusive: selecting a cable type deselects equipment, and vice versa

### 6. Drawing feedback on map

- While drawing, show a temporary GeoJSON line following the vertices
- Show vertex dots at each click point
- Show running distance in the bottom bar (similar to connect/boundary tools)

### Files Changed
- **New migration**: Create `design_cables` table with RLS
- **`src/hooks/useDesignMode.ts`**: Add cable state, drawing, persistence, and map rendering
- **`src/components/map/DesignModePanel.tsx`**: Add cable type palette and cable list UI
- **`src/pages/MapView.tsx`**: Update click dispatcher for cable drawing + bottom bar controls

