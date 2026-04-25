# Gridwise Visual Design Workflow (FlowEmo overlay)

This plan layers a guided FlowEmo-style workflow on top of the existing Design Mode. **Nothing existing is rebuilt or replaced** — drag/drop, auto-cable, midpoint labels, cable editing, live status, cost/BOQ, DNO rules, electrical validation and PDF export all stay exactly as-is. We add a thin orchestration layer that gives users a structured 10-step delivery process, scenario comparison and triggered re-validation.

---

## What stays untouched

`useDesignDragDrop`, `useDesignMode`, `DesignModePanel`, `DraggableEquipmentCard`, `DesignCableLabels`, `DesignCableInteractions`, `DesignLiveStatusCard`, `designAutoCable`, `designLoadCalc`, `commercialEngine`, `connectionCosts`, `boqGenerator`, `apply-dno-rules`, `routeEngine`, `roadRoute`, `generateAssessmentPdf`, `studies`, `StudyDetail`, `MapView`.

These are wired into the new layer via existing hooks/exports — no edits beyond minimal prop additions.

---

## 1. Database additions (migration)

Two new tables. **No existing tables are altered destructively** — `design_elements` and `design_cables` get one nullable `scenario_id` column so legacy data keeps working.

```sql
-- workflow status on studies
ALTER TABLE studies
  ADD COLUMN IF NOT EXISTS workflow_status text NOT NULL DEFAULT 'draft';
  -- enum-like: draft | site_selected | boundary_drawn | assets_placed
  --           | routes_connected | validated | costed | approved | exported

-- scenarios: A/B/C options inside a single study
CREATE TABLE design_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL,
  name text NOT NULL,
  option_type text,          -- 'existing_supply' | 'new_lv' | 'lv_extension' | '11kv' | 'ev_bess'
  status text NOT NULL DEFAULT 'draft',
  is_active boolean NOT NULL DEFAULT false,
  demand_kw numeric, demand_kva numeric,
  dno text, voltage_level text,
  score numeric, risk_rating text,
  cost_low numeric, cost_mid numeric, cost_high numeric,
  recommendation text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- workflow event log (audit + checklist progression)
CREATE TABLE design_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL,
  scenario_id uuid,
  event_type text NOT NULL,   -- 'step_completed' | 'recalculated' | 'template_applied' | ...
  event_label text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- bind existing design rows to a scenario (nullable = legacy / default scenario)
ALTER TABLE design_elements ADD COLUMN IF NOT EXISTS scenario_id uuid;
ALTER TABLE design_cables   ADD COLUMN IF NOT EXISTS scenario_id uuid;
```

RLS on both new tables follows the existing `design_elements` pattern (owner via `studies.created_by`, admin-all, engineer-read).

---

## 2. New files (small, additive)

```
src/hooks/useVisualWorkflow.ts          // workflow state machine + event logger
src/hooks/useDesignScenarios.ts         // CRUD + active-scenario selection
src/lib/designWorkflow/steps.ts         // 10-step definitions + completion predicates
src/lib/designWorkflow/templates.ts     // asset template definitions (bulk place specs)
src/lib/designWorkflow/recalcBus.ts     // debounced trigger that fans design changes
                                        // out to existing engines

src/components/map/workflow/VisualWorkflowChecklistPanel.tsx
src/components/map/workflow/ScenarioManagerPanel.tsx
src/components/map/workflow/DesignTemplatePicker.tsx
src/components/map/workflow/LiveValidationSummaryPanel.tsx
src/components/map/workflow/ExportPackSelector.tsx
```

That's it. No new map component, no new drag system, no new cable engine.

---

## 3. The 10-step workflow (`steps.ts`)

| # | Step                  | Auto-completes when…                                  |
|---|-----------------------|--------------------------------------------------------|
| 1 | Site selected         | study has lat/lng                                      |
| 2 | Boundary drawn        | study.boundary_geojson present                         |
| 3 | POC selected          | ≥1 element of type transformer/rmu/cutout              |
| 4 | Feeder pillar placed  | ≥1 `feeder_pillar` element                             |
| 5 | Chargers placed       | ≥1 `ev_charger` element                                |
| 6 | Cable route connected | every charger has a path back to a POC via cables      |
| 7 | DNO rules passed      | last `apply-dno-rules` run returned no blockers        |
| 8 | Electrical validated  | `electricalEngine` returned `pass`                     |
| 9 | Cost generated        | `commercialEngine` returned a cost_range               |
| 10| Pack exported         | a successful `generateAssessmentPdf` event exists      |

Predicates run from current in-memory state (no extra fetches). `workflow_status` on `studies` is updated whenever the highest contiguous completed step changes.

---

## 4. Asset templates (`templates.ts`)

Templates are pure data: an array of `{element_type, offset_lat, offset_lng, label}` plus optional default cable connections. They're bulk-placed by reusing the existing `useDesignMode.placeElement` / `insertAutoCable` paths in a loop — no new persistence code.

Initial set:

- 4-Socket On-Street Layout
- 6-Socket On-Street Layout
- 47kW DC Micro Hub
- Feeder Pillar + 2 Chargers
- Feeder Pillar + 4 Chargers
- Building Supply Split
- New DNO Connection

`DesignTemplatePicker` shows them as cards inside `DesignModePanel` (one new section, above the existing palette).

---

## 5. Scenario layer (`useDesignScenarios.ts` + `ScenarioManagerPanel.tsx`)

- One study can hold many `design_scenarios` (A/B/C/…).
- Exactly one is `is_active` at a time. The MapView's existing queries for `design_elements` / `design_cables` are filtered by `scenario_id = activeScenarioId OR scenario_id IS NULL` (legacy fallback).
- Switching scenarios swaps the visible elements/cables; nothing else changes.
- A "Compare scenarios" view shows a small table: demand, cost low/mid/high, score, risk, recommendation — pulled from the cached fields on each `design_scenarios` row, populated by the recalc bus.

---

## 6. Live re-validation (`recalcBus.ts`)

A single debounced bus that listens to existing events already emitted by `useDesignMode`:

- `design:element-dragend`
- element added / removed
- cable added / removed / coordinates updated
- cable properties patched

On any change → 350ms debounce → run, in order:

1. Route length / surface segmentation (existing `routeSegmentation` helpers)
2. `apply-dno-rules` edge function
3. `electricalEngine` sizing
4. `commercialEngine` cost + BOQ
5. Persist summary onto the active `design_scenarios` row
6. Push a `design_workflow_events` row (`recalculated`)
7. Re-evaluate the 10-step checklist

This is the single missing piece that makes the experience feel "live" end-to-end — every existing engine is reused as-is.

---

## 7. UI placement

```text
MapView
 ├─ existing map
 ├─ existing DesignLiveStatusCard            (untouched — bottom-left)
 ├─ existing DesignCableLabels / Interactions (untouched)
 └─ existing DesignModePanel                 (right side, gains 2 small sections)
     ├─ NEW: VisualWorkflowChecklistPanel    (top, collapsible — 10 steps)
     ├─ NEW: ScenarioManagerPanel            (under checklist — A/B/C tabs)
     ├─ NEW: DesignTemplatePicker            (above existing palette)
     ├─ existing equipment palette
     ├─ existing cable palette
     ├─ existing placed/cables lists
     ├─ NEW: LiveValidationSummaryPanel      (DNO/electrical/cost status pills)
     └─ NEW: ExportPackSelector              (Client / DNO / Installer → existing PDF)
```

Each new panel is collapsible. Power users can collapse them all and the panel looks identical to today.

---

## 8. Export packs (`ExportPackSelector.tsx`)

Reuses `generateAssessmentPdf` and the existing `filterPackForAudience` from `commercialEngine` (already in the codebase). Three buttons:

- **Client pack** — pricing, no margin, no install detail
- **DNO pack** — engineering data, no pricing
- **Installer pack** — full BOQ, install sequence, pricing

On success → log `design_workflow_events` (`exported`) → set `workflow_status = 'exported'`.

---

## Out of scope for this iteration

- No new map drawing primitives
- No new cable algorithm
- No changes to existing engines' signatures
- No changes to PDF generator internals (only inputs we already pass)
- No new icons added to the equipment palette (templates handle bulk placement instead)

---

## Acceptance

1. Open a study → checklist shows current step; previous design loads as the default scenario.
2. Pick "Feeder Pillar + 4 Chargers" template → 5 elements + 4 auto-cables appear in one click.
3. Drag a charger → live status updates immediately, recalc bus fires once after 350ms, DNO/electrical/cost pills refresh, scenario row updates.
4. Create Scenario B as "11kV option" → independent elements/cables; comparison table shows both.
5. Click "Export — Installer pack" → existing PDF generated, workflow status = `exported`.
