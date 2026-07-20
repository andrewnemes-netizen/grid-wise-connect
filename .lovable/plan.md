## Goal
Retire the legacy Work Package page (`/delivery/wp/:id`, `src/pages/DeliveryWorkPackage.tsx`) so the app goes straight from the Delivery/Programme lists into the Gridwise OS shell (`/wp/:id`). No functionality loss: Estimate v1 and Master Gantt are consciously dropped per user decision.

## What's already in Gridwise OS (no work needed)
Overview, Sites (Site Register), Matrix, Interactive Gantt (Programme tab), Site Estimates, Estimates (v2), PoC Estimates, WP Tasks, Milestones (WP Tasks tab), Import sites + Add site (Site Register), inline WP name/code/dates edit (Overview tab).

## What's being dropped (user-confirmed)
- **Estimate v1 tab** (`WpEstimatePanel` / `work_package_estimates`) — superseded by Site Estimates + Estimates + PoC Estimates. Table rows stay in DB; UI is removed.
- **Master Gantt view** — Interactive Gantt in OS Programme tab covers it.

## Changes

### 1. Remove the legacy route and page
- `src/App.tsx`: delete the `DeliveryWorkPackage` lazy import and the `<Route path="/delivery/wp/:id" ...>` entry.
- `rm src/pages/DeliveryWorkPackage.tsx`.

### 2. Rewrite every internal link `/delivery/wp/:id` → `/wp/:id`
Files to update (all currently point at the legacy path):
- `src/pages/ImportWizard.tsx` (2 links — inline "open WP" + "Open Work Package" button)
- `src/pages/DeliveryProposalDetail.tsx` (2 places — post-conversion `nav()` + snapshot link)
- `src/pages/DeliveryProgrammeDetail.tsx` (`onOpenRow` in TaskBoard)
- `src/components/wp/WpSidebar.tsx` line 118 — remove the "Open legacy Work Package" link entirely (it lives in the OS sidebar itself, pointless once legacy is gone).
- `src/pages/WorkPackageShell.tsx` line 150 — remove the "Open legacy Work Package" link in the fallback/feature-flag-off branch.

### 3. Feature flag cleanup
- `src/components/admin/FeatureFlagsPanel.tsx` — update the `gridwise_os_shell` description so it no longer promises a legacy fallback. Keep the flag itself (other code may branch on it), just rewrite the copy to reflect that OS is now the only shell.
- `src/pages/WorkPackageShell.tsx` — the flag-disabled branch currently offers to open the legacy page; change it to a plain "This work package uses Gridwise OS" note (or just always render the shell, since there's nowhere else to send them).

### 4. Verify nothing else imports the deleted page
`rg "DeliveryWorkPackage|/delivery/wp/"` after edits should return zero hits. If anything else surfaces, redirect it to `/wp/:id`.

## Explicitly NOT changing
- `work_package_estimates` table, `WpEstimatePanel.tsx` component file, or `WpVariationsTab` (which still reads `work_package_estimates` for variation history) — dropping the tab doesn't require deleting the underlying data or the variations read path.
- OS tab set, sidebar structure, or any OS component.
- Legacy `MasterGantt` helper lives inside `DeliveryWorkPackage.tsx` and dies with it — no separate cleanup needed.

## Verification
1. `rg "DeliveryWorkPackage|/delivery/wp/"` → no matches.
2. Typecheck passes.
3. Load `/delivery/programmes/:id`, click a WP row → lands on `/wp/:id` OS shell.
4. Load `/import/wizard` post-import "Open Work Package" → `/wp/:id`.
5. Convert a proposal → nav lands on `/wp/:id`.
