## Goal

1. Classify every Organisation as **Client**, **Partner**, **Internal** (EcoPower), or **Other** (with a free-text label).
2. Make **all Internal-org members** auto-selectable across Programmes and Work Packages — stage owners, recipients, and task assignees — without needing a `wp_team` row.

## Data model

Add to `public.organisations`:

- `org_type text not null default 'client'` with `CHECK (org_type in ('client','partner','internal','other'))`
- `org_type_other text` (only populated when `org_type = 'other'`, used as the display label)

Backfill:

- `EcoPower` → `internal`
- `Char.gy`, `Connected Kerb`, `Urban Fox` → `client`

No changes to `org_members`, `wp_team`, or role tables. Internal reach is derived by joining `profiles → org_members → organisations` where `org_type = 'internal'`.

## Admin → Organisations UI (`OrgManagement.tsx`)

- "New Organisation" dialog: add a **required** `Type` select (Client / Partner / Internal / Other). When `Other` is picked, show a required "Type label" text input; store into `org_type_other`.
- Org list: show a coloured `Badge` for the type (e.g. Internal = primary, Client = secondary, Partner = outline, Other = shows the free-text label).
- Inline edit action on each row to change the type later (same dialog fields).
- Validation blocks save when type is missing, or when `Other` has no label.

## Pickers — auto-include Internal members

Update `StageOwnerPicker.tsx` and `RecipientPicker.tsx` to build their candidate list as the **union of**:

1. `wp_team` members of the current WP (kept as-is, preserves team_role badge)
2. Every profile that belongs to an org where `org_type = 'internal'`

Deduplicate by `user_id`. Internal-only entries get an `Internal` badge instead of `team_role`. Ordering: WP team first, then internal directory alphabetically. Search stays client-side.

## Task assignees

`TaskBoard` / task-assignment dropdowns currently filter to WP members. Apply the same union rule so any EcoPower user can be assigned to a Programme/WP task without being added to `wp_team` first.

## Notifications / triggers

No changes needed — `notify_stage_owner_assignment()` fires on `site_stage_status.owner_user_id`; the picker just widens who can be chosen.

## Out of scope

- No changes to sign-up, invites, or the `create-org-user` flow.
- No changes to RLS on Programmes/WPs — Internal users already have platform-wide access via existing role policies.
- Client/Partner members remain scoped to their org (no widening of their reach).

## Technical notes

- Migration: `ALTER TABLE public.organisations ADD COLUMN org_type text ...; ADD COLUMN org_type_other text; UPDATE ...; ADD CHECK ...;` — grants unchanged (column-level, table already granted).
- New helper `useInternalDirectory()` hook returning `{ user_id, full_name, email }[]` used by both pickers and the task assignee dropdown, cached via React Query.
- Display label helper: `orgLabel(org) = org.org_type === 'other' ? org.org_type_other : capitalise(org.org_type)`.