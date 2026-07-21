## Problem

The `notify_stage_owner_assignment` trigger fires when a stage row is inserted/updated (e.g. Mark Done & Notify). It inserts into `public.notifications` using columns `kind`, `title`, `body`, but the real table has `type`, `message`, `link`, `entity_type`, `entity_id` — no `kind`/`title`/`body`. So every save on the matrix errors with `column "kind" of relation "notifications" does not exist`.

## Fix

Recreate the trigger function so the three INSERTs use the actual notifications columns:

- `kind` → `type`
- `title` + `body` → concatenated into `message` (e.g. `Assigned: <stage> — <WP> · <Site>`)
- keep `user_id`, `link`, `entity_type`, `entity_id` unchanged

No schema changes to `notifications`, no UI changes, no other triggers touched.

## Technical detail

Single migration that runs `CREATE OR REPLACE FUNCTION public.notify_stage_owner_assignment()` with the corrected column list for all three inserts (owner assigned, owner unassigned, recipient added). Behaviour otherwise identical.
