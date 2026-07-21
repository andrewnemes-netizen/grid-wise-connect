# Clients dashboard layer in Programmes

Introduce a new top-level view inside Programmes that lists **Clients** with their programme counts. Clicking a client drills into the existing programmes-and-work-packages view, scoped to that client.

## Navigation flow

```text
Programmes (/programmes)                ← NEW: clients dashboard
   └─ Client card / row                 ← click
        Programmes for {Client}          ← existing DeliveryProgrammes UI, filtered
           └─ Programme → Work Packages  ← unchanged
```

Sidebar "Programmes" item points at `/programmes` (the new clients dashboard). The current `/delivery` route stays working for backwards-compatibility and renders the same content as `/programmes/:clientId` when a client filter is passed.

## Data model (no schema changes)

- Clients are already modelled as `organisations` with `org_type = 'client'` (established earlier this project).
- `programmes.account_id` currently points at `accounts`, not `organisations`. Two options for linking programmes → client:
  1. Match `accounts.name` to `organisations.name` (name-based join) — zero migration, works with current data.
  2. Add `programmes.client_org_id uuid references organisations(id)` and backfill from account name — cleaner long-term.
- Recommend **Option 1 for this slice** (display-only aggregation). We can add the FK later without changing UI.

Include an "Unassigned" bucket for programmes whose `account_id` doesn't map to a client organisation.

## New page: `src/pages/ClientsDashboard.tsx`

Route: `/programmes` (also add `/clients` alias).

- Fetch `organisations` where `org_type = 'client'`.
- Fetch all `programmes` + `accounts(name)` and group by matched client.
- Render a grid of client cards, each showing:
  - Client name + type badge
  - Programme count, active WP count, total site count (best-effort aggregates)
  - "View programmes →" link to `/programmes/client/:clientId`
- Include an "Unassigned programmes" card if any exist.
- Search box to filter clients by name.

## Scoped programmes view

Route: `/programmes/client/:clientId` renders the existing `DeliveryProgrammes` component with a `clientId` prop/param that filters the programmes list to that client (name-matched to the client's organisation). Breadcrumb: `Programmes / {Client Name}`.

`/delivery` continues to render the unfiltered `DeliveryProgrammes` for now to avoid breaking existing links.

## Sidebar

Update `src/components/AppSidebar.tsx` "Programmes" entry to link to `/programmes`.

## Files touched

- `src/pages/ClientsDashboard.tsx` — new
- `src/pages/DeliveryProgrammes.tsx` — accept optional `clientId` route param, filter programmes when present, add breadcrumb
- `src/App.tsx` — add `/programmes`, `/programmes/client/:clientId`, `/clients` routes
- `src/components/AppSidebar.tsx` — point Programmes at `/programmes`

## Out of scope

- No changes to work package pages or the Pre-Con Flow.
- No schema migration; can add `programmes.client_org_id` in a follow-up if you want strict FK linkage.
