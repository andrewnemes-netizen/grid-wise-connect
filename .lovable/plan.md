## Gridwise Platform V1 Build Plan

### Phase 1 Progress: Study System & Rules Engine ✅ STARTED

**Completed:**
- ✅ `studies` table with RLS (user owns, admin/engineer can view all)
- ✅ `dno_rulesets` table seeded with UK_ALL baseline + 6 DNO overlays (UKPN, NGED, SSEN, SPEN, NPG, ENWL)
- ✅ `cable_catalogue` table seeded with 14 cables (8 LV, 3 HV, 3 EHV)
- ✅ `/studies` page with list view, create wizard, delete
- ✅ Sidebar navigation updated with Studies link
- ✅ `apply-dno-rules` edge function deployed & tested
- ✅ Auto-updating timestamps via trigger

**Remaining Phase 1:**
- Study detail page with frozen results + PDF export
- Map integration: link boundary/route drawing to a study
- Wire `apply-dno-rules` into study workflow (run on route save)

### Phases 2–5: See executive summary (unchanged)
- Phase 2: Price book + surface-aware costing
- Phase 3: Hybrid LV optimiser
- Phase 4: Electrical engine + Design mode
- Phase 5: Enhanced PDF/JSON export
