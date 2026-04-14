

# Fix: Org-Scoped Admin Visibility + Name Resolution

## Problems Identified

1. **"Characters as name" in Organisations tab**: The `organisations` and `org_members` RLS policies still give admins global access (no org filter), so the OrgManagement page loads ALL orgs and ALL members. But the `profiles` RLS is now org-scoped, so profile names for users in *other* orgs can't be resolved — they fall back to showing truncated UUIDs like "b680abf5".

2. **Role management confusion**: The Users & Roles tab correctly shows only same-org users (RLS is working), but the Organisations tab shows all orgs, creating a mismatch. You can see other orgs' members but can't read their names.

## Fix

### 1. Database: Scope `organisations` and `org_members` RLS for admins

Update the admin policies on these two tables so org-scoped admins can only manage their own org:

- **`organisations`**: Replace `"Admins can manage organisations"` with org-scoped version — admin can only manage orgs where `id = get_user_org_id(auth.uid())`. Super-admins (no org) retain global access.
- **`org_members`**: Replace `"Admins can manage org_members"` with org-scoped version — admin can only manage members where `org_id = get_user_org_id(auth.uid())`. Super-admins retain global access.

### 2. Frontend: Pass `orgId` context in OrgManagement

Update `src/components/admin/OrgManagement.tsx`:
- Import `useAuth` and get `orgId`
- If `orgId` exists, filter the organisations query to only fetch that org (`.eq("id", orgId)`)
- Hide "New Organisation" and "Delete Organisation" buttons for org-scoped admins (only super-admins should create/delete orgs)
- The member list and profile names will resolve correctly since RLS now matches

### 3. No changes needed to Users & Roles

The Users & Roles tab already works correctly — it only shows same-org users due to the profiles RLS policy. Role assignment (add/remove) also works because `user_roles` RLS is org-scoped.

## Files Modified

- New Supabase migration — update RLS on `organisations` and `org_members`
- `src/components/admin/OrgManagement.tsx` — filter by own org, hide create/delete for org admins

