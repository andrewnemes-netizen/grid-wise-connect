## Goal

We've already got the **POC → Feeder Pillar** leg working. Now we add the second leg of the FlowEmo-style designer: **Feeder Pillar → EV Charger (EVCP)**, with everything you saw in the FlowEmo screenshots — distance labels on each cable, click-to-edit cable specs, a hierarchical "Live Status" totals card and a per-cable BoM that flows into the PDF proposal.

## What changes for the user

When Design Mode is active and at least one Feeder Pillar exists on the map:

1. **Drop an EV Charger** anywhere — it auto-cables to the **nearest Feeder Pillar** (not just any POC). If no Feeder exists, it falls back to the existing POC priority (Transformer → RMU → Cutout) and shows a warning chip.
2. Each auto-drawn cable shows a floating **"12.89 m" pill** at its midpoint — exactly like the FlowEmo screenshots.
3. **Click a cable** → small popover opens with: from/to labels, length, calculated **needed amps**, recommended cable spec (e.g. `4×240 mm² Al / XLPE`), and an "Edit" button.
4. **Edit cable** → side sheet with: Name, Cable Type (dropdown driven by `selectCableForLoad`), Extra Length, Material (Cu/Al), Power Circuits, Cable Type in Soil, Isolation Type. Saves to `design_cables.properties_json`.
5. **Drag a Feeder Pillar or EVCP** → all its cables rubber-band live (already works) and the live-totals bar ticks.
6. The existing **DesignLiveTotalsBar** is upgraded to a FlowEmo-style "Live Status" card with:
   - Counts per asset type (POC / Feeder / EVCP)
   - Hierarchical lengths: `POC → Feeder-1 / Feeder-1 → EVCP-1 …`
   - Cable BoM grouped by spec (e.g. `4×240 mm² Al / XLPE — 68 m`)
   - Hardware + cables + total project cost (using `estimateConnectionCost`)
7. The whole card exports straight into the existing PDF proposal as a new "Site Design" page.

## Technical changes

### 1. Targeted auto-cable for EVCP → Feeder

`src/lib/designAutoCable.ts`
- Add `findNearestFeederPillar(drop, elements)` — scoped to `feeder_pillar` only with a 250 m max default.
- Refactor `findNearestPoc` to take an `allowedTypes` option so we can reuse it.

`src/hooks/useDesignDragDrop.ts`
- In the EVCP drop handler, prefer `findNearestFeederPillar`; only fall back to `findNearestPoc` (Transformer / RMU / Cutout) if no feeder exists. Toast a warning when falling back.
- Same logic in the HTML5 `handleDrop` path.
- Stamp the inserted cable's `properties_json` with `{ from_id, to_id, leg: "feeder_to_evcp" }` so the totals card can build the hierarchy.

`src/hooks/useDesignMode.ts`
- Extend `insertAutoCable` to accept an optional `properties_json` payload and persist it.

### 2. Distance pills on every cable

New file `src/components/map/DesignCableLabels.tsx`
- Subscribes to `design.cables` and renders a `maplibregl.Marker` at each cable's midpoint containing a small white pill: `12.89 m`.
- Re-projects on `map.move`/`zoom` and on the `design:element-drag` custom event (so labels track the rubber-band live).
- Mounted from `MapView.tsx` only when `activeTool === "design"`.

### 3. Click-to-edit cable popover + edit sheet

New file `src/components/map/DesignCablePopover.tsx`
- Wires `map.on("click", layerId)` for every `design-cable-*` layer.
- Shows a Radix Popover anchored at click point: `LVC-1 → DCU-4 — AC · 924.00 A`, plus **Edit** and **Delete** buttons.
- Opens `DesignCableEditor.tsx` (Sheet) when Edit is clicked.

New file `src/components/map/DesignCableEditor.tsx`
- Form bound to `design_cables.properties_json` with the FlowEmo fields:
  - Name, Cable Type (options from `selectCableForLoad` for the calculated load)
  - Extra Length (m), Extra Pips
  - Material, Power Circuits, Separation Distance, Thermal Resistance, Cable Type in Soil, Cable Isolation Type
- Live-recomputes "Needed Ampere" from the connected EVCP's kVA (default 55 kVA = 80 A @ 400 V 3φ, configurable).
- Saves via a new `updateCablePropertiesFn` in `useDesignMode`.

### 4. FlowEmo-style "Live Status" totals card

Replace `src/components/map/DesignLiveTotalsBar.tsx` with `DesignLiveStatusCard.tsx`:
- Top strip: `● LIVE STATUS` + 4 coloured count tiles (POC / Feeder / DCU / EVCP).
- "Total length" tree built by walking `properties_json.from_id → to_id` edges, e.g.:
  ```text
  POC → Feeder-1                5.62 m
   └─ Feeder-1 → EVCP-1        16.83 m
   └─ Feeder-1 → EVCP-2        13.16 m
  ```
- "Cable total length" grouped by spec string from `properties_json.cable_spec`.
- "Total Project Cost" from `estimateConnectionCost` (already used today) split into Hardware vs Cables.
- Collapses to a small chip on small viewports.

Mount in `MapView.tsx` in the same slot as today's bar.

### 5. PDF proposal hook-in

`src/lib/generateAssessmentPdf.ts`
- Add an optional `siteDesign` section that takes a snapshot of the live status card (HTML → canvas via the existing `useMapScreenshot` pattern) and embeds it as a new page after the cable-route page. No new infra — it reuses the existing screenshot pipeline.

### 6. Defaults / tuning

`src/lib/designLoadCalc.ts`
- Add `EVCP_DEFAULT_AMPS = 80` (55 kVA / 400 V / √3 ≈ 79.4 A) used by the cable editor when no override is set.

## Files

**New**
- `src/components/map/DesignCableLabels.tsx`
- `src/components/map/DesignCablePopover.tsx`
- `src/components/map/DesignCableEditor.tsx`
- `src/components/map/DesignLiveStatusCard.tsx`

**Edited**
- `src/lib/designAutoCable.ts` — add `findNearestFeederPillar`, refactor POC scoring
- `src/lib/designLoadCalc.ts` — add EVCP amps default
- `src/hooks/useDesignDragDrop.ts` — prefer feeder for EVCP drops, stamp edges
- `src/hooks/useDesignMode.ts` — accept `properties_json` on insert + new `updateCableProperties`
- `src/pages/MapView.tsx` — mount labels, popover, status card; remove old totals bar
- `src/components/map/DesignModePanel.tsx` — small copy tweak ("Drag an EVCP near a Feeder Pillar to auto-cable")
- `src/lib/generateAssessmentPdf.ts` — optional Site Design page

**Removed**
- `src/components/map/DesignLiveTotalsBar.tsx` (superseded by the status card)

## Out of scope (next iteration)

- Multi-EVCP daisy-chain off one feeder pillar circuit (today each EVCP gets its own service cable)
- Voltage-drop / fault-level validation on the feeder leg
- "Split connection" tool from the FlowEmo popover
