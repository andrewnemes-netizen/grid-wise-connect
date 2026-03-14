

## Issues Found in the Street View + Connect + PDF Workflow

### Bug 1: `streetViewCaptures` never reach the PDF generator
`MapView.tsx` stores captures in state (`streetViewCaptures`) but **never passes them** to `ConnectAssessmentPanel`. The PDF call at line 557 of `ConnectAssessmentPanel.tsx` omits `streetViewCaptures` entirely, so the Street View section will always be empty in the report.

**Fix:** Add a `streetViewCaptures` prop to `ConnectAssessmentPanel` and thread it through from `MapView.tsx`. Pass it into the `generateAssessmentPdf()` call.

### Bug 2: `connectData` missing from `handleRun` dependency array
In `EvHubPanel.tsx` line 144, the `useCallback` dependency array omits `connectData`. If a user draws a Connect route *after* opening EV Hub, pressing "Run" uses a stale closure without the route data.

**Fix:** Add `connectData` to the dependency array.

### Bug 3: Workflow ordering friction — Street View deactivates after one click
When the user clicks the Street View tool, `setActiveTool(null)` fires immediately (line 138), so they can only place one Street View location per activation. This is fine, but the Street View panel also closes when the user clicks another tool, because `streetViewLocation` persists but the panel may get obscured by other panels (e.g., EV Hub). The panels compete for screen real estate in the top-right corner.

**Fix:** Reposition the Street View panel so it doesn't overlap with the EV Hub side panel (move it left or make it a floating panel with drag).

### Bug 4: No Connect data indicator in EV Hub panel
When Connect data is available, the EV Hub panel shows no visual confirmation. Users don't know if route/headroom data was ingested.

**Fix:** Add a small badge or info row in the EV Hub panel showing "Connect route: 245m" and "Headroom: 200 kW" when `connectData` is present.

---

### Implementation Plan

1. **Thread `streetViewCaptures` to ConnectAssessmentPanel**
   - Add `streetViewCaptures` prop to `ConnectAssessmentPanelProps`
   - Pass from `MapView.tsx` line 426
   - Include in `generateAssessmentPdf()` call at line 557
   - Include `sections: { streetView: true }` in the PDF call

2. **Fix `connectData` stale closure in EvHubPanel**
   - Add `connectData` to `handleRun` dependency array at line 144

3. **Add Connect data indicator in EV Hub panel**
   - Show a small info block when `connectData` is present, displaying route length and headroom values

4. **Adjust Street View panel positioning**
   - Change from `right-14` to a left-side or center position so it doesn't conflict with the EV Hub side panel

