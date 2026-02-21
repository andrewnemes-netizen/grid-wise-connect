

## Add Boundary Drawing Tool to the Map

### What You Get

A new **Boundary** button on the map toolbar (above Pin Drop) that lets you draw a red boundary outline around any area. Click to place points, double-click to close the shape. The boundary stays visible while you use other tools and is included in PDF screenshot exports.

### Changes Overview

**4 files touched** (1 new, 3 modified)

---

### 1. New file: `src/hooks/useBoundaryDraw.ts`

A new hook following the same pattern as `usePolygonDraw`, but with distinct layer IDs and red styling:

- **Source/layer IDs**: `boundary-draw-source`, `boundary-draw-fill`, `boundary-draw-line`, `boundary-draw-points` (no conflict with polygon search)
- **Styling**: Red line (`#dc2626`, 3px, solid), subtle red fill (12% opacity), red vertex circles with white stroke
- **State**: `isDrawing`, `vertices`, `polygon` (closed GeoJSON.Polygon or null)
- **Methods**: `clearBoundary`, `undoPoint`, `finishBoundary`
- Click adds a vertex; double-click closes the polygon (requires 3+ points)
- The boundary persists after drawing completes -- it is NOT cleared when the tool is deactivated, only when explicitly cleared
- Latest boundary replaces any previous one (re-activating the tool clears the old boundary and starts fresh)

### 2. Update: `src/components/map/MapToolbar.tsx`

- Add `"boundary"` to the tool type union
- Add a new tool entry at position 0 (above Pin Drop) using the `SquareDashedBottom` icon from lucide-react with label "Boundary"

### 3. Update: `src/pages/MapView.tsx`

- Add `"boundary"` to the `activeTool` state type
- Import and wire `useBoundaryDraw(map, activeTool === "boundary")`
- Add `"boundary"` to the click dispatcher: route clicks to `boundary.handleBoundaryClick`, double-clicks to `boundary.handleBoundaryDblClick`
- Add `"boundary"` to the crosshair cursor condition
- Add `boundary.clearBoundary()` to `handleClear`
- Add floating drawing controls (Undo / Finish) when boundary tool is active and has vertices, matching the connect tool's control bar pattern
- When deactivating boundary tool (switching to another tool), do NOT clear boundary layers -- they persist

### 4. Update: `src/hooks/useMapScreenshot.ts`

- Accept an optional `boundaryCoords` parameter (`[number, number][] | null`)
- When calculating screenshot bounds:
  - If route coords AND boundary coords exist: fit bounds to both
  - If only route coords: current behavior
  - If only boundary coords: fit to boundary bbox
- Boundary layers are NOT removed during capture -- they render naturally on the canvas
- Screenshot markers are added on top (after boundary layers)

### Technical Details

**Layer ordering**: Boundary layers are added to the map without a `beforeId`, so they sit on top of data layers. The screenshot's temporary start/end markers are added last, ensuring they appear above the boundary.

**Boundary vs Polygon Search**: These are completely separate -- different source IDs, different layer IDs, different hooks. Both can coexist on the map. The polygon search tool uses green dashed lines; the boundary tool uses solid red lines.

**Drawing flow**:
```text
Activate tool -> click (add vertex) -> click (add vertex) -> ... -> double-click (close polygon)
                                                                  -> boundary stays on map
                                                                  -> tool deactivates
```

