
Goal: fix the export so PDFs always include the map + visible cable route with clear start/end points.

1) Root-cause fix: normalize connection point formats before drawing lines  
- Problem: the assessment response can return `nearest_points` as GeoJSON Points (and sometimes `capacity_segment` instead of `cable`), while UI code assumes `[lng, lat]` tuples.  
- Result today: invalid line coordinates, screenshot crash (`object is not iterable`), and blank PDF map pages.
- Changes:
  - In `src/components/map/UnifiedIntelligencePanel.tsx` and `src/components/map/SiteCheckPanel.tsx`, add a small parser that accepts:
    - tuple: `[lng, lat]`
    - GeoJSON Point: `{ type: "Point", coordinates: [lng, lat] }`
  - Support both keys for cable endpoint: `nearest_points.cable` and `nearest_points.capacity_segment`.
  - Only emit connection lines when parsed coords are valid.

2) Make screenshot capture robust in MapView  
- In `src/pages/MapView.tsx` (`handlePinScreenshot`):
  - Validate every coordinate before bounds math (no direct destructuring of unknown shapes).
  - Build `allLineCoords` only from valid tuples.
  - Capture two screenshots reliably:
    - `location`: site + all valid endpoints + infra overlays
    - `route`: prioritize cable line bounds (fallback to all lines if needed)
  - Keep temporary endpoint markers (site/POC/feeder) but ensure full `try/finally` cleanup always runs.
  - Restore original map camera after capture so export doesn’t leave the user in a forced zoom state.

3) Ensure export doesn’t silently produce “no map” PDFs  
- In `UnifiedIntelligencePanel` and `SiteCheckPanel` export handlers:
  - If screenshot capture returns both `null`, show an explicit toast and stop PDF generation.
  - If location exists but route is missing, still export and include a warning toast.
- This prevents another confusing “finished export but no map” outcome.

4) Remove current console noise (ref warning) in same pass  
- Verify panel usage in `MapView` has no accidental `ref` prop passed to function components.
- If any wrapper path requires a ref, switch only that component boundary to `forwardRef`; otherwise remove ref usage entirely.

5) Validation (end-to-end)  
- Re-run full flow from postcode/pin → Analyse Site → Export PDF.
- Acceptance criteria:
  - No `object is not iterable` console error.
  - No function-component ref warning.
  - PDF includes “Location & Infrastructure Overview” map page.
  - PDF includes “Route Map” page with visible cable line and clear endpoint markers.
  - BoM cable length (e.g., 42m) is visually represented by the cable segment shown in the route map.

Technical details (implementation scope)
- Files to update:
  - `src/components/map/UnifiedIntelligencePanel.tsx`
  - `src/components/map/SiteCheckPanel.tsx`
  - `src/pages/MapView.tsx`
- No database/backend schema changes required.
