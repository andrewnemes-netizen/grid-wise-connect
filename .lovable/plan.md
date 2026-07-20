## Goal
Expose the existing Site Estimating flow directly inside the EV Build and ICP design surfaces so that estimating is one click away from any design row. No new estimating engine — reuse `SiteEstimatesPanel` and the existing `/wp/:id/commercial/estimating?siteId=…&mode=…` deep-link.

## Scope (from clarifications)
- **Where:** Row-level shortcut on each design in `WpDesignTab` **and** an embedded Estimate tab inside a Design detail view.
- **Mode:** User chooses (Detailed / Synthetic / History) — mirrors `SiteDetail`'s Estimate dropdown.

## Deliverables

### 1. Row-level "Estimate" dropdown in `WpDesignTab.tsx`
- In the design accordion header (next to the status badge), add an `Estimate ▾` split button rendering the same three items as `SiteDetail`:
  - Detailed Estimate
  - Synthetic (Rate-Card)
  - Estimate History
- Enabled only when the design has a linked `site_id` (single-site designs); disabled with tooltip "Link a site to open an estimate" otherwise.
- Each item navigates to `/wp/:wpId/commercial/estimating?siteId=<site>&mode=<detailed|synthetic|history>&source=design`.

### 2. New Design detail view with embedded Estimate tab
- New route: `/wp/:id/design/:submissionId` handled by a new component `WpDesignDetail.tsx` mounted in `WorkPackageShell.tsx`.
- Clicking a design row's title/"Open" opens this view (accordion behaviour on the list page is preserved for quick inline actions).
- Tabs inside the detail view:
  - **Overview** — existing status controls, notes, sites, reviews (extracted from current `AccordionContent`).
  - **Estimate** — embeds `<SiteEstimatesPanel wpId={wpId} focusSiteId={design.site_id} autoMode="detailed" />`. If the design has no linked site, show an empty state prompting the user to link one first.
  - **Documents** (optional, deferred — not built this pass).
- Reuse existing `EstimateBreadcrumb` at the top of the Estimate tab for consistency with the WP Estimating tab.

### 3. No schema / no engine changes
- No new tables. `site_estimates` / `site_estimate_lines` remain the single source of truth.
- No changes to `SiteEstimatesPanel`, `EstimateEditor`, `SendQuotationDialog`, or the send-quotation edge function.
- No duplicate estimate list per design — the embedded panel is the same one already used from Portfolio and the WP Estimating tab, scoped by `focusSiteId`.

## Reuse map (single source of truth)
- Estimate list / editor → `SiteEstimatesPanel` (unchanged)
- Deep-link contract → `WpEstimatingTab` `siteId` + `mode` params (unchanged)
- Estimate mode menu UX → mirrors `SiteDetail`'s dropdown (copy pattern, not duplicate component)

## Out of scope
- WP-wide (multi-site) designs — the Estimate action stays disabled; those users go via the WP Estimate tab.
- Any change to `estimates` (legacy) or `poc_estimates`.
- New backend policies, RPCs, or edge functions.

## Technical notes
- Row action uses the same `DropdownMenu` pattern already imported in `SiteDetail.tsx`.
- `WpDesignDetail.tsx` reads the submission via existing `design_submissions` query, then splits current `AccordionContent` JSX into an `<Overview />` subcomponent to avoid divergence with the list page.
- Add route + sidebar entry only if navigation from the list is not enough; initial pass uses in-list navigation via `useNavigate`.
