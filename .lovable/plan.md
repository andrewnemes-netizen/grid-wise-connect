

## Save and Compare Connection Assessments

This feature adds the ability to save completed connection assessments and compare up to 4 of them side by side in a comparison table.

### How It Works

1. After running an assessment, a "Save Assessment" button appears in the results area
2. Saved assessments are stored in-session (React state) and listed in a collapsible drawer at the bottom of the panel
3. Selecting 2-4 saved assessments opens a full-width comparison view showing key metrics side by side
4. The comparison view includes score, cost, voltage level, distance, constraints, and BOM summary

### Changes

**1. New file: `src/components/map/SavedAssessmentsDrawer.tsx`**
- A collapsible list of saved assessments shown at the bottom of `ConnectAssessmentPanel`
- Each saved item shows: label, score badge, total cost, voltage level, date/time
- Delete button per item
- "Compare Selected" button when 2-4 items are checked
- Checkboxes for multi-select

**2. New file: `src/components/map/AssessmentComparisonPanel.tsx`**
- Full-width overlay panel (replaces the assessment panel temporarily)
- Side-by-side table comparing selected assessments
- Rows: Source asset, Destination coords, Route distance, Proposed kW, Voltage level, Score (with color), Total cost, Cable cost, Excavation cost, Equipment cost, Reinforcement cost, Confidence, Key constraints (NDP, Wayleave, Capacity)
- Highlights the best value in each row (lowest cost, best score)
- "Back" button to return to the assessment panel
- "Export Comparison PDF" button

**3. Modified: `src/components/map/ConnectAssessmentPanel.tsx`**
- Add `savedAssessments` state array holding completed assessment snapshots
- After results load, show a "Save This Assessment" button that captures: endpoints, proposedKw, voltageOverride, result, distances, timestamp, and a user-editable label
- Render `SavedAssessmentsDrawer` below the results section
- When comparison mode is activated, render `AssessmentComparisonPanel` instead of the normal panel content

**4. New type: `SavedAssessment`** (defined in ConnectAssessmentPanel.tsx)
```text
interface SavedAssessment {
  id: string;              // crypto.randomUUID()
  label: string;           // e.g. "Option A - LV 50kW"
  timestamp: Date;
  endpoints: ConnectEndpoints;
  proposedKw: number;
  voltageOverride: VoltageOverride;
  result: ScoreResult;
  distances: { primary_m; feeder_m; capacity_segment_m };
  totalEstimate: number;   // from CostEstimatePanel calculation
  voltageLevel: string;    // resolved LV/HV/EHV
  confidence: string;
}
```

### Technical Details

- All state is client-side (React useState) -- no database tables needed
- Assessments persist only for the current session; closing the panel clears them
- The comparison panel uses a responsive CSS grid/table layout
- Cost calculations for comparison are done using `estimateConnectionCost()` from `connectionCosts.ts` with each assessment's saved parameters
- Maximum 10 saved assessments to keep UI manageable
- The comparison panel reuses existing UI components (Badge, Card, Table, ScrollArea)

### User Flow

1. User draws a connection route and runs assessment
2. Results appear with a new "Save as Option" button
3. User saves it (auto-labeled "Option A"), then closes or modifies parameters
4. User draws another route or changes kW/voltage and runs again
5. Saves as "Option B"
6. At the bottom of the panel, saved options are listed with checkboxes
7. User selects 2+ options and clicks "Compare"
8. Side-by-side comparison table opens highlighting differences

