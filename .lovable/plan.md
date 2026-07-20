## Bulk delete for estimates

Extend `src/components/delivery/estimate/EstimatesTab.tsx` (and the equivalent list in `SiteEstimatesPanel.tsx` if applicable) so users can select multiple estimates and delete them in one action, reusing the existing soft-delete → recycle bin flow.

### UI changes
- Add a checkbox to each estimate card (top-left corner).
- Add a "Select all" checkbox in the list header with a tri-state (none / some / all).
- When ≥1 is selected, show a sticky bulk-action bar with:
  - Selected count ("3 selected")
  - "Clear" button
  - "Delete selected" button (destructive)
- Clicking "Delete selected" opens a single `AlertDialog` asking for one shared reason, listing the estimates to be removed.

### Behaviour
- Confirm → call the existing `archive_entity` RPC once per selected estimate (chunked, e.g. 5 at a time) with `entity_type = 'estimate'` and the shared reason.
- On success: toast "N estimates moved to recycle bin", clear selection, invalidate the estimates query.
- On partial failure: toast the count that failed and keep failed rows selected.
- Deleted estimates appear in **Admin → Archive** (already generic) and can be restored/purged there — no changes required to the archive console.

### Non-goals
- No changes to the archive/restore RPCs, snapshot format, or single-item delete flow.
- No changes to PoC vs EV Build estimate logic.
