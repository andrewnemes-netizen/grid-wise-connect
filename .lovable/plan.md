

# Fix: Platform Super-Admin Access

## Problem
You're logged in as an EcoPower member with the admin role. The current system defines "super-admin" as an admin with **no org membership** — but you ARE in an org, so you're treated as an org-scoped admin and can only see EcoPower users.

You need a proper way to mark specific users as **platform administrators** who can see everything across all organisations, even though they belong to one.

## Solution

### 1. Database Migration

Add a `is_platform_admin` column to `profiles`:
```sql
ALTER TABLE public.profiles ADD COLUMN is_platform_admin boolean NOT NULL DEFAULT false;
```

Set your account as platform admin (your user_id from the EcoPower org).

Create a `is_platform_admin(uuid)` security definer function that checks this flag.

Update ALL the org-scoped RLS policies (profiles, user_roles, role_requests, audit_log, sites, organisations, org_members) to use:
```sql
is_platform_admin(auth.uid()) OR org_id = get_user_org_id(auth.uid())
```
instead of:
```sql
get_user_org_id(auth.uid()) IS NULL OR ...
```

### 2. Frontend: useAuth Update

Update `src/hooks/useAuth.tsx` to fetch `is_platform_admin` from the profiles table and expose it in the auth context.

### 3. Frontend: OrgManagement + UserRolesManagement

Update `src/components/admin/OrgManagement.tsx`:
- Use `isPlatformAdmin` instead of `!myOrgId` for the super-admin check
- Platform admins see all orgs and can create/delete orgs
- Non-platform admins see only their own org

The Users & Roles tab will automatically show all users for platform admins because the RLS policies will grant global access based on the `is_platform_admin` flag.

### Files Modified
- New Supabase migration (add column, create function, update ~12 RLS policies)
- `src/hooks/useAuth.tsx` — fetch and expose `isPlatformAdmin`
- `src/components/admin/OrgManagement.tsx` — use `isPlatformAdmin` for visibility logic

