# 02 — Wireframes

ASCII wireframes for every new/changed screen. Existing components named in `[ ]`.

## Global shell (feature-flagged `gridwise_os_shell`)
```text
┌──────────────────────────────────────────────────────────────────────┐
│ [AppSidebar]   │ Header · WP breadcrumb · [NotificationBell] · user   │
│ Home           │─────────────────────────────────────────────────────│
│ Programmes     │                                                     │
│ Map            │  <route outlet>                                     │
│ Assistant      │                                                     │
│ Admin          │                                                     │
└──────────────────────────────────────────────────────────────────────┘
```

## /wp/:id — Work Package shell (16 leaves in 6 groups)
```text
┌ Overview ─ Sites ▾ ─ Commercial ▾ ─ Engineering ▾ ─ Delivery ▾ ─ Records ▾ ─ Reporting ─ Assistant ┐
│                                                                                                    │
│  <tab outlet>                                                                                      │
│                                                                                                    │
└────────────────────────────────────────────────────────────────────────────────────────────────────┘
```
Group expands (Sites: Site Register · Map · Pre-Con) etc — see plan §1.

## Overview tab
```text
┌ KPIs from v_wp_kpis ──────────────────────────────┐
│ Sites: 42   Stage mix bar   £ Est £ PO £ Invoiced │
│ Margin %    Expiring DNO offers   Blocked tasks   │
└───────────────────────────────────────────────────┘
┌ Timeline (from mv_programme_dashboard) ───────────┐
│ [InteractiveGantt condensed]                      │
└───────────────────────────────────────────────────┘
```

## Sites → Site Register
Reuses `[Portfolio]` table filtered by `wp_id`. Row click → Site drawer.

## Sites → Map
Reuses `[MapView]` with `wp_id` filter + pin colour by `sites.current_stage_id`.

## Commercial → Estimating
Reuses `[EstimateEditor lens={lens}]`. Lens picker top-right: Internal · Client · Partner · DNO.

## Commercial → Purchase Orders
```text
┌─ PO # ─ Order Value ─ Sites Covered ─ Committed ─ Invoiced ─ Remaining ─ Status ─ Expiry ─┐
│ PO-001    £250,000       12 sites      £180,000    £120,000   £70,000   Active  2026-08  │
│ ...                                                                                       │
└───────────────────────────────────────────────────────────────────────────────────────────┘
Row → drawer: PO lines table, coverage per site, upload amendment.
```

## Commercial → Variations
Reuses `[WpEstimateVariations]`.

## Engineering → Grid Studies
Reuses `[Studies]` list, filtered by `studies.wp_id`.

## Engineering → DNO Offers
```text
┌ Offer # · DNO · Sites · Value · Received · Expiry · Status ┐
└──────────────────────────────────────────────────────────┘
Row → drawer: offer detail + files (project_files entity_type='dno_offer').
```

## Engineering → Design
Reuses `[DesignModePanel]` + new tab list of `design_submissions` with review workflow.

## Delivery → Programme
Reuses `[InteractiveGantt]` fed by `v_all_tasks`.

## Delivery → Tasks
Reuses `[TaskBoard]` + `[TaskKanban]`.

## Delivery → Partners
```text
┌ Partner ─ Allocated sites ─ Rate card ─ Status ┐
│ + Allocate partner                             │
└─────────────────────────────────────────────────┘
```

## Delivery → Resources (Phase 7)
```text
┌ Resource ─ Type ─ Utilisation this week ─ Conflicts ┐
│ Calendar grid (7-day)                                │
└──────────────────────────────────────────────────────┘
```

## Records → Documents / Photos / Audit
Reuses `[ProjectFiles]`, new photo map, `[audit_log]` filtered by entity.

## Reporting
Buttons: Client Pack · DNO Pack · Installer Pack · Internal WP Report → existing PDF pipeline.

## Assistant
Reuses `[AssistantChat]` with WP context bound via URL.

## Site drawer `/wp/:id/site/:siteId`
Reuses `[SiteDetail]` panels: Overview · Connect · Design · Stage history · Files · Photos · Commissioning.

## Partner Portal `/partner/*`
```text
┌ My Allocations │ Designs │ Documents │ Comments │ Progress ┐
│ Sites list (partner-scoped) · upload design pack · comments │
└─────────────────────────────────────────────────────────────┘
```

## Import Wizard (Phase 3 extensions)
Existing 9-step flow + new "Template" step (saved column mapping) + PDF/DOCX preview step.

---
**Sign-off:** Product ☐  Delivery ☐  Engineering ☐