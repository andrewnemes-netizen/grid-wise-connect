# 05 — Role-Based Acceptance Criteria

Given/When/Then format. Each phase must pass every row before proceeding.

## Phase 0
- **Given** the docs pack, **when** reviewed by product/delivery/engineering leads, **then** all 8 docs are signed off.

## Phase 1 — Data foundation
| Role | Given | When | Then |
|---|---|---|---|
| Admin | flag off | app loads | UI identical to today; no new tables visible |
| Admin | flag on | opens WP shell | new sidebar renders, RLS lint clean |
| Engineer | new schema deployed | inserts row into `partners` | RLS scopes to own org |
| Partner | signs in with allocation | queries `sites` | sees only allocated sites |
| Client | signs in | queries `dno_offers` | sees only own org's offers |
| DevOps | rollback SQL | runs on UAT snapshot | schema restored, no data loss |

## Phase 2 — WP workspace
- Staff with flag on can complete every current workflow inside `/wp/:id`.
- Deep link `/wp/:id/site/:siteId` opens drawer with SiteDetail panels.
- Flag off → zero UI diff vs today.

## Phase 3 — Portfolio import
- 10,000-row XLSX imports in <10 min with realtime progress.
- ≥99.5% row success rate on clean input.
- Rollback via `import_created_records` restores state to pre-approval.
- Batch Connect run enqueues sites through `score-sites-batch`.

## Phase 4 — Estimating
- Award (`estimates.status → awarded`) freezes commercial baseline in `wp_estimate_variations`.
- Each lens (`internal`/`client`/`partner`/`dno`) renders only permitted columns and rows.
- Rate-card version pinned per estimate; upgrading card creates supersede line.
- Connected Kerb XLSX import round-trips: export → import → identical rows.

## Phase 5 — Grid study & design
- Design approval fires once, is idempotent on re-approval, sets `wp_procurement_unlocked=true`.
- No duplicate `projects` row created for a WP with an existing `delivery_project_id`.
- Sites in submission move to `ready_for_delivery` and appear in delivery matrix.

## Phase 6 — Programme & delivery
- Task with unmet gate remains `blocked`.
- Dependency cycle blocked at write time.
- Programme template application creates the exact expected tasks and milestones.

## Phase 7 — Resources
- Double-booking a resource returns validation error citing existing assignment.
- Utilisation dashboard totals equal sum of assignment units per week.

## Phase 8 — Commercial control
- `v_po_commitments`: `committed + remaining = order_value` at all times.
- Variation approval updates `v_wp_commercial_position` in ≤1 refresh cycle.
- Actual cost import maps to correct PO line with reconciliation report.

## Phase 9 — Construction control
- Site cannot enter `mobilised` unless RAMS, permit, and TM plan present.
- Photo uploaded with EXIF geo pins on map within the site boundary buffer.
- Inspection failure creates snagging items with severity.

## Phase 10 — Commissioning & handover
- Site cannot enter `practical_completion` with open critical snags.
- Site cannot enter `handover_complete` without: all test certs, PC signed, O&M pack uploaded.
- Handover pack PDF renders in <30 s for a 20-site WP.

## Phase 11 — Partner portal
- Partner cannot read any row outside allocation (pentest: 0 leaks).
- Partner commercial views obey partner lens (no cost, no margin).
- Partner upload to `design_submissions` creates row with `submitted_by=partner_id`.

## Phase 12 — Reporting & assistant
- Client PDF pack omits all internal cost fields.
- DNO pack omits all commercial values.
- MCP `list_wp_sites` called by partner returns only allocated sites.
- Write-tool calls audited in `audit_log` with actor + before/after.

## Phase 13 — Legacy retirement
- Old routes 301 to WP-shell equivalents.
- No dead links in navigation or emails.
- `gridwise_os_shell` flag removed; app boots on new shell only.

---
**Sign-off:** Product ☐  Delivery ☐  Engineering ☐