

## Phase 7: Portfolio Analytics, Enhanced Reporting, and Plan Update — COMPLETE

### 7.1 Notifications and Activity Feed (Stage 1) — ✅ COMPLETE
- `notifications` table with RLS policies
- In-app notification bell with unread count and polling
- `StudyActivityFeed` component on StudyDetail page
- Auto-notifications for study shares and comments

### 7.2 Portfolio Analytics Dashboard — ✅ COMPLETE
- Stat cards: Total Sites, Avg Viability, Pass Rate, Avg Reinforcement
- Charts: Score Distribution pie, Cost Band bar, Grid Readiness bar, Monthly Pipeline line
- All charts respect current filters; derived from existing `sites` query
- New component: `src/components/portfolio/PortfolioAnalytics.tsx`

### 7.3 Enhanced PDF Reporting — ✅ COMPLETE
- **Branded Cover Page**: Full-page EcoPower branded cover with site name, date, and ref ID
- **Section Toggle**: `PdfSections` interface with boolean flags for all report sections
- **Section Toggle UI**: Checkboxes in export dialog on `StudyDetail` page
- **Batch Export (ZIP)**: Checkbox selection on Studies page + JSZip bundling
- **Return type**: `generateAssessmentPdf` now returns the jsPDF instance for programmatic use
- New dependency: `jszip`
