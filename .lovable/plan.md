## Problem

On the WP Pre-Con Tasks page, the owner column and "All owners" filter show a UUID prefix like `b62a324c` instead of `Liam French`.

## Root cause

`src/pages/wp/tabs/WpTasksTab.tsx` queries the `profiles` table using the wrong primary-key column:

```ts
.from("profiles").select("id, full_name, email").in("id", userIds)
```

The `profiles` table is keyed by `user_id` (not `id`) — confirmed by `useInternalDirectory.ts`, which correctly uses `user_id, full_name`. The current query returns no matching rows, so `profileById.get(id)` is always `undefined`, and `nameForUser` falls back to `id.slice(0, 8)` — producing `b62a324c`.

A quick DB check confirms the profile exists: `user_id b62a324c-…` → `full_name = "Liam French"`.

## Fix

In `src/pages/wp/tabs/WpTasksTab.tsx`:

1. Change the profiles query to `select("user_id, full_name").in("user_id", userIds)` (drop `email` — the column isn't present on `profiles`).
2. Build `profileById` keyed by `user_id`.
3. Update `nameForUser` to read `p?.full_name` first, then fall back to the id slice.

No other files need changes — `StageOwnerPicker` and `RecipientPicker` already resolve names via `useInternalDirectory` correctly.

## Verification

Reload `/wp/:id/delivery/tasks` — the Owner column and "All owners" filter should show "Liam French" instead of `b62a324c`.
