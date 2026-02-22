

## Update PDF Map Key to Match Actual Route Map Symbols

The current map key shows generic network layer types (HV Underground Cables, EHV Feeders, etc.) that don't correspond to what's actually visible on the route map screenshot. The user needs the key to explain the three main symbols they can see:

1. **Blue circle** -- Point of Connection (the source/existing network asset)
2. **Red circle** -- New Supply Point (the destination/customer connection)
3. **Green dashed line** -- Proposed Cable Route

### Changes

**File: `src/lib/generateAssessmentPdf.ts`** (lines 225-243)

Replace the current `networkLegend` array with a new "Route Map Symbols" section that matches the actual markers rendered on the screenshot:

- **Blue filled circle** (`#3498db`) labelled "Point of Connection (Source)"
- **Red filled circle** (`#e74c3c`) labelled "New Supply Point"
- **Green dashed line** (`#2ecc71`) labelled "Proposed Cable Route"

Keep the existing network layers (HV Underground Cables, EHV Feeders, etc.) as a separate sub-section below, since those red lines from the network data are also visible on the map.

The right column (Design Equipment) stays as-is since those symbols are relevant when design elements are placed.

### Technical Detail

- The blue and red circles will be drawn as filled circles using `doc.circle(x, y, r, "F")` with a white stroke ring to match the actual map markers.
- The green cable route line will be drawn as a dashed line using `doc.setLineDashPattern([1.5, 1], 0)` to match the dashed style used on the map.
- The section header will be renamed from "NETWORK LAYERS" to "ROUTE SYMBOLS" for the connection-specific items, with "NETWORK LAYERS" kept for the background data layers.

