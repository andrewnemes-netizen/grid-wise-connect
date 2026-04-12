

## Plan: Save Updated Costs Back to Portfolio from Map

### Problem
When an engineer opens a site from SiteDetail via "Open on Map", draws/adjusts the cable route, and runs a new assessment, there is no way to save the updated costs back to the existing portfolio site. The current flow always creates a **new** site entry instead of updating the existing one.

### What will be built
A "Save back to Portfolio" workflow that passes the site ID through to the map, and when the engineer re-runs the assessment, updates the existing site record rather than creating a duplicate.

### Changes

**1. `src/pages/SiteDetail.tsx`** — Pass `siteId` in the "Open on Map" URL
- Add `&siteId=${site.id}` to the navigate URL so the map knows which portfolio site to update.

**2. `src/pages/MapView.tsx`** — Read `siteId` from search params
- Extract `siteId` from the URL and pass it down to `UnifiedIntelligencePanel` as a new prop (`existingSiteId`).
- Include it in the deep-link effect alongside lat/lng/siteName.

**3. `src/components/map/UnifiedIntelligencePanel.tsx`** — Add "Update Site" logic
- Accept a new `existingSiteId?: string` prop.
- When `existingSiteId` is set, change the "Save Site" button label to **"Update Portfolio Site"**.
- On click, perform a `supabase.from("sites").update(...)` instead of `.insert(...)`, updating the same fields (score, distances, cost_band, raw_score_data, connection_options, etc.) on the existing record.
- Show a success toast: "Portfolio site updated with new assessment".
- Keep the existing "Save Site" (insert) flow for new sites where no `existingSiteId` is present.

### Technical details
- The `sites` table already supports all needed Update fields (cost_band, raw_score_data, connection_options, viability_index, etc.)
- No database migration needed — just switching from INSERT to UPDATE when a site ID is provided.
- RLS policies already permit org-scoped updates.
- The `updated_at` column will be set to `new Date().toISOString()` on update.

