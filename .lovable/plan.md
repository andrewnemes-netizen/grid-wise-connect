## Fix: Surveys panel shows zero records in Gridwise OS

### Root cause (verified)
`SurveysPanel.tsx` queries `wp_sites` using the column name `wp_id`, but the actual column is `work_package_id` (confirmed via schema query). Result:

- WP-scoped mount (`/wp/:id/sites/surveys`) filters by a non-existent column → returns `[]` → "No surveys match these filters."
- Org-wide mount (`/surveys`) still loads survey rows, but the WP-name enrichment/join silently fails, so the WP column is always blank.

### Change
Single file: `src/components/surveys/SurveysPanel.tsx`

Replace the three `wp_sites` references so they use `work_package_id`:
1. Scoped fetch: `.eq("work_package_id", workPackageId)` (line ~101)
2. Enrichment select: `sb.from("wp_sites").select("site_id, work_package_id").in("site_id", uniqueSiteIds)` (line ~122)
3. `siteWp` map builder: read `r.work_package_id` instead of `r.wp_id` (line ~137)

No schema changes, no other files touched.

### Verify
Reload `/wp/fbaa6ae3-.../sites/surveys` — the Gloucestershire WP should now list its site surveys, and the org-wide `/surveys` page should show the WP name column populated.
