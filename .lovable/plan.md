## Gridwise Platform V1 Build Plan

### Phase 1: Study System & Rules Engine ✅ COMPLETE

- ✅ `studies` table with RLS (user owns, admin/engineer can view all)
- ✅ `dno_rulesets` table seeded with UK_ALL baseline + 6 DNO overlays
- ✅ `cable_catalogue` table seeded with 14 cables (8 LV, 3 HV, 3 EHV)
- ✅ `/studies` page with list view, create wizard, delete
- ✅ `/study/:id` detail page with frozen results, DNO output, cost/BOM, PDF export
- ✅ Sidebar navigation updated with Studies link
- ✅ `apply-dno-rules` edge function deployed & tested
- ✅ `useActiveStudy` hook — manages active study from URL `?study=<id>`
- ✅ Map integration: study bar shows active study name + status
- ✅ Auto-save boundary to study when drawn on map
- ✅ Auto-save route to study when connect tool finishes
- ✅ Auto-run `apply-dno-rules` when route is saved (stores engine output + ruleset version)

### Phase 2: Price Book + Surface-Aware Costing ✅ COMPLETE

- ✅ Surface-aware excavation: `deriveSurfaceSplit()` uses `min_footway_m` / `min_carriageway_m` from highway_widths constraints to compute proportional splits instead of fixed 60/30/10
- ✅ `SurfaceSplit` interface + `DEFAULT_SURFACE_SPLIT` constant exported from connectionCosts.ts
- ✅ `estimateConnectionCost` accepts optional `surface_split` parameter
- ✅ Auto-save `cost_estimate_json` and `bom_json` to studies when route is saved (if proposed_kw is set)
- ✅ StudyDetail page renders formatted cost breakdowns with visual bars, grouped line items, and fees summary
- ✅ StudyDetail page renders grouped BOM table with per-category totals
- ✅ Admin Unit Rates settings panel for managing price book (existing `unit_rates` table)

### Phases 3–5: Pending
- Phase 3: Hybrid LV optimiser
- Phase 4: Electrical engine + Design mode
- Phase 5: Enhanced PDF/JSON export
