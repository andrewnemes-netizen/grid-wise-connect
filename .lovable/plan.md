
## Goal

Replace the standard status cell for **Awaiting PoC Offer** with a new **Waiting Stage** cell that shows a colour-escalating target date and a click-through dropdown (Edit date / Received / Delayed). Built as a reusable stage type so we can opt in more stages later, but only wired to Awaiting PoC Offer for now.

## Data model

Extend `site_stage_status` with waiting-stage metadata (nullable, only populated when the stage is a waiting stage):

- `wait_started_at` timestamptz — set when the previous stage is completed.
- `wait_target_date` date — computed as `wait_started_at + SLA working days`, editable.
- `wait_delay_reason` text — required when marking delayed.
- `wait_delay_logged_at` timestamptz — audit stamp for the most recent delay entry.

No enum changes. The stage still uses the existing `site_stage_state` values under the hood (`in_progress` while waiting, `done` on Received). Delayed does **not** change `workflow_status` — it just records the reason and (per your answer) a revised `wait_target_date`, and the countdown restarts against that new date.

Add a stage-config map in code (not DB, keeps it simple and per-stage configurable as requested):

```ts
// src/lib/wp/waitingStages.ts
export const WAITING_STAGES: Partial<Record<StageKey, { slaWorkingDays: number; warnWorkingDays: number }>> = {
  poc_offer_awaiting: { slaWorkingDays: 20, warnWorkingDays: 3 },
};
```

Other stages can be added to this map later without schema changes.

## Countdown trigger

When the preceding stage (`poc_application`) is marked Done via `completeStage` / `bulk_complete_stage_and_assign_next`, and the next stage is a waiting stage, set on the next stage row:

- `wait_started_at = now()`
- `wait_target_date = addWorkingDays(now(), sla)` (client-side helper; skips Sat/Sun; no bank-holiday calendar for v1)
- `workflow_status = 'in_progress'` (already the case today)

Applied in both single-site completion (`src/lib/wp/completeStage.ts`) and the bulk RPC (`bulk_complete_stage_and_assign_next`).

## UI — WaitingStageCell

New `src/components/wp/WaitingStageCell.tsx` rendered by `WpMatrixTab.tsx` when the stage is in `WAITING_STAGES` instead of the normal status pill.

Display rules against working days remaining to `wait_target_date`:

- `> warnWorkingDays` remaining → date in the blue used for **In progress** (`bg-blue-500/15 text-blue-700 border-blue-500/30`).
- `<= warnWorkingDays` remaining → same date in the amber used for **Review**.
- Target date passed → same date in the red used for **Blocked**.
- `workflow_status = 'done'` → date in the green used for **Done** with a check.

The date is a button. Click opens a Popover with three actions:

1. **Edit date** — inline date input (shadcn datepicker), saves `wait_target_date`.
2. **Received** — opens the existing `StageDetailDialog` "Mark Done" flow so the mandatory next-recipient picker still fires and routes to PoC Quote via the current `completeStage` logic. No parallel code path.
3. **Delayed** — opens a small dialog requiring:
   - Reason (textarea, required — Save disabled until non-empty).
   - New expected date (date input, required, defaults to target + 5 working days).
   Saving writes `wait_delay_reason`, `wait_delay_logged_at`, updates `wait_target_date` to the new date, and appends an entry to `project_activity` for audit. Does not complete the stage.

Bulk selection: the existing floating bar keeps working for waiting stages; "Done" continues to mean Received (same handoff), and the bulk status dropdown hides Review/Blocked for waiting-stage columns since those states aren't meaningful here.

## Tasks page

`WpTasksTab.tsx` currently lists open stage rows for the current user. For waiting-stage rows, show the target date + colour in place of the status pill so the escalation is visible from the Tasks view too. No new task entities.

## Verification (Playwright)

Before treating as final, drive the preview on a Rutger Place-style site currently in Awaiting PoC Offer:

1. Confirm the cell renders the target date in blue/amber/red based on working days remaining.
2. Open the dropdown, click **Delayed**, confirm Save is disabled with an empty reason, then filled reason + new date saves and the cell re-renders against the new target.
3. Open the dropdown, click **Received**, confirm the existing next-recipient picker appears and completing it advances the site to **PoC Quote** with the assigned recipient (same flow as today).

Screenshots at each step.

## Technical notes

- Working-day math: pure client helper `addWorkingDays` / `workingDaysBetween` in `src/lib/wp/workingDays.ts`. No holidays for v1.
- Timezone: treat `wait_target_date` as a plain calendar date (UK); compare against `new Date()` truncated to date.
- Realtime: existing `site_stage_status` subscriptions in `WpMatrixTab` already cover the new columns — no extra wiring.
- No changes to notifications trigger logic; Received reuses the current path.

## Files touched

- Migration: add `wait_started_at`, `wait_target_date`, `wait_delay_reason`, `wait_delay_logged_at` to `site_stage_status`.
- `src/lib/wp/waitingStages.ts` (new) — stage config map + helpers.
- `src/lib/wp/workingDays.ts` (new).
- `src/lib/wp/completeStage.ts` — seed waiting-stage fields on handoff.
- `supabase/functions` / migration for `bulk_complete_stage_and_assign_next` — same seed logic.
- `src/components/wp/WaitingStageCell.tsx` (new).
- `src/components/wp/WaitingStageDelayDialog.tsx` (new).
- `src/pages/wp/tabs/WpMatrixTab.tsx` — render `WaitingStageCell` for stages in `WAITING_STAGES`.
- `src/pages/wp/tabs/WpTasksTab.tsx` — surface waiting-stage date + colour.

## Out of scope

- Bank-holiday calendar.
- Applying the waiting type to Survey PO Gate / Build Design PO Gate / ICP PO (per your answer — Awaiting PoC Offer only for now; the config map makes adding them a one-liner later).
- Any change to how PoC Quote or downstream stages behave.
