
-- 1. revenue_projects
CREATE TABLE public.revenue_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  stream text NOT NULL CHECK (stream IN ('EV','ICP')),
  project_code text,
  client_id uuid,
  site_id uuid,
  wp_id uuid,
  package_id text,
  site_location text,
  programme text,
  start_date date,
  completion_date date,
  app_date date,
  energisation_date date,
  po_number text,
  contract_value numeric(14,2) DEFAULT 0,
  civils_contractor text,
  elec_contractor text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue_projects TO authenticated;
GRANT ALL ON public.revenue_projects TO service_role;
ALTER TABLE public.revenue_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read revenue projects" ON public.revenue_projects
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = revenue_projects.org_id AND m.user_id = auth.uid())
  );
CREATE POLICY "org members write revenue projects" ON public.revenue_projects
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = revenue_projects.org_id AND m.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = revenue_projects.org_id AND m.user_id = auth.uid())
  );

CREATE INDEX idx_rp_org ON public.revenue_projects(org_id);
CREATE INDEX idx_rp_stream ON public.revenue_projects(org_id, stream);

-- 2. revenue_milestones
CREATE TABLE public.revenue_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.revenue_projects(id) ON DELETE CASCADE,
  milestone_status text NOT NULL,
  invoice_pct numeric(5,2) DEFAULT 0,
  invoice_month date, -- always 1st of month
  forecast_revenue numeric(14,2) DEFAULT 0,
  actual_revenue numeric(14,2) DEFAULT 0,
  forecast_civils numeric(14,2) DEFAULT 0,
  actual_civils numeric(14,2) DEFAULT 0,
  forecast_elec numeric(14,2) DEFAULT 0,
  actual_elec numeric(14,2) DEFAULT 0,
  baseline_revenue numeric(14,2) DEFAULT 0,
  baseline_civils numeric(14,2) DEFAULT 0,
  baseline_elec numeric(14,2) DEFAULT 0,
  invoice_ref text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue_milestones TO authenticated;
GRANT ALL ON public.revenue_milestones TO service_role;
ALTER TABLE public.revenue_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read revenue milestones" ON public.revenue_milestones
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.revenue_projects p
      WHERE p.id = revenue_milestones.project_id
        AND (public.has_role(auth.uid(),'admin')
             OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = p.org_id AND m.user_id = auth.uid()))
    )
  );
CREATE POLICY "write revenue milestones" ON public.revenue_milestones
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.revenue_projects p
      WHERE p.id = revenue_milestones.project_id
        AND (public.has_role(auth.uid(),'admin')
             OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = p.org_id AND m.user_id = auth.uid()))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.revenue_projects p
      WHERE p.id = revenue_milestones.project_id
        AND (public.has_role(auth.uid(),'admin')
             OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = p.org_id AND m.user_id = auth.uid()))
    )
  );

CREATE INDEX idx_rm_project ON public.revenue_milestones(project_id);
CREATE INDEX idx_rm_month ON public.revenue_milestones(invoice_month);

-- 3. revenue_forecast_budget
CREATE TABLE public.revenue_forecast_budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  stream text NOT NULL CHECK (stream IN ('EV','ICP','COMBINED')),
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  budget_revenue numeric(14,2) DEFAULT 0,
  budget_gp numeric(14,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, stream, year, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.revenue_forecast_budget TO authenticated;
GRANT ALL ON public.revenue_forecast_budget TO service_role;
ALTER TABLE public.revenue_forecast_budget ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read budget" ON public.revenue_forecast_budget
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = revenue_forecast_budget.org_id AND m.user_id = auth.uid())
  );
CREATE POLICY "org members write budget" ON public.revenue_forecast_budget
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = revenue_forecast_budget.org_id AND m.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin')
    OR EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = revenue_forecast_budget.org_id AND m.user_id = auth.uid())
  );

-- 4. updated_at triggers
CREATE TRIGGER trg_rp_updated BEFORE UPDATE ON public.revenue_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rm_updated BEFORE UPDATE ON public.revenue_milestones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_rfb_updated BEFORE UPDATE ON public.revenue_forecast_budget
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Monthly rollup function
CREATE OR REPLACE FUNCTION public.revenue_monthly_rollup(_org_id uuid, _year int)
RETURNS TABLE (
  stream text,
  month int,
  forecast_revenue numeric,
  baseline_revenue numeric,
  actual_revenue numeric,
  forecast_civils numeric,
  actual_civils numeric,
  forecast_elec numeric,
  actual_elec numeric,
  forecast_gp numeric,
  actual_gp numeric,
  invoice_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.stream,
    EXTRACT(MONTH FROM m.invoice_month)::int AS month,
    COALESCE(SUM(m.forecast_revenue),0),
    COALESCE(SUM(m.baseline_revenue),0),
    COALESCE(SUM(m.actual_revenue),0),
    COALESCE(SUM(m.forecast_civils),0),
    COALESCE(SUM(m.actual_civils),0),
    COALESCE(SUM(m.forecast_elec),0),
    COALESCE(SUM(m.actual_elec),0),
    COALESCE(SUM(m.forecast_revenue - m.forecast_civils - m.forecast_elec),0),
    COALESCE(SUM(m.actual_revenue - m.actual_civils - m.actual_elec),0),
    COUNT(*)
  FROM public.revenue_milestones m
  JOIN public.revenue_projects p ON p.id = m.project_id
  WHERE p.org_id = _org_id
    AND EXTRACT(YEAR FROM m.invoice_month) = _year
    AND (
      public.has_role(auth.uid(),'admin')
      OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid())
    )
  GROUP BY p.stream, EXTRACT(MONTH FROM m.invoice_month);
$$;

GRANT EXECUTE ON FUNCTION public.revenue_monthly_rollup(uuid, int) TO authenticated;
