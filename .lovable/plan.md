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

### Phases 2–5: Pending
- Phase 2: Price book + surface-aware costing
- Phase 3: Hybrid LV optimiser
- Phase 4: Electrical engine + Design mode
- Phase 5: Enhanced PDF/JSON export
