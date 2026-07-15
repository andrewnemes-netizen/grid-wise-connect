
-- Phase 8: actual_costs tracking + v_wp_commercial_position view

CREATE TYPE public.actual_cost_category AS ENUM ('labour','material','plant','subcontractor','expense','other');
CREATE TYPE public.actual_cost_source AS ENUM ('manual','invoice','timesheet','po','import');

CREATE TABLE public.actual_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  work_package_id UUID NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  wp_task_id UUID REFERENCES public.wp_tasks(id) ON DELETE SET NULL,
  site_id UUID,
  estimate_line_id UUID REFERENCES public.estimate_lines(id) ON DELETE SET NULL,
  resource_id UUID REFERENCES public.resources(id) ON DELETE SET NULL,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  category public.actual_cost_category NOT NULL DEFAULT 'other',
  cost_code TEXT,
  description TEXT,
  qty NUMERIC,
  uom TEXT,
  unit_cost NUMERIC,
  amount NUMERIC NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GBP',
  incurred_on DATE NOT NULL DEFAULT CURRENT_DATE,
  source public.actual_cost_source NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  supplier TEXT,
  invoice_number TEXT,
  notes TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.actual_costs TO authenticated;
GRANT ALL ON public.actual_costs TO service_role;

ALTER TABLE public.actual_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view actual costs"
ON public.actual_costs FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = actual_costs.org_id AND om.user_id = auth.uid()));

CREATE POLICY "Admins/engineers can insert actual costs"
ON public.actual_costs FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = actual_costs.org_id AND om.user_id = auth.uid())
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'engineer'))
);

CREATE POLICY "Admins/engineers can update actual costs"
ON public.actual_costs FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = actual_costs.org_id AND om.user_id = auth.uid())
  AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'engineer'))
);

CREATE POLICY "Admins can delete actual costs"
ON public.actual_costs FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_actual_costs_wp ON public.actual_costs(work_package_id);
CREATE INDEX idx_actual_costs_org ON public.actual_costs(org_id);
CREATE INDEX idx_actual_costs_task ON public.actual_costs(wp_task_id);
CREATE INDEX idx_actual_costs_estimate_line ON public.actual_costs(estimate_line_id);
CREATE INDEX idx_actual_costs_incurred_on ON public.actual_costs(incurred_on);
CREATE INDEX idx_actual_costs_category ON public.actual_costs(category);

CREATE TRIGGER update_actual_costs_updated_at
BEFORE UPDATE ON public.actual_costs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- v_wp_commercial_position: budget vs awarded estimate vs actual costs
CREATE OR REPLACE VIEW public.v_wp_commercial_position
WITH (security_invoker = true)
AS
WITH awarded AS (
  SELECT
    e.work_package_id,
    SUM(COALESCE(e.total_cost,0))  AS awarded_cost,
    SUM(COALESCE(e.total_price,0)) AS awarded_price,
    SUM(COALESCE(e.grand_total,0)) AS awarded_grand_total
  FROM public.estimates e
  WHERE e.is_current = true
    AND LOWER(COALESCE(e.status,'')) IN ('awarded','approved','accepted')
  GROUP BY e.work_package_id
),
actuals AS (
  SELECT
    ac.work_package_id,
    SUM(COALESCE(ac.amount,0)) AS actual_cost,
    SUM(CASE WHEN ac.category='labour'       THEN COALESCE(ac.amount,0) ELSE 0 END) AS actual_labour,
    SUM(CASE WHEN ac.category='material'     THEN COALESCE(ac.amount,0) ELSE 0 END) AS actual_material,
    SUM(CASE WHEN ac.category='plant'        THEN COALESCE(ac.amount,0) ELSE 0 END) AS actual_plant,
    SUM(CASE WHEN ac.category='subcontractor'THEN COALESCE(ac.amount,0) ELSE 0 END) AS actual_subcontractor,
    SUM(CASE WHEN ac.category='expense'      THEN COALESCE(ac.amount,0) ELSE 0 END) AS actual_expense,
    SUM(CASE WHEN ac.category='other'        THEN COALESCE(ac.amount,0) ELSE 0 END) AS actual_other
  FROM public.actual_costs ac
  GROUP BY ac.work_package_id
)
SELECT
  wp.id AS work_package_id,
  wp.code,
  wp.name,
  wp.status,
  wp.programme_id,
  COALESCE(wp.budget_amount,0)             AS budget_amount,
  COALESCE(a.awarded_cost,0)               AS awarded_cost,
  COALESCE(a.awarded_price,0)              AS awarded_price,
  COALESCE(a.awarded_grand_total,0)        AS awarded_grand_total,
  COALESCE(ac.actual_cost,0)               AS actual_cost,
  COALESCE(ac.actual_labour,0)             AS actual_labour,
  COALESCE(ac.actual_material,0)           AS actual_material,
  COALESCE(ac.actual_plant,0)              AS actual_plant,
  COALESCE(ac.actual_subcontractor,0)      AS actual_subcontractor,
  COALESCE(ac.actual_expense,0)            AS actual_expense,
  COALESCE(ac.actual_other,0)              AS actual_other,
  COALESCE(a.awarded_cost,0) - COALESCE(ac.actual_cost,0)              AS cost_variance,
  COALESCE(wp.budget_amount,0) - COALESCE(ac.actual_cost,0)            AS budget_variance,
  COALESCE(a.awarded_price,0) - COALESCE(ac.actual_cost,0)             AS forecast_margin,
  CASE WHEN COALESCE(a.awarded_price,0) > 0
       THEN (COALESCE(a.awarded_price,0) - COALESCE(ac.actual_cost,0)) / a.awarded_price
       ELSE NULL END                                                    AS forecast_margin_pct,
  CASE WHEN COALESCE(a.awarded_cost,0) > 0
       THEN COALESCE(ac.actual_cost,0) / a.awarded_cost
       ELSE NULL END                                                    AS cost_pct_of_awarded
FROM public.work_packages wp
LEFT JOIN awarded a  ON a.work_package_id  = wp.id
LEFT JOIN actuals ac ON ac.work_package_id = wp.id;

GRANT SELECT ON public.v_wp_commercial_position TO authenticated;
GRANT SELECT ON public.v_wp_commercial_position TO service_role;
