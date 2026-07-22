## Plan: Pre-Con Progress — Survey Quote & PO Gate

### 1. Add new regular stage: "Issue Survey / Design Quote"
- Insert `issue_survey_design_quote` into the `site_stage_key` enum after `client_site_selection`.
- Update `src/lib/wp/stageStatus.ts` pipeline order so the new stage sits between **Client Site Selection** and **Survey PO Gate**.
- This is a normal status stage (Not Started / In Progress / Review / Blocked / Done) and must enforce the existing mandatory next-stage recipient selection when marked Done.
- Update the `bulk_complete_stage_and_assign_next` RPC routing CASE so completing `client_site_selection` routes to `issue_survey_design_quote`, and completing `issue_survey_design_quote` routes to `survey_po_gate`.

### 2. Convert "Survey PO Gate" into a date + working-day counter
- Add columns to `site_stage_status`:
  - `po_gate_quote_issued_at timestamptz`
  - `po_gate_target_days int` (default 10, configurable per stage config)
- When `issue_survey_design_quote` is marked Done, seed `po_gate_quote_issued_at = now()` on the site's `survey_po_gate` row.
- Create `src/lib/wp/poGateCounter.ts` helpers:
  - `workingDaysSince(date)` — counts Mon-Fri excluding UK bank holidays if available, otherwise weekends only.
  - `formatPoGateDisplay(quote_issued_at, current_date)` — returns "14 Jul + 6".
- Create `PoGateCounterCell.tsx`:
  - Renders the quote-issued date plus working-day count.
  - Color escalation based on configured threshold (e.g. blue ≤ 50% SLA, orange ≤ 100% SLA, red > SLA).
  - Click opens a dropdown/popover with **Edit date**, **Received**, and **Delayed** actions.

### 3. Received / Delayed actions for Survey PO Gate
Mirror the Awaiting PoC Offer behaviour:
- **Received**: marks `survey_po_gate` as Done, requires mandatory next-stage recipient selection for `survey_allocation`, and routes the handoff.
- **Delayed**: requires a mandatory reason/commentary, logs `wait_delay_reason` and `wait_delay_logged_at`, and allows the user to set a revised target/expected PO date. The stage stays in its current state and the counter continues from the revised date.
- Reuse `WaitingStageDelayDialog.tsx` (or a generic delay dialog) for the reason + revised date capture.

### 4. Update task/notification routing
- Ensure completing `survey_po_gate` via Received creates one aggregated task/notification for the next stage (`survey_allocation`) assigned to the selected recipient(s).
- Ensure the bulk update path supports marking `survey_po_gate` as Received with a single aggregated notification.

### 5. Verification
- Test on a site currently in or near `client_site_selection`:
  1. Mark **Client Site Selection** Done → confirm next stage becomes **Issue Survey / Design Quote**.
  2. Mark **Issue Survey / Design Quote** Done → confirm **Survey PO Gate** appears with "14 Jul + 0" and starts counting working days.
  3. Confirm the counter increments only on working days.
  4. Confirm the dropdown shows Edit / Received / Delayed.
  5. Confirm **Received** routes to **Survey Allocation** with mandatory recipient selection.
  6. Confirm **Delayed** is blocked without a reason and logs the revised date.

### Files expected to change
- Supabase migration: add enum value + columns + update RPC routing.
- `src/lib/wp/stageStatus.ts`
- `src/lib/wp/completeStage.ts`
- `src/lib/wp/poGateCounter.ts` (new)
- `src/components/wp/PoGateCounterCell.tsx` (new)
- `src/pages/wp/tabs/WpMatrixTab.tsx`
- `src/pages/wp/tabs/WpTasksTab.tsx`
- `src/components/wp/StageDetailDialog.tsx`
- `src/components/wp/BulkStageDoneDialog.tsx` / `src/lib/wp/completeStage.ts` bulk helpers