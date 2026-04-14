

# Plan: Org-Scoped Data Protection for Admin

## What You Want
- Admins keep full access to platform settings (DNO, EV Hub Rules, Cable Catalogue, Layers, APIs, etc.)
- Admins can only see **users and roles within their own organisation** in the Users & Roles tab
- Portfolio/sites data is already org-scoped via RLS — but the admin override lets admins see ALL sites; this needs tightening
- Audit log should only show entries related to the admin's own org users
- Meet data protection requirements: no cross-org visibility of personal data

## What's Already in Place
- `sites` table has `org_id` column with `is_org_member()` RLS — working for non-admin users
- `profiles` has an "Org members can view org profiles" policy — working for non-admin users
- Problem: Admin RLS policies on `profiles`, `user_roles`, `role_requests`, `audit_log`, and `sites` grant **global access** with no org filter

## Changes Required

### 1. Database Migration — Scope Admin RLS Policies

Create a `get_user_org_id(uuid)` security definer function and update these policies:

- **`profiles`**: Replace "Admins can view all profiles" with org-scoped version using `get_user_org_id`. Admins without an org (platform super-admins) retain global access via a fallback check.
- **`profiles`** (UPDATE): Same org scoping for "Admins can update all profiles"
- **`user_roles`**: Replace "Admins can manage roles" with org-scoped version — admin can only manage roles for users in their org
- **`role_requests`**: Scope admin SELECT to same-org requesters
- **`audit_log`**: Scope admin SELECT to entries where `user_id` belongs to same org
- **`sites`**: Scope "Admins can manage all sites" and "Admins can view all sites" to same org via `org_id = get_user_org_id(auth.uid())`

Platform super-admin fallback: if `get_user_org_id` returns NULL (user has no org membership), the admin retains global access. This keeps your platform operator role working.

### 2. Frontend — Users & Roles Tab

Modify `src/components/admin/UserRolesManagement.tsx`:
- Use `orgId` from `useAuth()` to filter the profiles query — join through `org_members` so only same-org users appear
- Filter role requests to same-org users
- If `orgId` is null (super-admin), show all users as today

### 3. Frontend — Audit Log

Modify the `AuditLogTab` in `src/pages/Admin.tsx`:
- If admin has an `orgId`, filter audit entries to only show those where `user_id` is in the same org
- Super-admins continue to see all entries

### 4. No Changes To
- Admin tabs: All tabs remain visible (Layers, DNO, EV Hub, Cable Catalogue, APIs, Gas Registry, Route Learning)
- Unit rates: Stay global/shared as currently designed
- Portfolio page: Already org-scoped for clients; admin scoping handled by the RLS policy update in step 1

## Files Modified
- New Supabase migration (RLS policy updates + `get_user_org_id` function)
- `src/components/admin/UserRolesManagement.tsx` — org-filtered queries
- `src/pages/Admin.tsx` — org-filtered audit log

