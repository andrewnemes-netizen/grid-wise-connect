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

- ✅ Surface-aware excavation: `deriveSurfaceSplit()` uses constraint data for proportional splits
- ✅ `SurfaceSplit` interface + `DEFAULT_SURFACE_SPLIT` constant
- ✅ Auto-save `cost_estimate_json` and `bom_json` to studies on route save
- ✅ StudyDetail renders formatted cost breakdowns with visual bars and grouped BOM
- ✅ Admin Unit Rates settings panel for price book management

### Phase 3: Hybrid LV Optimiser ✅ COMPLETE

- ✅ `cable_catalogue` extended with `service_allowed` and `mains_allowed` boolean columns
- ✅ `src/lib/lvOptimiser.ts` — modular engine with:
  - Mains/service route split (DNO service length cap, default 30m fallback)
  - Cable candidate iteration from catalogue (max 10 mains candidates)
  - Electrical validation: voltage drop ≤ 5%, Ib ≤ Iz ampacity, Zs gateway check
  - Utilisation >80% warnings
  - Cost minimisation: cable + duct + excavation + jointing + commercial uplift
  - Structured JSON output: network_edges, split_point, electrical summary, cost summary, ranked alternatives, constraint flags
  - `NO_PASSING_SOLUTION` status with constraint failure details when no cable passes
- ✅ `OptimiserResultPanel` UI component — displays selected solution, alternatives, cost breakdowns, electrical figures, constraint flags
- ✅ "Run LV Feasibility" button in ConnectAssessmentPanel (only shows for LV/Auto voltage)
- ✅ Fetches cable catalogue from DB, uses unit rates from price book
- ✅ Modular architecture ready for V2 (HV comparison, multi-transformer splitting)

### Phases 4–5: Pending
- Phase 4: Electrical engine + Design mode
- Phase 5: Enhanced PDF/JSON export
