## Scope
Only the PoC Application stage and the notification sent to the assigned designer. No changes to WP or Site structure beyond one optional field.

## Field mapping (pulled from the Site record automatically)
| Notification field | Source | Required |
|---|---|---|
| Site ID | new `sites.client_site_code` (nullable text) | No — show "not assigned" if blank |
| Site Address | `sites.site_name` | Yes |
| Postcode | `sites.postcode` | Yes |
| Feeder Pillar Latitude | `ST_Y(sites.geom)` | Yes |
| Feeder Pillar Longitude | `ST_X(sites.geom)` | Yes |
| Number of Sockets | `sites.socket_count` | Yes |
| Socket Power Rating (kW) | `sites.proposed_kw / sites.socket_count` (computed per-socket) | Yes — needs both `proposed_kw` and `socket_count` |

## Changes

### 1. Migration
- Add nullable `client_site_code text` to `public.sites` (optional external ID; does not block).
- No other schema change.

### 2. Validation helper
New `src/lib/wp/pocValidation.ts` — `validateSiteForPoc(site)` returns `{ ok, missing: string[] }` checking: `site_name`, `postcode`, `geom` (lat + lng), `socket_count > 0`, `proposed_kw > 0`.

### 3. `SendForPocDialog.tsx`
- Fetch selected sites' fields (`id, site_name, postcode, client_site_code, socket_count, proposed_kw, ST_X(geom), ST_Y(geom)`) via a small RPC or a `sites` select + `st_asgeojson`.
- Show a **readiness panel** listing each selected site with a green tick or red list of missing fields.
- Disable **Assign** / **Assign & email** when any site is invalid; message: "Fix the missing fields on each site before triggering PoC."
- Provide a "Open site" link next to each blocked site so the user can go fill in the gaps.

### 4. `WpSiteRegisterTab.tsx`
- In `bulkSendPoc.mutationFn`, re-run `validateSiteForPoc` server-side of the mutation (defence in depth) — abort with toast if any site fails.
- Build a `sites` array for the email payload with the enriched fields (address, postcode, siteId or `null`, lat, lng, sockets, kwPerSocket).

### 5. Email template `poc-assignment.tsx`
Replace the current `SiteLine { name, postcode, ref }` block with a per-site card showing all seven fields. Layout: heading (Site Address), then a two-column key/value grid: Site ID (or "Not assigned"), Postcode, Feeder Pillar Lat, Feeder Pillar Lng, Sockets, kW per Socket. Preview data updated accordingly.

### 6. Optional (internal designer)
Internal assignment path currently sends no email. Keep as-is; the in-app task's `metadata_json` will carry the same enriched fields so the designer sees them when they open the task.

## Out of scope
- No changes to WP tables, site stage machinery, or the `send-transactional-email` function itself.
- No new columns beyond `client_site_code`.
- No changes to how the PoC task is created — only what data is attached and the validation gate.
