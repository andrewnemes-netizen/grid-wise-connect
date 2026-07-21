## Cause

For single-recipient stages, the save writes both `owner_id = userIds[0]` and `recipient_user_ids = userIds`. The `notify_stage_owner_assignment` trigger then fires twice for the same user: once from the owner branch ("Assigned: …") and once from the recipient-array loop ("Next up: …").

## Fix

Update `notify_stage_owner_assignment` so the recipient-array loop skips any user that is already `NEW.owner_id` (or `OLD.owner_id` when unchanged). One person = one notification per save.

No UI, schema, or other trigger changes.

## Technical detail

Single migration replacing the function. In the `FOR v_uid IN … unnest(NEW.recipient_user_ids)` loop, add `AND u IS DISTINCT FROM NEW.owner_id` to the filter so the owner isn't re-notified as a recipient.
