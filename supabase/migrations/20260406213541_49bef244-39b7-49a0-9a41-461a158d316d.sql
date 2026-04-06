
-- 1. Create organisations table
CREATE TABLE public.organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

-- 2. Create org_members table
CREATE TABLE public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

-- 3. Add org_id to sites and studies
ALTER TABLE public.sites ADD COLUMN org_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL;
ALTER TABLE public.studies ADD COLUMN org_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL;

-- 4. Security definer function to check org membership
CREATE OR REPLACE FUNCTION public.user_org_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.org_members WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members WHERE user_id = _user_id AND org_id = _org_id
  )
$$;

-- 5. RLS on organisations
CREATE POLICY "Admins can manage organisations"
  ON public.organisations FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Members can view own org"
  ON public.organisations FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), id));

-- 6. RLS on org_members
CREATE POLICY "Admins can manage org_members"
  ON public.org_members FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Members can view own org members"
  ON public.org_members FOR SELECT TO authenticated
  USING (is_org_member(auth.uid(), org_id));

-- 7. Update sites RLS: clients see only their org's sites, admins/engineers see all
DROP POLICY IF EXISTS "Users can view own sites" ON public.sites;

CREATE POLICY "Users can view org sites"
  ON public.sites FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR has_role(auth.uid(), 'admin')
    OR has_role(auth.uid(), 'engineer')
    OR (org_id IS NOT NULL AND is_org_member(auth.uid(), org_id))
  );

-- 8. Update studies RLS: add org-scoped access
CREATE POLICY "Org members can view org studies"
  ON public.studies FOR SELECT TO authenticated
  USING (
    org_id IS NOT NULL AND is_org_member(auth.uid(), org_id)
  );

-- 9. Profiles: clients should only see profiles within their own org
CREATE POLICY "Org members can view org profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om1
      JOIN public.org_members om2 ON om1.org_id = om2.org_id
      WHERE om1.user_id = auth.uid() AND om2.user_id = profiles.user_id
    )
  );
