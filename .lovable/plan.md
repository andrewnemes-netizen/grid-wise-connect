## Goal
Make the Work Package header breadcrumb show which programme the WP belongs to, so users always know the programme context.

## Changes
1. **Fetch programme name in `src/pages/WorkPackageShell.tsx`**
   - Extend the existing `work_packages` query to join `project_id → projects → programme_id → programmes(name)`.
   - Store the programme `id` and `name` alongside the existing WP data.

2. **Update `WpHeader` breadcrumb**
   - Change the breadcrumb from:
     `Programmes / Work Package / WP4 Planning`
   - To:
     `Programmes / {programmeName} / Work Package / WP4 Planning`
   - Make `{programmeName}` a clickable link back to the programme view.
   - Keep existing styling, archive action, and notification bell untouched.

## Verification
- Open any Work Package overview and confirm the programme name appears between "Programmes" and "Work Package".
- Click the programme name and confirm it navigates to the programme view.
- Confirm no layout shift or broken header actions.