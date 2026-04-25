# FlowEmo-style Live Site Designer (built into Design Mode)

Replace the current click-to-place workflow in Design Mode with a true drag-and-drop designer, like the video shows: drag a charger/transformer/RMU chip from the palette and drop it onto the map, the platform auto-draws the cheapest cable to the nearest point of connection, and a sticky bar at the top of the map ticks live totals (kVA, cable metres, £ estimate) as you design.

Everything is additive — the existing click-to-place, manual cable drawing, save-to-study, and Connect → Design bridge keep working. Nothing in the assessment / Connect / cost engines changes.

---

## What you'll be able to do

1. **Drag from a redesigned palette.** The right-hand Design Mode panel becomes a "parts shelf" — each equipment type (Transformer, RMU, Feeder Pillar, Cutout, Joint, Pole, EV Charger) is a draggable card with its colour, symbol, and default kVA. Grab a card and drag it onto the map.
2. **See a ghost cursor while dragging.** A semi-transparent marker follows the cursor on the map; nearest existing equipment / drawn cable highlights so you know what it will snap to. Drop = marker created and saved.
3. **Auto-cable on drop.** When you drop an EV Charger or load, the designer automatically draws an LV service cable from the new asset to the nearest valid POC (existing transformer / feeder pillar / RMU, or the route POC if one exists). You can disable auto-cable per-drop with a toggle in the palette.
4. **Drag already-placed items.** Existing equipment markers become draggable on the map. While dragging, attached cables rubber-band with the cursor and length / cost recalculate live.
5. **Sticky live totals bar.** A slim strip pinned to the top of the map (only while Design Mode is on) shows: total connected load (kVA), total cable length (m), live cost estimate (£ low / mid / high) using the existing `estimateConnectionCost` engine and unit rates. Numbers tick in real time during drag.
6. **Auto-save with debounce.** Drag-end persists the new position to `design_elements` / `design_cables`, exactly the same tables Design Mode already uses, so saved designs and the Connect → Design bridge keep working unchanged.

---

## Layout

```text
┌────────────────────── Map ──────────────────────────┐┌─ Parts Shelf ─┐
│ ▓▓ Live Totals: 220 kVA · 184 m · £14.2k–£18.6k  ▓▓ ││ [drag chips]  │
│                                                     ││  ⚡ EV Charger │
│              (map with markers & cables)            ││  T  Transformer│
│                                                     ││  R  RMU        │
│              ↳ ghost marker follows cursor          ││  F  Feeder     │
│                                                     ││  …             │
│                                                     ││ ── Cables ─── │
│                                                     ││ [LV main] etc │
└─────────────────────────────────────────────────────┘└────────────────┘
```

---

## Plan

### 1. New drag-from-palette hook + components
- New hook `useDesignDragDrop(map, studyId)` that wraps `useDesignMode`. Adds:
  - `draggingType` state (the equipment type being dragged from the palette)
  - HTML5 drag events on palette cards (`onDragStart` sets a typed payload)
  - Map-side `dragenter` / `dragover` / `drop` listeners on the map container (not MapLibre native — just the wrapper `<div>`) to convert the cursor pixel to lng/lat via `map.unproject`
  - Ghost marker (`maplibregl.Marker` with a CSS pulse halo) that tracks the cursor while a drag is in progress
  - Snap helper: finds nearest existing element or POC within ~30 m and highlights it
- New component `DraggableEquipmentCard` for the palette chip (HTML5 draggable, shows icon, label, kVA pill).
- Update `DesignModePanel.tsx` so the "Place Equipment" section uses the new draggable cards instead of click-to-toggle buttons. Keep the click-to-place fallback for keyboard / accessibility (clicking the chip still works the old way).

### 2. Drag already-placed markers
- Make each equipment marker draggable using MapLibre's built-in `marker.setDraggable(true)`.
- On `dragstart` capture connected cable IDs (cables whose first or last vertex is within 1 m of the marker).
- On `drag`: update those cables' end-vertex live in the map source — recompute `length_m` on the fly, push into the `cables` state via a lightweight in-memory patch (no DB write).
- On `dragend`: persist the new lng/lat (`design_elements`) and updated cable coordinates / length (`design_cables`) in a single batched update, with optimistic UI + toast.

### 3. Auto-cable to nearest POC
- New helper `findNearestPoc(lngLat, elements, routePoc)` that scores transformers > RMUs > feeder pillars > drawn route POC by haversine distance.
- On EV charger drop, if "Auto-cable" toggle is on, immediately insert an LV service cable from the new charger to the nearest POC (straight line for now; the existing manual cable tool already covers road-followed routes).
- Toggle lives at the top of the parts shelf, default ON.

### 4. Sticky live totals bar
- New component `DesignLiveTotalsBar` rendered at the top of `MapView` only when Design Mode is active.
- Computes:
  - **Load (kVA):** sum of `kva` from each element's `properties_json` (fall back to defaults per type — EV charger 55 kVA, transformer 500 kVA, etc.).
  - **Cable length (m):** sum of `length_m` across all `cables`, plus the in-flight rubber-band length while dragging.
  - **£ estimate:** call `estimateConnectionCost` with the aggregate cable length, voltage tier inferred from cable types, and the user's saved unit rates (`useUnitRates`). Display low / mid / high.
- Updates on every `elements` / `cables` change and on the in-memory patches during drag, so the numbers tick smoothly.

### 5. Persistence + safety
- All drag-end writes go through the existing `design_elements` / `design_cables` tables — no schema changes, no migration needed.
- Optimistic update first, then DB write; on failure, toast + revert from last known DB state (re-fetch by `study_id`).
- 250 ms debounce on rapid drag-end fires (e.g. user dragging back and forth) to avoid spamming inserts.
- All edits are gated by an active `studyId`, exactly like today.

### 6. Polish
- Empty-state coaching: when Design Mode opens with zero elements, show a one-line tip in the totals bar: "Drag a part from the right onto the map to begin."
- Keyboard: `Esc` cancels an in-flight drag and removes the ghost.
- Touch fallback: keep click-to-place active so the existing flow still works on tablets where HTML5 drag is flaky.

---

## Files

**New**
- `src/hooks/useDesignDragDrop.ts` — drag-from-palette + ghost cursor + snap + auto-cable
- `src/components/map/DraggableEquipmentCard.tsx` — palette chip with HTML5 drag handlers
- `src/components/map/DesignLiveTotalsBar.tsx` — sticky kVA / m / £ bar
- `src/lib/designAutoCable.ts` — `findNearestPoc()` + straight-line cable factory
- `src/lib/designLoadCalc.ts` — kVA defaults per equipment type + aggregator

**Edited**
- `src/components/map/DesignModePanel.tsx` — swap click-to-place buttons for `DraggableEquipmentCard`s, add Auto-cable toggle
- `src/hooks/useDesignMode.ts` — expose an `updateElementPosition(id, lng, lat)` and `updateCableCoordinates(id, coords)` for drag-end persistence; mark markers draggable
- `src/pages/MapView.tsx` — render `DesignLiveTotalsBar` while Design Mode is active; mount drop-zone listeners on the map container

**Untouched (verified)**
- `connectionCosts.ts`, `useUnitRates.ts`, Connect orchestrator / engines, assessment, Studies — purely consumed, never modified.

---

## Out of scope (call out so we don't surprise you)
- Road-following cable on auto-drop (uses straight line; manual road-followed routing is still available via the existing cable tool).
- Multi-select / box-drag of multiple markers.
- Undo/redo stack — we keep the existing per-action remove/clear controls.
- New marketing landing page (your earlier "build like FlowEmo" is now scoped to this in-app designer).
