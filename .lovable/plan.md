## Goal
Replace the "EV Build Estimating" experience in the Gridwise OS WP shell with the **Site estimates** experience (`SiteEstimatesPanel`) that already works in the legacy WP view — same component, same functionality (per-site versions, approve, Bulk apply recipe).

Scope is UI wiring only. No changes to `SiteEstimatesPanel`, no schema changes, no touching of the `Estimates` tab (group-based editor) or the `PoC Estimates` tab.

## Changes

1. **`src/pages/wp/tabs/WpEstimatingTab.tsx`**
   - Default view now renders `<SiteEstimatesPanel wpId={id} />` instead of `<WpEstimatePanel wpId={id} />`.
   - Update the heading/subtitle to "Site Estimates" with a description matching the legacy tab ("Manage per-site estimates. Each site can have multiple versions; only APPROVED site estimates can be included in a WP estimate").
   - Keep the existing site-scoped deep-link branch (`siteId + mode`) unchanged — it already renders `SiteEstimatesPanel`.
   - Drop the "Phase 4" badge and the trailing WP-Estimate reference card (no longer relevant on this tab).
   - Remove the now-unused `WpEstimatePanel` import.

2. **`src/components/wp/WpSidebar.tsx`**
   - Rename the Commercial nav item at slug `commercial/estimating` from **"EV Build Estimating"** to **"Site Estimates"**. Keep the slug/route unchanged so existing deep-links (Portfolio, breadcrumbs, notifications) keep working.
   - Icon stays `Calculator`.

## Not changing
- `SiteEstimatesPanel.tsx` — used as-is.
- `Estimates` tab (`commercial/estimates`) and `PoC Estimates` tab (`commercial/poc-estimates`) — untouched.
- Routes, DB, RLS, edge functions — untouched.
- `WpEstimatePanel` remains in the codebase (still referenced by the legacy `DeliveryWorkPackage.tsx` shell); only the Gridwise OS mount switches away from it.

## Verification
- Open `/wp/:id/commercial/estimating` → confirm Site estimates list (per-site cards, "Bulk apply recipe", version drawer) renders — matches the screenshot.
- Sidebar label reads "Site Estimates".
- Portfolio deep-link (`?siteId=…&mode=detailed`) still opens the site-scoped editor.
