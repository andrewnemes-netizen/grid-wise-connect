-- 1) resources
CREATE TABLE IF NOT EXISTS public.resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  resource_type text NOT NULL DEFAULT 'person',
  email text,
  phone text,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role_title text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resources TO authenticated;
GRANT ALL ON public.resources TO service_role;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resources_select_org_member" ON public.resources FOR SELECT TO authenticated
  USING (org_id IS NULL OR public.is_org_member(auth.uid(), org_id));
CREATE POLICY "resources_write_admin_engineer" ON public.resources FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR (org_id IS NOT NULL AND public.is_org_member(auth.uid(), org_id)
        AND public.has_role(auth.uid(),'engineer'::public.app_role))
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::public.app_role)
    OR (org_id IS NOT NULL AND public.is_org_member(auth.uid(), org_id)
        AND public.has_role(auth.uid(),'engineer'::public.app_role))
  );
CREATE INDEX IF NOT EXISTS idx_resources_org ON public.resources(org_id);
CREATE INDEX IF NOT EXISTS idx_resources_partner ON public.resources(partner_id);
CREATE INDEX IF NOT EXISTS idx_resources_user ON public.resources(user_id);

-- 2) resource_skills
CREATE TABLE IF NOT EXISTS public.resource_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  skill text NOT NULL,
  level smallint NOT NULL DEFAULT 3 CHECK (level BETWEEN 1 AND 5),
  certification text,
  expires_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(resource_id, skill)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_skills TO authenticated;
GRANT ALL ON public.resource_skills TO service_role;
ALTER TABLE public.resource_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resource_skills_select" ON public.resource_skills FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.resources r WHERE r.id = resource_id
                 AND (r.org_id IS NULL OR public.is_org_member(auth.uid(), r.org_id))));
CREATE POLICY "resource_skills_write" ON public.resource_skills FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.resources r WHERE r.id = resource_id
                 AND (public.has_role(auth.uid(),'admin'::public.app_role)
                      OR (r.org_id IS NOT NULL AND public.is_org_member(auth.uid(), r.org_id)
                          AND public.has_role(auth.uid(),'engineer'::public.app_role)))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.resources r WHERE r.id = resource_id
                 AND (public.has_role(auth.uid(),'admin'::public.app_role)
                      OR (r.org_id IS NOT NULL AND public.is_org_member(auth.uid(), r.org_id)
                          AND public.has_role(auth.uid(),'engineer'::public.app_role)))));
CREATE INDEX IF NOT EXISTS idx_resource_skills_resource ON public.resource_skills(resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_skills_skill ON public.resource_skills(skill);

-- 3) resource_rates
CREATE TABLE IF NOT EXISTS public.resource_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  cost_rate numeric NOT NULL DEFAULT 0,
  charge_rate numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'GBP',
  uom text NOT NULL DEFAULT 'hour',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_rates TO authenticated;
GRANT ALL ON public.resource_rates TO service_role;
ALTER TABLE public.resource_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resource_rates_select" ON public.resource_rates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.resources r WHERE r.id = resource_id
                 AND (r.org_id IS NULL OR public.is_org_member(auth.uid(), r.org_id))));
CREATE POLICY "resource_rates_write" ON public.resource_rates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.resources r WHERE r.id = resource_id
                 AND (public.has_role(auth.uid(),'admin'::public.app_role)
                      OR (r.org_id IS NOT NULL AND public.is_org_member(auth.uid(), r.org_id)
                          AND public.has_role(auth.uid(),'engineer'::public.app_role)))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.resources r WHERE r.id = resource_id
                 AND (public.has_role(auth.uid(),'admin'::public.app_role)
                      OR (r.org_id IS NOT NULL AND public.is_org_member(auth.uid(), r.org_id)
                          AND public.has_role(auth.uid(),'engineer'::public.app_role)))));
CREATE INDEX IF NOT EXISTS idx_resource_rates_resource ON public.resource_rates(resource_id, effective_from DESC);

-- 4) resource_availability
CREATE TABLE IF NOT EXISTS public.resource_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  date_from date NOT NULL,
  date_to date NOT NULL,
  kind text NOT NULL DEFAULT 'available',
  hours_per_day numeric,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_availability TO authenticated;
GRANT ALL ON public.resource_availability TO service_role;
ALTER TABLE public.resource_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resource_availability_select" ON public.resource_availability FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.resources r WHERE r.id = resource_id
                 AND (r.org_id IS NULL OR public.is_org_member(auth.uid(), r.org_id))));
CREATE POLICY "resource_availability_write" ON public.resource_availability FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.resources r WHERE r.id = resource_id
                 AND (public.has_role(auth.uid(),'admin'::public.app_role)
                      OR (r.org_id IS NOT NULL AND public.is_org_member(auth.uid(), r.org_id)
                          AND public.has_role(auth.uid(),'engineer'::public.app_role)))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.resources r WHERE r.id = resource_id
                 AND (public.has_role(auth.uid(),'admin'::public.app_role)
                      OR (r.org_id IS NOT NULL AND public.is_org_member(auth.uid(), r.org_id)
                          AND public.has_role(auth.uid(),'engineer'::public.app_role)))));
CREATE INDEX IF NOT EXISTS idx_resource_availability_range ON public.resource_availability(resource_id, date_from, date_to);

-- 5) resource_allocations
CREATE TABLE IF NOT EXISTS public.resource_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id uuid NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  work_package_id uuid REFERENCES public.work_packages(id) ON DELETE CASCADE,
  wp_task_id uuid REFERENCES public.wp_tasks(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  role text,
  allocation_pct numeric NOT NULL DEFAULT 100 CHECK (allocation_pct >= 0 AND allocation_pct <= 200),
  planned_hours numeric,
  actual_hours numeric,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'planned',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  CHECK (work_package_id IS NOT NULL OR wp_task_id IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resource_allocations TO authenticated;
GRANT ALL ON public.resource_allocations TO service_role;
ALTER TABLE public.resource_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "resource_allocations_select" ON public.resource_allocations FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.resources r WHERE r.id = resource_id
                 AND (r.org_id IS NULL OR public.is_org_member(auth.uid(), r.org_id))));
CREATE POLICY "resource_allocations_write" ON public.resource_allocations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.resources r WHERE r.id = resource_id
                 AND (public.has_role(auth.uid(),'admin'::public.app_role)
                      OR (r.org_id IS NOT NULL AND public.is_org_member(auth.uid(), r.org_id)
                          AND public.has_role(auth.uid(),'engineer'::public.app_role)))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.resources r WHERE r.id = resource_id
                 AND (public.has_role(auth.uid(),'admin'::public.app_role)
                      OR (r.org_id IS NOT NULL AND public.is_org_member(auth.uid(), r.org_id)
                          AND public.has_role(auth.uid(),'engineer'::public.app_role)))));
CREATE INDEX IF NOT EXISTS idx_resource_alloc_resource ON public.resource_allocations(resource_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_resource_alloc_wp ON public.resource_allocations(work_package_id) WHERE work_package_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_resource_alloc_task ON public.resource_allocations(wp_task_id) WHERE wp_task_id IS NOT NULL;

-- updated_at trigger util (reuse if exists)
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_resources_touch ON public.resources;
CREATE TRIGGER trg_resources_touch BEFORE UPDATE ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
DROP TRIGGER IF EXISTS trg_resource_allocations_touch ON public.resource_allocations;
CREATE TRIGGER trg_resource_allocations_touch BEFORE UPDATE ON public.resource_allocations
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();