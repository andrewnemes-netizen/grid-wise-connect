## Goal
Support mixed socket ratings per Site via repeating Socket Groups, drive **phase-aware** load-balanced assignment (single-phase sockets go to one phase; three-phase sockets split evenly across all three), and surface both in the Site detail view and PoC designer notification. Existing WP/Site structure otherwise untouched.

## 1. Socket phase model (foundational correction)

A socket's phase count is a property of the rating, not a user choice. Defaults, editable per group:

| Power rating | Phases | Per-phase load |
|---|---|---|
| ≤ 7.4 kW (7, 7.4) | 1-phase | full rating on one phase |
| 11 kW | 3-phase | rating ÷ 3 (≈ 3.67 kW/phase) |
| 22 kW | 3-phase | rating ÷ 3 (≈ 7.33 kW/phase) |
| ≥ 25 kW (50, 150, 350) | 3-phase | rating ÷ 3 |

Stored as `phases` (1 or 3) on each socket group with a sensible default derived from `power_rating_kw`; user can override.

## 2. Data model — `site_socket_groups`

New child table (canonical source of truth for sockets). Legacy `sites.socket_count` and `sites.proposed_kw` remain in place but become **derived** — populated from the sum of the groups via a trigger so existing map/cost logic keeps working.

```
public.site_socket_groups
  id uuid pk
  site_id uuid fk sites(id) on delete cascade
  quantity int > 0
  power_rating_kw numeric > 0    -- e.g. 7, 22, 50
  phases smallint check (phases in (1,3))   -- default from rating
  sort_order int default 0
  created_at, updated_at
```

- GRANTs to `authenticated` / `service_role`; RLS mirrors `sites` via `EXISTS` join.
- Trigger recomputes `sites.socket_count = SUM(quantity)` and `sites.proposed_kw = SUM(quantity * power_rating_kw)`.
- One-time backfill: existing sites → single group `(quantity = socket_count, power_rating_kw = proposed_kw / socket_count, phases = default-from-rating)`.

## 3. Shared helper — `src/lib/wp/socketPhaseBalance.ts`

Pure TS, unit-tested.

- `expandGroups(groups) → Socket[]` where `Socket = { kw, phases }` — `[{qty:3,kW:7,phases:1},{qty:1,kW:22,phases:3}]` → `[{7,1},{7,1},{7,1},{22,3}]`.
- `balancePhases(sockets) → { assignments, loads: {L1,L2,L3}, totalKw, imbalancePct }`
  - Sort sockets by kW descending.
  - **3-phase socket**: add `kw/3` to each of L1, L2, L3 (no choice — it draws on all three).
  - **1-phase socket**: assign to the phase with the lowest current cumulative load (ties → lowest index).
  - `assignments` records, per phase, the sockets contributing (with a marker for shared 3-phase entries).
- `summariseGroups(groups) → "3× 7kW (1φ), 1× 22kW (3φ)"`.

Worked example (matches your correction): `3× 7kW single-phase + 1× 22kW three-phase` →
- 22 kW splits into 7.33 kW on each of L1/L2/L3.
- 7 kW sockets go one per phase (round-robin by lowest load).
- Result: L1 = 14.33 kW, L2 = 14.33 kW, L3 = 14.33 kW. Total = 43 kW. Perfectly balanced.

## 4. CSV import — `CsvIntakePanel.tsx`

Accept multiple socket-group rows per site, linked by `site_id` **or** `site_address` (trimmed, case-insensitive).

- New optional columns: `socket_qty`, `socket_kw`, `socket_phases` (defaults from rating if omitted).
- Aliases: `quantity`, `power_rating`, `kw_each`, `phase_count`.
- Group rows by site key → `socket_groups: [{quantity, power_rating_kw, phases}]`.
- Backward compatible: rows with only `proposed_kw` still produce a single group with default phases.
- Preview shows the group breakdown per site.

## 5. Site detail view — `src/pages/SiteDetail.tsx`

New **Sockets & Phase Balance** card:

- Editable Socket Groups list (add / remove / edit qty, kW, phases-with-smart-default).
- Live-computed panel:
  - Total sockets, Total Connected Load (kW), group breakdown string.
  - Per-phase block for L1 / L2 / L3 showing the load (kW) and contributing sockets as chips (e.g. `7.33kW (from 22kW/3φ)`, `7kW`).
  - Imbalance %.
- No changes to any other card.

## 6. PoC validation + notification wiring

- `pocValidation.ts`: replace socket_count/proposed_kw checks with `socket_groups.length > 0 && every(qty>0 && kw>0 && phases∈{1,3})`. Missing-field label: "Socket Groups (quantity + power rating)".
- `get_sites_for_poc` RPC: also return `socket_groups` JSON array.
- `SendForPocDialog.tsx`: readiness panel shows group breakdown + phase balance summary; blocks if any site has no groups.
- `WpSiteRegisterTab.tsx`: pass `socketGroups`, `phaseBalance`, `totalKw` into the email payload.

## 7. Designer notification template — `poc-assignment.tsx`

Replace the two rows "Number of Sockets" / "Socket Power Rating" with a **Sockets & Phase Balance** block per site:

- Total Sockets: `4`
- Socket Groups: `3× 7kW (1φ), 1× 22kW (3φ)`
- Total Connected Load: `43 kW`
- Phase L1: `14.33 kW` — `[7kW, 7.33kW from 22kW/3φ]`
- Phase L2: `14.33 kW` — `[7kW, 7.33kW from 22kW/3φ]`
- Phase L3: `14.33 kW` — `[7kW, 7.33kW from 22kW/3φ]`

Site ID stays optional. Address, Postcode, Feeder Pillar Lat/Lng unchanged.

## 8. Review gate before go-live

Produce two screenshots for sign-off before anything ships:

1. Site detail view with a mixed-rating site (3× 7kW/1φ + 1× 22kW/3φ) showing the Socket Groups editor and the phase-balance panel.
2. Rendered PoC designer email preview for the same site.

## Out of scope

- WP/Site relationships, stage machine, cost/feasibility engines, map layers — untouched.
- Full three-phase electrical validation (per-phase max current, neutral loading, phase rotation) — this slice is load balancing for designer information only.
