## Replace `src/pages/wp/tabs/WpEstimatingTab.tsx`

Swap the current file for the uploaded version, which:

- Drops the site-scoped branch (siteId/mode/source query params + `SiteEstimatesPanel`, `EstimateBreadcrumb`, `MapPin` icon).
- Renders the standard `EstimatesTab` scoped to the work package with `kind="build"`, keeping EV Build separate from PoC totals.
- Updates the description to clarify EV Build vs PoC estimates.

### Follow-up check
- `SiteEstimatesPanel` and `EstimateBreadcrumb` imports disappear from this file. I'll grep for other usages; if none remain, flag them as dead code but leave deletion for a separate request (only change what was asked).
- No other files need changes — `EstimatesTab` already exists and is used elsewhere with the same `{ scope, kind }` API.
