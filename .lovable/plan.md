

## Phase 7: Portfolio Analytics, Enhanced Reporting, and Plan Update

### Overview

Three deliverables remain for Phase 7:
1. **Portfolio Analytics Dashboard** -- aggregate stats and charts on the Portfolio page
2. **Enhanced PDF Reporting** -- customisable report sections with branded cover page and batch export
3. **Plan Update** -- mark Phase 7 complete in `.lovable/plan.md`

Notifications (Stage 1) is already complete.

---

### 7.1 Portfolio Analytics Dashboard

Add an analytics section above the existing table on `/portfolio`:

**Stat Cards (top row):**
- Total Sites count
- Average Viability Index
- Pass Rate (% of GREEN scores)
- Average Reinforcement Probability

**Charts (using Recharts, already installed):**
- Score Distribution pie chart (GREEN / AMBER / RED counts)
- Cost Band bar chart (count per band)
- Grid Readiness bar chart (Strong / Moderate / Constrained)
- Monthly pipeline line chart (sites created per month over last 12 months)

All charts derive from the existing `sites` query -- no new DB tables needed. Charts respect the current filters so users can drill down.

**Files changed:**
- `src/pages/Portfolio.tsx` -- add analytics section with stat cards and chart components above the table

---

### 7.2 Enhanced PDF Reporting

Extend `src/lib/generateAssessmentPdf.ts` with:

**Branded Cover Page:**
- Full-page cover with EcoPower branding, site name, date, and reference ID
- Professional layout before existing content

**Section Toggle Support:**
- New `PdfSections` interface with boolean flags: `coverPage`, `executiveSummary`, `siteDetails`, `routeMap`, `electricalValidation`, `costBreakdown`, `bom`, `designElements`, `keyFindings`, `nextSteps`
- Default: all sections enabled
- UI: checkboxes in the export dialog on `StudyDetail` page

**Batch Export (ZIP):**
- Add a "Batch Export" button on the Studies list page
- Uses checkbox selection to pick studies
- Generates individual PDFs and bundles them into a ZIP using JSZip (will need to add as dependency)
- Downloads as `gridwise-reports-YYYY-MM-DD.zip`

**Files changed:**
- `src/lib/generateAssessmentPdf.ts` -- add cover page, accept sections config
- `src/pages/StudyDetail.tsx` -- add section toggle checkboxes to export area
- `src/pages/Studies.tsx` -- add batch export button with study selection

**New dependency:** `jszip` for ZIP bundling

---

### 7.3 Plan Update

Update `.lovable/plan.md` to mark all Phase 7 items as complete:
- 7.1 Notifications and Activity Feed (Stage 1) -- COMPLETE
- 7.2 Portfolio Analytics Dashboard -- COMPLETE
- 7.3 Enhanced Reporting -- COMPLETE

---

### Technical Notes

- No database migrations required -- all data already exists in `sites` and `studies` tables
- Charts use the existing `recharts` dependency and `ChartContainer` from `src/components/ui/chart.tsx`
- PDF sections config is passed as an optional parameter; existing callers are unaffected
- Batch export requires `jszip` package addition
- All features are client-side; no edge functions needed

