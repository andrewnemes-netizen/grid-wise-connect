
## EV Hub Feasibility Flow -- End-to-End Test Results

### What was tested

1. **Map loads correctly** -- Confirmed. The map view loads at `/` with all layers, toolbar, and sidebar.

2. **EV Hub tool button appears and activates** -- Confirmed. The Zap icon button in the right toolbar highlights green when clicked, with "EV Hub Feasibility" tooltip.

3. **Pin drop triggers EvHubPanel** -- Confirmed. Clicking the map with the EV Hub tool active opens the panel with:
   - Location coordinates (54.00000, -1.50000)
   - Charger Count: 4
   - kW per Charger: 50
   - Diversity Factor: 0.8
   - DNO: Auto-detect dropdown (with UKPN, NPG, ENWL, NGED, SPEN, SSEN options)
   - Extraneous conductive parts toggle

4. **Edge function (backend) works** -- Confirmed via direct API call. Returns complete `EV_HUB_ENGINE_V1_FRAMEWORK` payload:
   - Feasibility state: `DNO_STUDY_REQUIRED` (due to pending rule fields)
   - Total demand: 168.42 kVA (4 chargers x 50 kW x 0.8 diversity / 0.95 PF)
   - Earthing: review not required (extraneous flag was false)
   - Reinforcement: `STUDY_REQUIRED` (no headroom data)
   - BOQ: 5 electrical items, 3 fee items
   - Audit: 7 pending fields, confidence tracking across 12 rule fields

5. **Database ruleset** -- Confirmed. `ev_hub_rulesets` table contains the UK_ALL baseline with correct RLS policies.

6. **Unit tests** -- All 26 tests pass covering all engine modules.

### Issue found

The "Run Feasibility" button inside the EvHubPanel does not respond to clicks. The browser automation repeatedly clicked it without any network request or console error appearing. This suggests the button click event is being swallowed -- likely because:

- The panel uses `ScrollArea` which creates an internal viewport div
- The panel is `position: absolute` inside a map container where the map canvas has aggressive pointer-event handling
- The button's `onClick` handler never fires

### Recommended fix

Move the "Run Feasibility" button **outside** the `ScrollArea` (into the panel's fixed footer area), and ensure the panel container has `pointer-events: auto` to prevent the map canvas from intercepting clicks. This is a small structural change:

1. In `EvHubPanel.tsx`, move the `<Button onClick={handleRun}>` out of `<ScrollArea>` into a sticky footer `div` below it
2. Add `pointer-events-auto` class to the panel's root `div` to ensure it captures clicks above the map canvas

### Technical details

**File: `src/components/map/EvHubPanel.tsx`**

- Extract the "Run Feasibility" button from inside `<ScrollArea>` (currently line 148)
- Place it in a new `<div className="p-4 border-t">` after the `</ScrollArea>` closing tag
- Add `pointer-events-auto` to the root panel div (line 93)
- Move the results section to remain inside ScrollArea (it should scroll)

This ensures the primary action button is always visible and clickable regardless of scroll position or map canvas pointer events.
