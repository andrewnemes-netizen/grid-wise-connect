

## Consolidate to Single Map in Assessment PDF

### What changes
Merge the two map pages into **one** map that shows everything: site pin, nearby infrastructure (substations, feeders, NDP), and the cable route with clear start/end markers.

### Why
- The "Route Map" currently duplicates what's already visible in the "Location Overview"
- A single map reduces PDF page count and looks more professional
- The cable route, POC, and feeder endpoints are all within the same geographic area

### Implementation

**File: `src/lib/generateAssessmentPdf.ts`**
- Remove the separate "Route Map" section (~lines 482-540)
- Keep the "Location & Infrastructure Overview" section as the single map page
- Update its title to "Site Location & Cable Route"
- Update the legend to include route-specific items (POC, cable route, feeder endpoint)

**File: `src/pages/MapView.tsx`**
- Simplify `handlePinScreenshot` to capture **one** screenshot that includes all infrastructure + connection lines
- Remove the second "route view" capture pass
- Return `{ location: screenshot, route: null }` (or simplify to single string)

**File: `src/components/map/UnifiedIntelligencePanel.tsx`**
- Pass the single screenshot as `locationMapScreenshot`
- Stop passing `mapScreenshot`

**File: `src/components/map/SiteCheckPanel.tsx`**
- Same change as above

### Result
- One clear map page in the PDF showing site, infrastructure context, and cable route
- Fewer pages, cleaner report
- Faster export (one screenshot instead of two)

### No database changes needed

