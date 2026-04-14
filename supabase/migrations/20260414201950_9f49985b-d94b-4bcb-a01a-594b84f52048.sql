
-- 1. Add column
ALTER TABLE public.profiles ADD COLUMN is_platform_admin boolean NOT NULL DEFAULT false;

-- 2. Set platform admin for Andrew Nemes
UPDATE public.profiles SET is_platform_admin = true WHERE user_id = 'fb6b2d44-212e-41ed-b83d-d8ed598a80ea';

-- 3. Create security definer function
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND is_platform_admin = true
  )
$$;

-- 4. Update profiles SELECT policy for admins
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = profiles.user_id AND org_members.org_id = get_user_org_id(auth.uid()))
    OR profiles.user_id = auth.uid()
  )
);

-- 5. Update profiles UPDATE policy for admins
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = profiles.user_id AND org_members.org_id = get_user_org_id(auth.uid()))
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = profiles.user_id AND org_members.org_id = get_user_org_id(auth.uid()))
  )
);

-- 6. Update organisations policy
DROP POLICY IF EXISTS "Admins can manage organisations" ON public.organisations;
CREATE POLICY "Admins can manage organisations" ON public.organisations
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR id = get_user_org_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR id = get_user_org_id(auth.uid())
  )
);

-- 7. Update org_members policy
DROP POLICY IF EXISTS "Admins can manage org_members" ON public.org_members;
CREATE POLICY "Admins can manage org_members" ON public.org_members
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR org_id = get_user_org_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR org_id = get_user_org_id(auth.uid())
  )
);

-- 8. Update audit_log policy
DROP POLICY IF EXISTS "Admins can view audit log" ON public.audit_log;
CREATE POLICY "Admins can view audit log" ON public.audit_log
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR user_id IS NULL OR
    EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = audit_log.user_id AND org_members.org_id = get_user_org_id(auth.uid()))
  )
);

-- 9. Update user_roles SELECT policy
DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
CREATE POLICY "Admins can view all user roles" ON public.user_roles
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = user_roles.user_id AND org_members.org_id = get_user_org_id(auth.uid()))
  )
);

-- 10. Update user_roles INSERT policy
DROP POLICY IF EXISTS "Admins can insert user roles" ON public.user_roles;
CREATE POLICY "Admins can insert user roles" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = user_roles.user_id AND org_members.org_id = get_user_org_id(auth.uid()))
  )
);

-- 11. Update user_roles DELETE policy
DROP POLICY IF EXISTS "Admins can delete user roles" ON public.user_roles;
CREATE POLICY "Admins can delete user roles" ON public.user_roles
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = user_roles.user_id AND org_members.org_id = get_user_org_id(auth.uid()))
  )
);

-- 12. Update notifications policy
DROP POLICY IF EXISTS "Admins can manage all notifications" ON public.notifications;
CREATE POLICY "Admins can manage all notifications" ON public.notifications
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = notifications.user_id AND org_members.org_id = get_user_org_id(auth.uid()))
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = notifications.user_id AND org_members.org_id = get_user_org_id(auth.uid()))
  )
);

-- 13. Update sites policies
DROP POLICY IF EXISTS "Admins can view all sites" ON public.sites;
CREATE POLICY "Admins can view all sites" ON public.sites
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR org_id = get_user_org_id(auth.uid()) OR org_id IS NULL
  )
);

DROP POLICY IF EXISTS "Admins can update all sites" ON public.sites;
CREATE POLICY "Admins can update all sites" ON public.sites
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR org_id = get_user_org_id(auth.uid()) OR org_id IS NULL
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR org_id = get_user_org_id(auth.uid()) OR org_id IS NULL
  )
);

DROP POLICY IF EXISTS "Admins can delete all sites" ON public.sites;
CREATE POLICY "Admins can delete all sites" ON public.sites
FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR org_id = get_user_org_id(auth.uid()) OR org_id IS NULL
  )
);

-- 14. Update role_requests policy
DROP POLICY IF EXISTS "Admins can view role requests" ON public.role_requests;
CREATE POLICY "Admins can view role requests" ON public.role_requests
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = role_requests.user_id AND org_members.org_id = get_user_org_id(auth.uid()))
  )
);

DROP POLICY IF EXISTS "Admins can update role requests" ON public.role_requests;
CREATE POLICY "Admins can update role requests" ON public.role_requests
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = role_requests.user_id AND org_members.org_id = get_user_org_id(auth.uid()))
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) AND (
    is_platform_admin(auth.uid()) OR
    EXISTS (SELECT 1 FROM org_members WHERE org_members.user_id = role_requests.user_id AND org_members.org_id = get_user_org_id(auth.uid()))
  )
);
