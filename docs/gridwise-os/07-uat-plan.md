# 07 — UAT Plan

## Test environments
3 Supabase test orgs seeded on the UAT project:
1. **Org-Internal** — EcoPower staff (admin, engineer, PM, commercial).
2. **Org-Client** — client-viewer only, one Programme with 3 WPs.
3. **Org-Partner** — one partner company with 2 users, allocated to 1 WP + 8 sites.

## Scripted scenarios (40)

### Phase 1 (5)
1. Deploy migrations end-to-end.
2. Rollback rehearsal restores UAT snapshot.
3. RLS: partner user cannot read unallocated WP.
4. RLS: client user cannot read cross-org data.
5. Feature flag off → app identical to today.

### Phase 2 (4)
6. Open WP shell, navigate all 16 leaves.
7. Site drawer opens from every entry point.
8. Overview KPIs match `v_wp_kpis` values.
9. Deep link resolves after auth redirect.

### Phase 3 (5)
10. Import 10k rows CSV → 0 blocking errors.
11. Import XLSX with duplicates → duplicate step catches all.
12. PDF extraction of a 20-site DNO letter → correct rows.
13. Rollback approved batch → sites removed, portfolio clean.
14. Post-import batch Connect enqueue.

### Phase 4 (5)
15. Import Connected Kerb rate card → new version, pinned to estimate.
16. Estimate → award → variation raised → margin updates.
17. Client lens hides cost columns; partner lens hides margin; DNO lens hides all £.
18. WP-level aggregation sums site estimates + prelims/mob/contingency.
19. Estimate revision creates supersede chain.

### Phase 5 (4)
20. Connect result linked to site; conversion to Design seeds scenario.
21. Design submission → review → approval fires workflow once.
22. Re-approval of same submission is idempotent.
23. DNO offer logged; expiry surfaces in Overview KPIs.

### Phase 6 (3)
24. Apply programme template → tasks + milestones created.
25. Dependent task remains blocked until gate met.
26. Gantt renders `v_all_tasks` union.

### Phase 7 (3)
27. Double-book resource rejected.
28. Utilisation dashboard totals match.
29. Sub-contractor sees only own allocations.

### Phase 8 (3)
30. PO created → coverage per site correct; commitments live.
31. Variation approval updates commercial position.
32. Actual cost import reconciles to PO lines.

### Phase 9 (3)
33. Site cannot mobilise without RAMS.
34. Photo EXIF pin on map inside site buffer.
35. Inspection failure creates snags.

### Phase 10 (3)
36. PC blocked with open critical snags.
37. Handover pack generates in <30s.
38. Client sign-off email captured, stage → `handover_complete`.

### Phase 11 (1)
39. Partner pentest: 0 rows leak outside allocation.

### Phase 12 (1)
40. MCP `list_wp_sites` scoped correctly per role; write tool audited.

## Sign-off matrix
| Phase | Product | Delivery | Engineering | Security |
|---|---|---|---|---|
| 1  | ☐ | ☐ | ☐ | ☐ |
| 2  | ☐ | ☐ | ☐ |   |
| 3  | ☐ | ☐ | ☐ | ☐ |
| 4  | ☐ | ☐ | ☐ |   |
| 5  | ☐ | ☐ | ☐ |   |
| 6  | ☐ | ☐ | ☐ |   |
| 7  | ☐ | ☐ | ☐ |   |
| 8  | ☐ | ☐ | ☐ |   |
| 9  | ☐ | ☐ | ☐ |   |
| 10 | ☐ | ☐ | ☐ |   |
| 11 | ☐ | ☐ | ☐ | ☐ |
| 12 | ☐ | ☐ | ☐ | ☐ |
| 13 | ☐ | ☐ | ☐ |   |

## Exit
Prod cutover only after each row in the phase has all applicable ticks.