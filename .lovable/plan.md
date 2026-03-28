

## Add "Open on Map" Button to Site Detail

### What
Add a prominent button on the Site Detail page that navigates to the Map view, pre-centred on the site's location with a tooltip guiding the user on next steps (draw route, de-risk, expert evaluation).

### Changes

**`src/pages/MapView.tsx`**
- Read `lat`, `lng`, and `siteName` from URL search params on mount
- If present, fly the map to that location, drop a pin, and show a toast/tip: *"Site loaded — use Connect tool to draw your route and de-risk the connection"*

**`src/pages/SiteDetail.tsx`**
- Add an "Open on Map" button (with `MapPin` icon) in the header next to "Export PDF"
- On click, navigate to `/map?lat={lat}&lng={lng}&siteName={name}&kw={proposed_kw}`
- The site's lat/lng comes from `site.lat` / `site.lng` (or geometry field)
- Button styled as primary to make it the obvious next action

### User Flow
```text
Portfolio → Site Detail → [Open on Map] → Map zooms to site
                                          → Tip: "Draw route to de-risk"
                                          → User uses Connect/Design tools
```

### Files to Change
| File | Change |
|------|--------|
| `src/pages/SiteDetail.tsx` | Add "Open on Map" button that navigates with query params |
| `src/pages/MapView.tsx` | Read query params on mount, fly to location, drop pin, show guidance toast |

