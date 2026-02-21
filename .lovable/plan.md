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

### Phase 4: Electrical Engine + Design Mode + Enhanced Export (IN PROGRESS)

#### 4.1 Electrical Validation Engine ✅ COMPLETE
- ✅ `src/lib/electricalEngine.ts` — Pure calculation module:
  - Voltage drop: Ib × Zc × L (mains + service)
  - Current validation: Ib ≤ In ≤ Iz, utilisation >80% warning
  - Fault level: If = Uo / Zs, prospective fault current
  - Zs gateway: Ze + R1 + R2 check
  - Configurable defaults: PF 0.95, diversity 1.0, supply 400V
  - Structured flags with severity (error/warning/info)
  - Engine versioning (v1.0)
- ✅ `study_snapshots` table with immutable RLS (no UPDATE/DELETE for users)
- ✅ `src/lib/snapshotService.ts` — Create + list immutable snapshots
  - Stores: electrical inputs, cable config, validation results, cost summary, optimiser output
  - Version locks: engine_version, ruleset_version, pricebook_version
- ✅ Wired into ConnectAssessmentPanel: runs electrical validation after LV optimiser
- ✅ Electrical validation summary displayed with PASS/FAIL badge

#### 4.2 Design Mode on Map ✅ COMPLETE
- ✅ `design_elements` table with RLS (user owns via study, admin/engineer can view)
- ✅ `useDesignMode` hook — CRUD for equipment markers, persisted to DB per study
- ✅ `DesignModePanel` UI — equipment palette (6 types), placed items list, clear all
- ✅ Equipment types: Transformer, RMU, Feeder Pillar, Cutout, Joint, Pole
- ✅ Map click placement with coloured markers + symbols
- ✅ "Design" tool in MapToolbar (requires active study)
- ✅ Wired into MapView click dispatcher
#### 4.3 Enhanced PDF/JSON Export ✅ COMPLETE
- ✅ PDF now includes: electrical validation section (VD, Ib, If, Zs with PASS/FAIL badge), snapshot ID in header + footer + site details, design elements summary
- ✅ `exportAssessmentJson()` — structured JSON export with `gridwise-assessment-v1` format
- ✅ JSON includes: site details, feasibility, distances, constraints, electrical validation, cost estimate, BOM, design elements, route geometry
- ✅ JSON export button added to ConnectAssessmentPanel (FileJson icon)
- ✅ Snapshot ID used as PDF reference number (SNP-XXXXXXXX) for audit trail

### Phase 5: Pending
