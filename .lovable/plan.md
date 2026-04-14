

# Fix: Restore Manual Route Drawing in Assess Tool

## Problem
After the merger, the Assess tool's click handler automatically decides between "pin drop" and "route draw" based on whether the first click hits a network asset feature. Users cannot explicitly select POC → feeder pillar because:
1. Clicking empty map immediately triggers pin-drop mode and deactivates the tool
2. There's no explicit "Draw Route" sub-mode toggle
3. The old Connect tool had a dedicated route-drawing workflow that's been lost

## Solution
Add an explicit **mode toggle** inside the AssessmentPanel and update the MapView click handler to respect it.

### Step 1: Add mode state to AssessmentPanel
Add a "Route Draw" toggle button at the top of AssessmentPanel that the user can activate before clicking the map. When active, ALL clicks go through the connect tool flow (POC selection → waypoints → feeder pillar).

```
Two modes:
  [📍 Pin Drop]  [🔌 Draw Route]
```

- **Pin Drop** (default): Click map → auto pipeline at that location
- **Draw Route**: Click asset (POC) → click waypoints → double-click/finish at feeder pillar location → pipeline runs with drawn route injected

### Step 2: Update MapView click handler
Pass a `routeDrawActive` flag from AssessmentPanel up to MapView. When route-draw mode is active:
- First click on a `layer-*` feature = select POC source (existing behavior)
- First click on empty space = still select POC at that coordinate (don't abort to pin-drop)
- Subsequent clicks = waypoints
- Double-click or Finish button = set destination and open results

This means the click handler at line 176-195 changes:
- If `routeDrawActive` is true → always forward to `connect.handleConnectClick(e)`, never fall through to pin-drop
- If `routeDrawActive` is false → set `assessLocation` as pin-drop (current empty-space behavior)

### Step 3: Allow source selection on empty space
Update `useConnectTool.ts` so that if no `layer-*` feature is found, it still creates a source marker at the clicked location (with a generic "Custom POC" label). This lets users place a POC anywhere, not just on rendered assets.

### Files Changed

| File | Change |
|------|--------|
| `src/components/map/AssessmentPanel.tsx` | Add mode toggle (Pin Drop / Draw Route), expose `routeDrawActive` via callback prop |
| `src/pages/MapView.tsx` | Read `routeDrawActive` flag, update click handler logic at lines 176-195 |
| `src/hooks/useConnectTool.ts` | Allow source selection on empty space (fallback to clicked coordinates) |

### User Flow After Fix
1. Click **Assess** in toolbar
2. Panel opens with **[Pin Drop] [Draw Route]** toggle
3. Select **Draw Route**
4. Click on POC asset (or any map location) → blue source marker placed
5. Click waypoints along the route
6. Click **Finish** or double-click → red destination marker placed
7. Panel populates with route distance, runs full Gridwise pipeline with drawn route
8. Or select **Pin Drop** → click anywhere → auto pipeline runs at that location

