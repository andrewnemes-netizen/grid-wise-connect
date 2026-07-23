## Goal
Swap `src/pages/admin/RateCardDetail.tsx` for the uploaded revision, which restructures the rate-card editing UI.

## Changes
- Overwrite `src/pages/admin/RateCardDetail.tsx` with the contents of `user-uploads://RateCardDetail.tsx` (default export renamed to `RateCardDetailPage` — App.tsx imports the default so no route change needed).

## What this changes vs. the current page
- Adds collapsible category groups with a header row per group.
- Adds inline editing of `description` and `unit` (previously read-only).
- Adds a version switcher `<select>` listing all sibling versions of the same rate card.
- Approve button is disabled while any item still needs pricing (instead of just showing a warning).
- Removes the productivity-per-day and default-crew-size columns.
- Removes the draft-delete (trash) button.
- Removes the in-page `hasRole("admin")` guard (admin gating is already enforced by the `/admin` parent tab that links here; the route in `App.tsx` should be confirmed to sit behind the same admin gate).

## Notes / things to confirm
- Confirm you're happy to drop the **productivity / crew** editing and the **delete draft** action from this page. If either is still needed, say so and I'll keep them.
- The uploaded file uses `as any` casts on Supabase table names; that's fine but slightly looser typing than the current file.
