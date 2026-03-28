

## Fix: "Open on Map" navigates to wrong route

### Problem
The "Open on Map" button in SiteDetail navigates to `/map?lat=...&lng=...` but the App router mounts MapView at `/`, not `/map`. Result: 404.

### Fix
**`src/pages/SiteDetail.tsx`** — Change the navigation URL from `/map?lat=...` to `/?lat=...`

One-line change in the navigate call.

### Files to Change
| File | Change |
|------|--------|
| `src/pages/SiteDetail.tsx` | Change `/map?lat=` to `/?lat=` in the navigate call |

