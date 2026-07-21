# Fix: Recipient on Done → next stage, not the completed one

## Problem
In `StageDetailDialog`, marking Stage N as **Done** with a recipient writes the recipient onto Stage N's own `site_stage_status` row. The `notify_stage_owner_assignment` trigger then notifies them against Stage N (which is closed). It should instead attach that recipient to Stage N+1 and open it as `in_progress`.

## Next-stage resolution

Add a pure helper `getNextStages(stage): StageKey[]` in `src/lib/wp/stageStatus.ts` that walks the pipeline correctly, including the parallel branch after Client Site Selection / Survey.

Rules:
- Same-track sequential move within `common`, `build`, `connections`.
- **Branch point**: after `survey_completed` (end of common), next = **both** `build_design_po_gate` **and** `icp_po` (Build + Connections tracks run concurrently).
- Terminal stages (`build_handover_gate`, `connections_handover_gate`) have no next.

## Dialog changes (`StageDetailDialog.tsx`)

- When user sets **status = Done**, the recipient picker relabels from "Who does this stage go to next?" to **"Assign {Next Stage Label} to:"**.
- If the completed stage branches (survey_completed), render **two pickers**: one for `Build Design PO Gate` recipient, one for `ICP PO` recipient. Either can be left empty (only branches with a recipient get opened + notified). At least one recipient required to allow save.
- For terminal stages with no next, show a note "Final stage — no downstream task" and allow Done without a recipient.

## Save logic

Replace the current single-row upsert with a small transaction (two upserts, sequential):

1. **Stage N**: upsert with `workflow_status='done'`, `actual_finish_date = today if empty`, and **clear** `owner_id`, `recipient_user_ids`, `recipient_contact_ids` so no open task remains on it.
2. For each next stage returned by `getNextStages(N)` **that has a picked recipient**:
   - Upsert `site_stage_status` row for `(site_id, next_stage)` with:
     - `workflow_status = 'in_progress'` (only if current status is `not_started`; else preserve existing)
     - `owner_id` = single-recipient value (or null for multi-recipient stages)
     - `recipient_user_ids`, `recipient_contact_ids` = picked recipients
     - `actual_start_date = today if empty`
   - The existing `notify_stage_owner_assignment` trigger fires on this row and creates the notification against Stage N+1 — no trigger change needed.

Non-Done saves (In progress / Review / Blocked / Not started) keep today's behaviour: write recipients on the current row.

## Test case (before rollout)

Rutger Place site, `PoC Application` stage:
1. Open dialog, set status = **Done**, pick recipient X.
2. Save.
3. Verify: PoC Application row shows Done with no assignee/recipient; Awaiting PoC Offer row shows In progress with X as owner; notification row exists for X with `stage = 'poc_offer_awaiting'` (screenshot confirmation in Playwright).

Only after Rutger Place passes: no other stages need code changes — the same helper covers them.

## Technical notes

- Files touched: `src/lib/wp/stageStatus.ts` (add helper), `src/components/wp/StageDetailDialog.tsx` (UI + save).
- No DB migration required — trigger already keys off the row it fires on.
- `MULTI_RECIPIENT_STAGES` continues to gate whether `owner_id` is populated on the next row.
