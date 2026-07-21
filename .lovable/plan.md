# Pre-Construction Pipeline Restructure

Replaces the current Delivery Matrix with a stage-based pipeline. Existing modules stay untouched: Survey Allocation, Survey Form, PoC Application designer notification, PoC Estimate engine, EV Build Estimate engine.

## Key rule on ownership

No stage has a hard-coded default owner. Every stage that requires action exposes an **owner picker** at the moment the site enters that stage. The user selecting the owner sees a role-filtered list (e.g. Technical Manager / Planning and Connections Manager for EV Build Quote Production; Internal / External Designer for Design Review Gate). Nothing auto-assigns silently. Notifications only fire once an owner is picked.

## Pipeline stages (per site, per WP)

```text
1  Intake                        (owner picker)
2  PoC Application               (existing send-for-poc flow)
3  PoC Return                    (branch: Type A direct handover | Type B into commercial)
   ├─ 3a  Connections Handover Gate       (owner picker)   [Type A track]
   └─ 3b  PoC Estimate                    (existing engine)  [Type B track]
4  Client Decision on PoC Estimate        (existing)
5  Survey Allocation             (existing module, unchanged)
6  Survey Return + Review         (owner picker for reviewer)
7  EV Build Quote Production      (owner picker)
8  EV Build Quote Sent to Client  (owner picker — whoever produced it can be re-picked)
9  Client Decision on EV Build Quote
10 EV Build Design Production     (owner picker)   ┐ concurrent
11 Design Review Gate             (owner picker)   │ track A
12 Permits / RAMS / TM readiness  (existing)       ┘
13 Long-lead procurement          (owner picker)   ┐ concurrent track B
14 Materials readiness gate       (owner picker)   ┘
15 Delivery Handover Gate         (owner picker)   ← independent from Connections Handover Gate
```

Tracks 10–12 and 13–14 run in parallel. The WP view renders **two independent gate columns** (Connections Handover, Delivery Handover) so a single linear status is never implied.

## Data model changes

- Extend `stage_definitions` with the new pipeline stages and a `requires_owner` flag.
- Add `owner_user_id`, `owner_role` and `owner_assigned_at` columns to `site_stage_status` (nullable — a stage with no owner yet is "unassigned").
- Add `allowed_owner_roles TEXT[]` on `stage_definitions` to drive the role filter in the owner picker per stage.
- No changes to `site_surveys`, `site_estimates`, `poc_estimates`, `estimates`, or design tables.

## UI changes

- Replace the current Delivery Matrix grid with a **Pre-Construction Pipeline** view that shows both tracks side-by-side per site.
- New `StageOwnerPicker` component: opens when a site enters a stage that has `requires_owner=true` and no owner set. Lists users filtered by `allowed_owner_roles` for that stage. Selecting an owner records to `site_stage_status`, writes to `site_stage_status_audit`, and fires the existing notification pipeline to that user.
- Two-column handover header on the WP page: **Connections Handover** and **Delivery Handover**, each with their own gate state independent of the other.
- Change events (owner reassignment, stage advance, gate pass) always fire a notification to the new owner and log to audit — no silent status updates.

## Notifications

- On stage entry with owner selected → notify picked owner with deep-link to the site's stage action.
- On owner reassignment → notify new owner; original owner gets an "unassigned" notice.
- On gate pass → notify next stage's picked owner (or, if none, notify the WP owner that an owner needs picking).

## Out of scope / do not touch

- Survey Allocation module, Survey Form, PoC Application designer notification.
- PoC Estimate entity/engine, EV Build Estimate entity/engine, their billing structures.
- Existing notification templates for the above.

## Technical details

- `stage_definitions` new rows use `code` slugs: `intake`, `poc_application`, `poc_return_branch`, `connections_handover_gate`, `poc_estimate`, `poc_client_decision`, `survey_allocation`, `survey_review`, `evbuild_quote_production`, `evbuild_quote_sent`, `evbuild_client_decision`, `evbuild_design_production`, `design_review_gate`, `precon_readiness`, `long_lead_procurement`, `materials_readiness`, `delivery_handover_gate`.
- `allowed_owner_roles` populated per stage; picker queries `user_roles` joined to `profiles` filtered to WP team membership.
- `site_stage_status` unique key remains `(site_id, stage)`; upserts keep the current `wp_sites_ensure_stage()` behaviour.
- Concurrent tracks handled by computing gate readiness independently in `v_wp_site_precon_status` (extend, don't fork) — one boolean per gate rather than a single overall stage.
- All existing edge functions that advance stages (`notify-survey-submitted`, `send-for-poc`, ClientDecisionDialog handlers) continue to write to `site_stage_status`; they just no longer set an owner — the picker owns that.
