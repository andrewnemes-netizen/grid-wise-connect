
# Redesign: Emerald Command Centre (Shell + Delivery)

A focused restyle of the app shell and the Delivery module. No business logic changes — only tokens, typography, layout and component polish.

## Design direction

- **Palette (Emerald Prestige)** — dark emerald anchor, warm gold accent, cream surfaces.
  - `--background` cream `#f5f0e0` (light) / deep emerald `#052e26` (dark)
  - `--primary` emerald `#0d7a5f`, `--primary-deep` `#064e3b`
  - `--accent` gold `#c9a84c` (used sparingly: active states, KPI highlights, chips)
  - Neutrals derived from emerald-tinted greys, not pure slate
- **Typography** — Sora (headings, tabular numerals for data), Manrope (body/UI). Wired via `@fontsource` + Tailwind font families; replaces current defaults.
- **Density & shape** — 6px radius, 1px hairline borders in `emerald/15`, subtle inner shadow on panels, chips become small pill tags with coloured dot + label (not solid fills).

All values land as HSL tokens in `src/index.css` and mappings in `tailwind.config.ts`. No hardcoded colours in components.

## Layout: split-screen shell

New app shell for Delivery routes:

```text
┌────────┬──────────────────────────────────────────────┐
│Sidebar │ Topbar: breadcrumbs · search · notifs · user │
│(emerald├───────────────────┬──────────────────────────┤
│ rail)  │  LEFT: Map pane   │ RIGHT: Work pane         │
│        │  - programme sites│ - Programme header       │
│        │  - WP pins        │ - Monday-style board     │
│        │  - hover sync     │ - Tabs: WPs · Tasks ·    │
│        │                   │   Gantt · Files          │
└────────┴───────────────────┴──────────────────────────┘
```

- Resizable split (drag handle, remembers ratio in `localStorage`). Collapse map to a right-edge rail on narrow viewports.
- Map pane reuses existing MapLibre setup, filtered to the current programme's WP sites; clicking a row highlights the pin, clicking a pin scrolls the row.
- On mobile (<768px) the split stacks: map becomes a collapsible top card, board fills below.

## Delivery board polish (Monday-style, refined)

Keep engine + data model. Visual pass only in `TaskBoard.tsx` and cells:

- Sticky header row with gold underline on the active sort column.
- Group headers: coloured 4px left bar + emerald text, count as gold pill.
- Rows: 36px height, hover shows a faint emerald wash + row action rail.
- Status/priority chips redesigned as dot+label pills using palette tokens.
- Selection bar docks bottom-centre as a floating emerald toolbar (not inline).
- Empty state + "Add work package/task" row gets a dashed emerald border on hover.

## Scope of changes

**In scope**
1. Design tokens: `src/index.css`, `tailwind.config.ts` (Emerald Prestige, Sora/Manrope, radii, shadows, chip tokens).
2. Fonts: add `@fontsource/sora` + `@fontsource/manrope`, wire in `src/main.tsx`.
3. Shell: `src/components/AppSidebar.tsx`, `src/components/DashboardLayout.tsx` — emerald rail, gold active indicator, refined topbar.
4. New split layout: `src/components/delivery/DeliverySplitLayout.tsx` (resizable panes, map+content slots) used by:
   - `src/pages/DeliveryProgrammeDetail.tsx`
   - `src/pages/DeliveryWorkPackage.tsx`
5. Programmes list (`src/pages/DeliveryProgrammes.tsx`): restyle cards into a denser board-like list matching new tokens.
6. Board polish: `src/components/delivery/board/TaskBoard.tsx` + cells (`StatusCell`, `TextCell`, header, group header, selection bar). No behaviour change.

**Out of scope (this pass)**
- Map, Studies, Portfolio, LA Programme, Admin page restyles (tokens will cascade, but no bespoke work).
- Any data model, RLS, or engine changes.
- New features on the board (columns/views/automations behaviour unchanged).

## Technical notes

- Split pane implemented with a lightweight custom component using CSS grid + a drag handle (no new dep) to avoid pulling in `react-resizable-panels` unless preferred.
- Map filter: pass `programmeId` prop; reuse existing site query, add a `where wp.programme_id = ?` filter client-side from already-loaded WPs.
- Row↔pin sync via a small `useDeliverySelection` context (hover/selected id).
- All colour usage via semantic tokens; migration adds no SQL.

## Deliverable

After approval and implementation, Delivery routes render inside the new emerald split-screen shell with Sora/Manrope typography, and the Monday-style board is visually upgraded without changing its behaviour.
