# Plan

## Goal
Update the work-package pre-construction UI labels and the "In Progress" status colour so the page title and sidebar both read **Pre-Con Flow**, and an in-progress stage renders in blue instead of the current emerald/green.

## Changes

### 1. Rename page title
- **File:** `src/pages/wp/tabs/WpMatrixTab.tsx`
- **Change:** Update the `<h1>` title from `"Pre-Construction Pipeline"` to `"Pre-Con Flow"`.
- Keep the descriptive subtitle text unchanged.

### 2. Rename sidebar menu item
- **File:** `src/components/wp/WpSidebar.tsx`
- **Change:** Update the menu item title from `"Delivery Matrix"` to `"Pre-Con Flow"`.
- The route slug (`sites/matrix`) and icon remain unchanged.

### 3. Change In Progress status colour to blue
- **File:** `src/lib/wp/stageStatus.ts`
- **Change:** Update the `in_progress` entry in `STAGE_STATUS_COLORS` from the current emerald primary tokens to the existing blue status-progress tokens:
  - Background: `bg-[hsl(210_90%_55%)]/15` or `bg-status-progress/15` if the CSS variable is exposed via Tailwind
  - Text: `text-status-progress` / `text-blue-600`
  - Border: `border-status-progress/30`
- Verify the `STAGE_STATUS_COLORS` object is the single source of truth used by `WpMatrixTab.tsx` for both the matrix dropdown trigger and any status badges.

## Out of scope
- No database or trigger changes.
- No changes to stage sequence, recipient logic, or notification behaviour.
- No changes to the slug/routing.

## Verification
- Build/typecheck passes.
- Playwright screenshot confirms the sidebar shows "Pre-Con Flow" and the page header matches.
- Screenshot confirms an "In progress" stage cell renders with blue tint, not green.