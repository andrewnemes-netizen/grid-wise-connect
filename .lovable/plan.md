

## Fix: Add Map Screenshot to Assessment PDF Export

### Problem
The PDF generator already supports two map images (`locationMapScreenshot` for area overview, `mapScreenshot` for route), but **neither SiteCheckPanel nor UnifiedIntelligencePanel captures or passes them**. That's why your exported PDF has no map — the fields are simply `undefined`.

### What needs to happen

**1. Capture map canvas before PDF generation**

Both panels need access to the MapLibre map instance to call `map.getCanvas().toDataURL()`. The project already has a `useMapScreenshot` hook in `src/hooks/useMapScreenshot.ts`.

- Pass the map ref (or a screenshot callback) into `SiteCheckPanel` and `UnifiedIntelligencePanel` via props
- Before calling `generateAssessmentPdf`, capture the current map view as a base64 PNG
- Pass it as `locationMapScreenshot` (area overview with substations/cables visible)

**2. Generate a route map for POC → site**

For the `mapScreenshot` field (route from POC to feeder pillar location):
- When connection lines exist (from `nearest_points`), temporarily fit the map bounds to show the route
- Capture that view as a second screenshot
- Pass as `mapScreenshot` to the PDF generator

**3. Files to change**

| File | Change |
|------|--------|
| `src/components/map/SiteCheckPanel.tsx` | Add `mapRef` prop, capture screenshots on Export PDF click, pass `locationMapScreenshot` + `mapScreenshot` |
| `src/components/map/UnifiedIntelligencePanel.tsx` | Same — add `mapRef` prop, capture + pass screenshots |
| `src/pages/MapView.tsx` | Pass map ref down to both panels |

**4. Screenshot flow on "Export PDF" click**

```text
1. Capture current view → locationMapScreenshot (area overview)
2. If connection lines exist:
   a. Fit bounds to show POC + site with padding
   b. Wait 800ms for tiles to load
   c. Capture → mapScreenshot (route view)
   d. Restore original bounds
3. Call generateAssessmentPdf({ ...existing, locationMapScreenshot, mapScreenshot })
```

The PDF generator already renders both images with north arrows, scale bars, and legends — no changes needed there.

### No database changes needed

