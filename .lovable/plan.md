## Goal
Add checkbox-based bulk stage completion to the Pre-Con Flow matrix (`WpMatrixTab.tsx`), scoped to one stage column at a time, reusing the existing single-site completion logic and branching rules.

## UX

- Each site cell in a stage column that is currently `in_progress` (or eligible to be marked done) gains a checkbox.
- Each stage column header gains a "select all" checkbox that ticks every eligible site in that column.
- Selecting a site in one column clears any selection in other columns — selection is scoped to a single stage at a time.
- A floating action bar appears when ≥1 site is selected, showing: `N sites selected in "<Stage Name>"` and a **Mark Done** button, plus a **Clear** button.
- Clicking **Mark Done** opens a bulk variant of the existing stage completion dialog:
  - Shows the list of selected sites.
  - Shows the next-stage recipient picker (single recipient applied to all sites in the batch, per user's decision).
  - Save is disabled until a recipient is chosen — same block as single-site flow.
  - Because different sites may branch to different next stages, the picker resolves per-site: for each site, compute its next stage(s) using the existing `stageStatus.ts` branching logic, then apply the selected user as recipient on whatever the correct next stage is for that site. If sites in the batch resolve to different next stages, show a small summary line ("3 sites → Awaiting PoC Offer, 1 site → Survey Allocation") so the user knows the recipient will be assigned across those stages.

## Implementation

1. **`WpMatrixTab.tsx`**
   - Add selection state: `{ stageKey: string | null, siteIds: Set<string> }`.
   - Render checkbox in each eligible cell and header; clicking a cell checkbox in a different column resets selection to that column.
   - Render bulk action bar (sticky bottom or top-of-table).

2. **New component `BulkStageDoneDialog.tsx`**
   - Props: `stageKey`, `siteIds`, `wpId`, `onClose`.
   - Fetches site names for display.
   - For each site, computes next stage(s) via shared helper from `stageStatus.ts`.
   - Groups sites by resolved next stage for the summary line.
   - Single `RecipientPicker` (reused).
   - On confirm: loops sites and calls the same completion routine used by `StageDetailDialog` (extract to a shared helper `completeStageAndAssignNext(siteId, stageKey, recipientUserId)` if not already reusable), running sequentially with a progress toast; invalidates the matrix queries at the end.

3. **Shared helper extraction**
   - If the single-site completion logic in `StageDetailDialog.tsx` is currently inline, extract it into `src/lib/preconFlow/completeStage.ts` so both single and bulk paths share exactly the same behaviour (status update, recipient clear, next-stage recipient assign, notifications).

4. **Verification (Playwright)**
   - Pick a WP with ≥2 sites at the same stage (e.g. PoC Application).
   - Tick 2 sites, click Mark Done, confirm Save is disabled without a recipient.
   - Select recipient, save, confirm both sites moved to the correct next stage with recipient assigned and notifications created. Screenshot each step.
   - Only after this passes on one column do we consider it validated for all columns (behaviour is column-agnostic by construction).

## Out of scope
- No changes to notification content, branching rules, RLS, or the underlying stage/recipient tables.
- No changes to single-site dialog behaviour beyond the shared-helper extraction.
