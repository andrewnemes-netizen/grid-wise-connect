# Expandable Estimate Editor

## Problem
On `/wp/:id/commercial/poc-estimates`, the estimate editor modal (`EstimatesTab` → `EstimateEditor`) currently opens at `96vw × 92vh`, but the BOQ groups/line-items table still consumes only ~40% of usable width due to inner padding and column widths, leaving the workbench feeling cramped.

## Change (UI-only)
Add a **Maximize / Restore** toggle button in the editor header (next to Close) that expands the dialog to full viewport and gives the BOQ table the full width.

### 1. `src/components/delivery/estimate/EstimatesTab.tsx`
- Track a `maximized` state at the `Dialog` level.
- Apply conditional classes on `DialogContent`:
  - Default: `max-w-[96vw] w-[96vw] h-[92vh]` (unchanged)
  - Maximized: `max-w-none w-screen h-screen rounded-none border-0`
- Pass `maximized` + `onToggleMaximize` down to `<EstimateEditor />`.

### 2. `src/components/delivery/estimate/EstimateEditor.tsx`
- Accept optional `maximized?: boolean` and `onToggleMaximize?: () => void` props.
- Add a header icon button (Lucide `Maximize2` / `Minimize2`) placed next to the existing `Close` control that calls `onToggleMaximize`.
- When `maximized`, remove any internal `max-w-*` constraints on the BOQ container so the group/line-items table fills 100% width. Ensure the scroll container remains `flex-1 overflow-auto` so the header/toolbar stay pinned.
- Keep line row column widths fluid (`min-w` on the description column, flexible `flex-1` for value columns) so extra width benefits the data area, not empty margin.

### 3. `src/components/delivery/SiteEstimatesPanel.tsx` (EV Build editor dialog)
- Mirror the same maximize toggle on `SiteEstimateEditor`'s `DialogContent` (`max-w-6xl` → toggles to fullscreen) so both estimate editors behave consistently.

## Out of scope
- No changes to totals logic, mutations, rate-card picker, PDF, or DB.
- No changes to `WpEstimatePanel` legacy editor.
- No changes to sizing defaults — user still opens at the current size and clicks Maximize when they want more room.
