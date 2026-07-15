# Gridwise OS — Phase 0 Product Definition

This folder is the sign-off pack for the v3 master plan (`.lovable/plan.md`). Nothing in Phase 1+ starts until every doc here is approved.

| # | Document | Purpose |
|---|---|---|
| 01 | [User Journeys](./01-user-journeys.md) | 12 end-to-end flows across all roles |
| 02 | [Wireframes](./02-wireframes.md) | ASCII wireframes for every new screen |
| 03 | [Data Dictionary](./03-data-dictionary.md) | Every new/changed column, owner, retention |
| 04 | [Permission Matrix](./04-permission-matrix.md) | Full role × table × action grid |
| 05 | [Acceptance Criteria](./05-acceptance-criteria.md) | Given/When/Then per role per phase |
| 06 | [Migration Dependency Map](./06-migration-dependency-map.md) | Phase DAG + rollback order |
| 07 | [UAT Plan](./07-uat-plan.md) | 40 scripted scenarios, 3 test orgs |
| 08 | [Rollback Test Plan](./08-rollback-test-plan.md) | Per-phase rehearsal procedure |

**Sign-off required from:** Product lead, Delivery lead, Engineering lead. Record signatures at the bottom of each doc.

**Scope reminder:** no new Portfolio, Delivery, Estimating, Studies, or Design modules are built. Every UI in Phases 2–13 mounts inside the existing routes or the new WP shell.