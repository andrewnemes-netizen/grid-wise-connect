
-- Scope organisations RLS for admins to their own org
DROP POLICY IF EXISTS "Admins can manage organisations" ON public.organisations;
CREATE POLICY "Admins can manage organisations" ON public.organisations
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (get_user_org_id(auth.uid()) IS NULL OR id = get_user_org_id(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND (get_user_org_id(auth.uid()) IS NULL OR id = get_user_org_id(auth.uid()))
);

-- Scope org_members RLS for admins to their own org
DROP POLICY IF EXISTS "Admins can manage org_members" ON public.org_members;
CREATE POLICY "Admins can manage org_members" ON public.org_members
FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  AND (get_user_org_id(auth.uid()) IS NULL OR org_id = get_user_org_id(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  AND (get_user_org_id(auth.uid()) IS NULL OR org_id = get_user_org_id(auth.uid()))
);
