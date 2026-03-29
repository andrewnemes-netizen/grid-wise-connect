

## Fix: Map Screenshots Show Route, POC & Feeder in PDF

### Problem
The current `handlePinScreenshot` in `MapView.tsx`:
1. Fits bounds to a fixed 300m buffer around the pin — connection lines to substations are outside this view
2. Only captures one screenshot (`locationMapScreenshot`) — never captures a second `mapScreenshot` for the route view
3. Does not add POC/feeder endpoint markers as GeoJSON circles (DOM markers don't render on canvas)

The PDF generator already supports both images and renders them with north arrows and scale bars — it just never receives the data.

### Solution

**File: `src/pages/MapView.tsx`** — Rewrite `handlePinScreenshot` to return both screenshots

The function should:

1. **Location overview screenshot** — expand bounds to include all connection line endpoints (primary substation, feeder, cable POC) plus the pin, so the full infrastructure context is visible. Add temporary GeoJSON circle markers at each endpoint (blue for substations, green for POC) so they appear on canvas.

2. **Route screenshot** — fit bounds tightly to just the connection lines (POC → site), capture a second image focused on the route.

3. Return both as an object `{ location: string, route: string }`.

**File: `src/components/map/UnifiedIntelligencePanel.tsx`** — Update the `onCaptureMapScreenshot` type and export click handler

- Change prop type from `() => Promise<string | null>` to `() => Promise<{ location: string | null; route: string | null }>`
- Pass `location` as `locationMapScreenshot` and `route` as `mapScreenshot` to `generateAssessmentPdf`

**File: `src/components/map/SiteCheckPanel.tsx`** — Same prop type change and dual-screenshot handling

### Key logic for bounds expansion

```text
// Collect all points: pin + connection line endpoints
const allPoints = [[pin.lng, pin.lat]];
connectionLineSources.forEach(src => {
  // read coordinates from existing map sources "line-primary", "line-feeder", "line-cable"
  allPoints.push(first coord, last coord);
});

// Fit bounds to all points with padding
// Capture → locationMapScreenshot

// Then fit bounds to just connection lines (tighter)
// Capture → mapScreenshot (route view)
```

### Files to change
| File | Change |
|------|--------|
| `src/pages/MapView.tsx` | Expand `handlePinScreenshot` to read connection line sources from map, fit bounds to include them, add endpoint markers as GeoJSON, capture two screenshots |
| `src/components/map/UnifiedIntelligencePanel.tsx` | Update prop type, pass both screenshots to PDF generator |
| `src/components/map/SiteCheckPanel.tsx` | Same prop type update, pass both screenshots |

### No database changes needed

