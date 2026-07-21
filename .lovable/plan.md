# Pre-Construction Pipeline: stage restructure + owner-required-on-Done

## Confirmed current state
- `site_stage_key` enum still contains the legacy 8 values (survey, design, dno, permit, civils, electrical, meter, handover) and the matrix UI renders those columns. The restructuring to the 15 agreed stages has **not** happened yet.
- `site_stage_status` table already has an `owner_id` column and the `notify_stage_owner_assignment` trigger. The edit modal today lets the user save "Done" with `owner_id = NULL` — nothing blocks it.

## Scope (single vertical slice, one stage first)

Before applying globally, we ship it end-to-end for **one stage** — "PoC Quote Review" — so you can visually confirm the "Done" button is blocked until a recipient is selected. Once approved, the same modal is reused for every stage without further UI work.

## 1. New pipeline definition

New enum values, in this order (values in DB use snake_case; labels are what users see):

```text
 1. intake                    Site/WP Intake
 2. poc_application           PoC Application
 3. poc_offer_awaiting        Awaiting PoC Offer
 4. poc_quote_review          PoC Quote Review
 5. poc_quote_sent            PoC Quote Sent to Client
 6. client_site_selection     Client Site Selection
 7. survey_po_gate            Survey PO Gate
 8. survey_allocation         Survey Allocation
 9. survey_completed          Survey Completed
        ├── Build track ──────────────────────────
10. build_design_po_gate      EV Build Design PO Gate
11. build_quote_design        EV Build Quote & Design Production
12. build_quote_sent          EV Build Quote Sent to Client
13. build_handover_gate       Build Handover Gate           (multi-recipient)
        └── Connections track ────────────────────
14. icp_po                    ICP PO Awaited/Received
15. connections_handover_gate Connections Handover Gate     (multi-recipient)
```

Design Review is treated as part of `build_quote_design` completion and its "Done" action is the multi-recipient gate handoff into `build_handover_gate`.

## 2. Database changes (single migration)

- Add all 15 values to `site_stage_key` enum (keep legacy values so existing rows don't break; mark them deprecated in `stage_definitions`).
- Extend `site_stage_status`:
  - `recipient_user_ids uuid[]` — for multi-recipient gates.
  - `recipient_contact_ids uuid[]` — external contacts (references `public.contacts`).
  - `suggested_owner_role app_role` on `stage_definitions` (populated per stage; used only to pre-select, never to auto-assign).
- Constraint: `CHECK (workflow_status <> 'done' OR owner_id IS NOT NULL OR array_length(recipient_user_ids,1) >= 1 OR array_length(recipient_contact_ids,1) >= 1)` — the DB enforces that a `done` row must have at least one recipient recorded.
- Seed `stage_definitions` rows for the 15 new stages with `requires_owner=true`, `multi_recipient=true` for the two handover gates + design review, and `suggested_owner_role` per stage.
- Extend `notify_stage_owner_assignment` trigger to fan-out to every recipient in the arrays (not just `owner_id`) and to fire on `workflow_status → done` transitions as well as on assignment.

Legacy 8 rows: hidden from the new matrix but preserved for audit; a follow-up cleanup migration can archive them.

## 3. Frontend changes

### `src/lib/wp/stageStatus.ts`
- Replace `STAGES` array with the 15 new stages in order.
- Add `MULTI_RECIPIENT_STAGES = new Set([...])` and `SUGGESTED_OWNER_ROLE` map.
- Add a `TRACK` field so the matrix can render the branching (`common` | `build` | `connections`).

### `src/pages/wp/tabs/WpMatrixTab.tsx`
- Render the 9 common stages, then two grouped column blocks (Build / Connections) with a small header spanning each group so the branching is visible.
- Rename tab heading — already "Pre-Construction Pipeline".

### `src/components/wp/StageDetailDialog` (extracted from `WpMatrixTab.tsx`)
This is the piece you'll review first. New behaviour:
- New `RecipientPicker` component with:
  - Searchable dropdown of WP team + org members (internal users), same query source as today.
  - Role filter chip row (Planner, Designer, PM, etc.).
  - "Add external contact" button opening a popover that lets the user pick from `public.contacts` or create a new external contact inline (name + email + role).
  - Single-select by default; multi-select chip UI when the stage is in `MULTI_RECIPIENT_STAGES`.
- On modal open:
  - If the stage has a `suggested_owner_role`, pre-select the first matching WP team member (visibly marked "Suggested — confirm or change").
  - If none found, leave empty.
- Save button (`Save`) rules:
  - If `status === 'done'` and no recipient selected → button is **disabled** with an inline red helper "Pick who this goes to next before marking Done."
  - Same rule for any gate stage regardless of status when the user tries to advance it.
- On save: writes `owner_id` (single) or `recipient_user_ids` / `recipient_contact_ids` (multi), and the trigger sends notifications immediately. No separate "Notify" button.

### Inline row control in the matrix
The status dropdown in each cell can still set non-terminal statuses (`in_progress`, `review`, `blocked`) directly. Choosing `done` from the inline dropdown opens the modal instead of writing, so the recipient requirement can't be bypassed.

## 4. Review checkpoint

I will ship the migration + the new modal wired to a single stage (`poc_quote_review`) first and stop. You then:
1. Open the edit modal for that stage on any site.
2. Try to save `Done` with recipient empty — Save is disabled.
3. Pick a recipient, save — notification fires to that user.

Once you confirm, I roll the same modal out to all 15 stages and remove the legacy 8 columns from the matrix.

## Technical notes
- Multi-recipient notifications: `notify_stage_owner_assignment` will loop `unnest(recipient_user_ids)` and insert one `notifications` row per user; external contacts trigger a `send-transactional-email` invocation via a `pg_net` call already used by `send-site-survey`.
- The `CHECK` constraint plus the disabled Save button gives us defense-in-depth: even a direct API call can't record `done` without a recipient.
- Legacy `site_stage_status` rows remain readable so the audit tab and existing links don't 404; they just don't appear in the new pipeline columns.
