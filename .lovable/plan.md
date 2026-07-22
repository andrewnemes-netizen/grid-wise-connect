## Goal
Extend the Pre-Con Flow bulk action bar so a column-scoped batch can be set to **any** workflow status (Not started, In progress, Review, Blocked, Done), not just Done.

## Behaviour

- Replace the single "Mark Done" button in the floating action bar with a status selector + "Apply" button. Options: In progress, Review, Blocked, Done. (Not started is available too, used to reopen; excluded if the resulting UX is confusing — confirm below.)
- Selection stays column-scoped (one stage at a time), same as today.
- Per-status behaviour inside the batch:
  - **Done**: unchanged — opens the existing `BulkStageDoneDialog` (recipient picker required, per-site branching to next stage, close current stage, open next).
  - **Blocked**: open a lightweight bulk dialog asking for a `blocked_reason` (required, single value applied to all selected sites). Sets `workflow_status = 'blocked'`, keeps current recipients/owner untouched.
  - **In progress / Review**: no dialog needed. Confirm inline, then upsert `workflow_status` on every selected `site_stage_status` row. Preserve existing owner/recipients. If a row doesn't exist yet for a site (stage never opened), insert with `actual_start_date = today` when moving to `in_progress`.
- All paths run per-site in a loop with progress feedback and per-site error surfacing, matching the current bulk-Done pattern.
- Invalidate the matrix + tasks queries after completion so the grid refreshes instantly.
- No notifications fired for In progress / Review / Blocked bulk changes in this slice (matches single-site behaviour today). Done keeps its existing next-stage assignment notification.

## Files

- `src/lib/wp/completeStage.ts` — add `bulkSetStageStatus({ wpId, siteIds, stage, status, blockedReason? })` helper for the non-Done paths (simple upsert loop, no branching).
- `src/components/wp/BulkStageStatusDialog.tsx` — new small dialog for Blocked (reason input) and a shared confirm surface for In progress / Review.
- `src/components/wp/BulkStageDoneDialog.tsx` — unchanged, still used for the Done path.
- `src/pages/wp/tabs/WpMatrixTab.tsx` — swap the single "Mark Done" button in the floating action bar for a status dropdown + Apply; route to the right dialog/helper based on chosen status.

## Out of scope

- Changing single-site stage editing (StageDetailDialog stays as-is).
- Adding notifications for non-Done bulk transitions.
- Cross-column bulk selection.

## Question

Should **Not started** be included in the bulk status options (used to reopen a stage), or limited to In progress / Review / Blocked / Done? I'll default to excluding it unless you want it.
