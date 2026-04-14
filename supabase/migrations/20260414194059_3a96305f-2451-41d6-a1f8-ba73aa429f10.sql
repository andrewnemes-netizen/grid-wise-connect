
-- 1. Create security definer function to get a user's org_id
CREATE OR REPLACE FUNCTION public.get_user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.org_members
  WHERE user_id = _user_id LIMIT 1
$$;

-- 2. Profiles: scope admin SELECT to same org (super-admin fallback when no org)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
FOR SELECT TO public
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    get_user_org_id(auth.uid()) IS NULL
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.user_id = profiles.user_id
        AND org_members.org_id = get_user_org_id(auth.uid())
    )
  )
);

-- 3. Profiles: scope admin UPDATE to same org
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles
FOR UPDATE TO public
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    get_user_org_id(auth.uid()) IS NULL
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.user_id = profiles.user_id
        AND org_members.org_id = get_user_org_id(auth.uid())
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    get_user_org_id(auth.uid()) IS NULL
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.user_id = profiles.user_id
        AND org_members.org_id = get_user_org_id(auth.uid())
    )
  )
);

-- 4. User Roles: scope admin management to same org
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    get_user_org_id(auth.uid()) IS NULL
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.user_id = user_roles.user_id
        AND org_members.org_id = get_user_org_id(auth.uid())
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    get_user_org_id(auth.uid()) IS NULL
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.user_id = user_roles.user_id
        AND org_members.org_id = get_user_org_id(auth.uid())
    )
  )
);

-- 5. Role Requests: scope admin SELECT to same org
DROP POLICY IF EXISTS "Admins can view role requests" ON public.role_requests;
CREATE POLICY "Admins can view role requests" ON public.role_requests
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    get_user_org_id(auth.uid()) IS NULL
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.user_id = role_requests.user_id
        AND org_members.org_id = get_user_org_id(auth.uid())
    )
  )
);

-- Also scope admin UPDATE on role_requests
DROP POLICY IF EXISTS "Admins can resolve role requests" ON public.role_requests;
CREATE POLICY "Admins can resolve role requests" ON public.role_requests
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    get_user_org_id(auth.uid()) IS NULL
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.user_id = role_requests.user_id
        AND org_members.org_id = get_user_org_id(auth.uid())
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    get_user_org_id(auth.uid()) IS NULL
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.user_id = role_requests.user_id
        AND org_members.org_id = get_user_org_id(auth.uid())
    )
  )
);

-- 6. Audit Log: scope admin SELECT to same org
DROP POLICY IF EXISTS "Admins can view audit log" ON public.audit_log;
CREATE POLICY "Admins can view audit log" ON public.audit_log
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    get_user_org_id(auth.uid()) IS NULL
    OR audit_log.user_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.user_id = audit_log.user_id
        AND org_members.org_id = get_user_org_id(auth.uid())
    )
  )
);

-- 7. Sites: scope admin management to same org
DROP POLICY IF EXISTS "Admins can manage all sites" ON public.sites;
CREATE POLICY "Admins can manage all sites" ON public.sites
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    get_user_org_id(auth.uid()) IS NULL
    OR sites.org_id = get_user_org_id(auth.uid())
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    get_user_org_id(auth.uid()) IS NULL
    OR sites.org_id = get_user_org_id(auth.uid())
  )
);

DROP POLICY IF EXISTS "Admins can view all sites" ON public.sites;
CREATE POLICY "Admins can view all sites" ON public.sites
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    get_user_org_id(auth.uid()) IS NULL
    OR sites.org_id = get_user_org_id(auth.uid())
  )
);

-- 8. Notifications: scope admin management to same org
DROP POLICY IF EXISTS "Admins can manage all notifications" ON public.notifications;
CREATE POLICY "Admins can manage all notifications" ON public.notifications
FOR ALL TO public
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    get_user_org_id(auth.uid()) IS NULL
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.user_id = notifications.user_id
        AND org_members.org_id = get_user_org_id(auth.uid())
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND (
    get_user_org_id(auth.uid()) IS NULL
    OR EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.user_id = notifications.user_id
        AND org_members.org_id = get_user_org_id(auth.uid())
    )
  )
);
