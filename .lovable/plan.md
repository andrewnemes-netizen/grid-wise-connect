

## Plan: Add Delete Functionality to Portfolio

### What will be built
A delete button for each site row in the portfolio table, plus a bulk "Delete Selected" button that uses the existing checkbox selection. A confirmation dialog will prevent accidental deletions.

### Changes

**1. `src/pages/Portfolio.tsx`**
- Import `Trash2` icon and `AlertDialog` components
- Add a `deleteIds` state to track which site(s) are pending deletion
- Add a `handleDelete` async function that calls `supabase.from("sites").delete().in("id", ids)` and invalidates the query cache
- Add a **"Delete Selected"** button next to "Export CSV" (visible when checkboxes are ticked)
- Add a **trash icon button** in each row's action column
- Wrap both in an `AlertDialog` confirmation ("Are you sure? This cannot be undone.")

### Technical details
- Deletion uses the existing Supabase RLS policies on the `sites` table (org-scoped)
- React Query cache is invalidated after successful delete to refresh the list
- The existing compare checkbox selection is reused for bulk delete
- No database migration needed — just a client-side DELETE call

