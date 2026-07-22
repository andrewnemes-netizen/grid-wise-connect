## Problem

The bulk "Mark Done" RPC fails with `type "stage_key" does not exist`. The actual Postgres enum types on `public.site_stage_status` are `public.site_stage_key` (stage) and `public.site_stage_state` (workflow status). The RPC I shipped cast to `stage_key` / `stage_status`, which don't exist.

## Fix

Replace the RPC with a corrected version in one migration:

- `p_stage::stage_key` → `p_stage::public.site_stage_key`
- `'done'` / `'in_progress'` casts → `::public.site_stage_state`
- Everything else (suppression flag, aggregated single-notification-per-recipient logic, ON CONFLICT targets, GRANTs) stays as-is.

No client changes needed — `BulkStageDoneDialog.tsx` already calls `bulk_complete_stage_and_assign_next` with the correct arguments.

## Verify

Retry a bulk Mark Done on the Pre-Con Flow page for 2+ sites and confirm:
1. All selected sites move to Done and the next stage is opened for the chosen recipient.
2. The recipient receives exactly one aggregated notification ("Next up: <stage> — N sites in <WP>"), not one per site.