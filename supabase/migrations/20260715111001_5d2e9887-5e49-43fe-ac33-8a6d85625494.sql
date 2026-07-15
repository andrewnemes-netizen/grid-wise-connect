-- ============= ESTIMATES v2 (Full BOQ engine) =============

CREATE TABLE IF NOT EXISTS public.estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ref TEXT,
  name TEXT NOT NULL DEFAULT 'Estimate 01',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  currency TEXT NOT NULL DEFAULT 'GBP',
  exchange_rate NUMERIC NOT NULL DEFAULT 1,
  gross_margin_pct NUMERIC,
  net_markup_pct NUMERIC,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  total_markup NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  total_discount NUMERIC NOT NULL DEFAULT 0,
  sub_total NUMERIC NOT NULL DEFAULT 0,
  vat_total NUMERIC NOT NULL DEFAULT 0,
  grand_total NUMERIC NOT NULL DEFAULT 0,
  labour_cost NUMERIC NOT NULL DEFAULT 0,
  labour_hours NUMERIC NOT NULL DEFAULT 0,
  material_cost NUMERIC NOT NULL DEFAULT 0,
  hire_cost NUMERIC NOT NULL DEFAULT 0,
  expense_cost NUMERIC NOT NULL DEFAULT 0,
  subcontractor_cost NUMERIC NOT NULL DEFAULT 0,
  show_recipe_totals BOOLEAN NOT NULL DEFAULT true,
  boq_compact_view BOOLEAN NOT NULL DEFAULT false,
  locked BOOLEAN NOT NULL DEFAULT false,
  org_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimates TO authenticated;
GRANT ALL ON public.estimates TO service_role;
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estimates_auth_all" ON public.estimates FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.estimate_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  cost_category TEXT,
  cost_code TEXT,
  color TEXT DEFAULT '#0d7a5f',
  sort_index INTEGER NOT NULL DEFAULT 0,
  collapsed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimate_groups TO authenticated;
GRANT ALL ON public.estimate_groups TO service_role;
ALTER TABLE public.estimate_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estimate_groups_auth_all" ON public.estimate_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.estimate_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.estimate_groups(id) ON DELETE SET NULL,
  recipe_id UUID REFERENCES public.estimate_recipes(id) ON DELETE SET NULL,
  parent_line_id UUID REFERENCES public.estimate_lines(id) ON DELETE CASCADE,
  sort_index INTEGER NOT NULL DEFAULT 0,
  -- BOQ item details
  boq_item_name TEXT NOT NULL DEFAULT '',
  boq_description TEXT,
  pricing_notes TEXT,
  item_logic TEXT DEFAULT 'SUPPLY_AND_INSTALL', -- SUPPLY_AND_INSTALL / SUPPLY_ONLY / INSTALL_ONLY
  qty NUMERIC NOT NULL DEFAULT 1,
  uom TEXT DEFAULT 'ea',
  -- Install
  time_value NUMERIC DEFAULT 0,
  time_measure TEXT DEFAULT 'Minutes',
  no_resources NUMERIC,
  -- Supplier
  supplier TEXT,
  product_service TEXT,
  product_type TEXT,
  -- Pricing
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  markup_type TEXT DEFAULT 'Combination', -- Percentage / Amount / Combination
  markup_dollar NUMERIC DEFAULT 0,
  markup_pct NUMERIC DEFAULT 0,
  contingency_pct NUMERIC DEFAULT 0,
  net_markup_pct NUMERIC DEFAULT 0,
  -- Totals
  total_cost NUMERIC NOT NULL DEFAULT 0,
  total_markup NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  discount NUMERIC NOT NULL DEFAULT 0,
  sub_total NUMERIC NOT NULL DEFAULT 0,
  -- Tax
  vat_rate NUMERIC DEFAULT 20,
  vat_amount NUMERIC DEFAULT 0,
  grand_total NUMERIC DEFAULT 0,
  -- Financial terms
  cost_category TEXT,
  cost_code TEXT,
  charge_out_rate_used TEXT DEFAULT 'BOQ Item Rate',
  conversion_type TEXT DEFAULT 'Show on Convert',
  show_image_in_proposal BOOLEAN DEFAULT false,
  solution_link TEXT,
  image_link TEXT,
  -- Estimating features
  itemised BOOLEAN DEFAULT false,
  flexible_qty BOOLEAN DEFAULT false,
  fixed_price BOOLEAN DEFAULT false,
  lock_markup_dollar BOOLEAN DEFAULT false,
  split_labour_materials BOOLEAN DEFAULT false,
  calculate_time BOOLEAN DEFAULT true,
  rfq_required BOOLEAN DEFAULT false,
  is_allowance BOOLEAN DEFAULT false,
  -- Comparison / grouping
  compare_list TEXT,
  compare_title TEXT,
  -- Task sync
  project_sync_type TEXT,
  project_task_name TEXT,
  project_description TEXT,
  task_owner UUID REFERENCES auth.users(id),
  milestone_for_sync TEXT,
  project_stage TEXT,
  include_in_create_task BOOLEAN DEFAULT true,
  -- Attributes
  stage TEXT,
  attribute_group TEXT,
  locked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimate_lines TO authenticated;
GRANT ALL ON public.estimate_lines TO service_role;
ALTER TABLE public.estimate_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estimate_lines_auth_all" ON public.estimate_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_estimate_lines_estimate ON public.estimate_lines(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_lines_group ON public.estimate_lines(group_id);
CREATE INDEX IF NOT EXISTS idx_estimate_groups_estimate ON public.estimate_groups(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimates_wp ON public.estimates(work_package_id);
CREATE INDEX IF NOT EXISTS idx_estimates_project ON public.estimates(project_id);

CREATE TABLE IF NOT EXISTS public.estimate_allowances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  category TEXT,
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estimate_allowances TO authenticated;
GRANT ALL ON public.estimate_allowances TO service_role;
ALTER TABLE public.estimate_allowances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estimate_allowances_auth_all" ON public.estimate_allowances FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Reusable updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_estimates_updated ON public.estimates;
CREATE TRIGGER trg_estimates_updated BEFORE UPDATE ON public.estimates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_estimate_groups_updated ON public.estimate_groups;
CREATE TRIGGER trg_estimate_groups_updated BEFORE UPDATE ON public.estimate_groups
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_estimate_lines_updated ON public.estimate_lines;
CREATE TRIGGER trg_estimate_lines_updated BEFORE UPDATE ON public.estimate_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS trg_estimate_allowances_updated ON public.estimate_allowances;
CREATE TRIGGER trg_estimate_allowances_updated BEFORE UPDATE ON public.estimate_allowances
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Line total recalculation trigger
CREATE OR REPLACE FUNCTION public.tg_recalc_estimate_line()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  base_cost NUMERIC;
  markup_amt NUMERIC;
BEGIN
  base_cost := COALESCE(NEW.qty,0) * COALESCE(NEW.unit_cost,0);
  NEW.total_cost := ROUND(base_cost::numeric, 2);

  IF NEW.markup_type = 'Percentage' THEN
    markup_amt := base_cost * COALESCE(NEW.markup_pct,0) / 100.0;
  ELSIF NEW.markup_type = 'Amount' THEN
    markup_amt := COALESCE(NEW.markup_dollar,0) * COALESCE(NEW.qty,0);
  ELSE -- Combination
    markup_amt := COALESCE(NEW.markup_dollar,0) * COALESCE(NEW.qty,0)
                + base_cost * COALESCE(NEW.markup_pct,0) / 100.0;
  END IF;
  markup_amt := markup_amt + base_cost * COALESCE(NEW.contingency_pct,0) / 100.0;

  NEW.total_markup := ROUND(markup_amt::numeric, 2);
  NEW.total_price := ROUND((base_cost + markup_amt)::numeric, 2);
  IF NEW.qty > 0 THEN
    NEW.unit_price := ROUND((NEW.total_price / NEW.qty)::numeric, 4);
    NEW.net_markup_pct := CASE WHEN base_cost > 0 THEN ROUND((markup_amt / base_cost * 100)::numeric, 2) ELSE 0 END;
  END IF;
  NEW.sub_total := ROUND((NEW.total_price - COALESCE(NEW.discount,0))::numeric, 2);
  NEW.vat_amount := ROUND((NEW.sub_total * COALESCE(NEW.vat_rate,0) / 100.0)::numeric, 2);
  NEW.grand_total := ROUND((NEW.sub_total + NEW.vat_amount)::numeric, 2);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_estimate_lines_recalc ON public.estimate_lines;
CREATE TRIGGER trg_estimate_lines_recalc BEFORE INSERT OR UPDATE ON public.estimate_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_recalc_estimate_line();

-- Estimate rollup trigger
CREATE OR REPLACE FUNCTION public.tg_rollup_estimate()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  eid UUID;
BEGIN
  eid := COALESCE(NEW.estimate_id, OLD.estimate_id);
  UPDATE public.estimates SET
    total_cost = COALESCE((SELECT SUM(total_cost) FROM public.estimate_lines WHERE estimate_id = eid), 0),
    total_markup = COALESCE((SELECT SUM(total_markup) FROM public.estimate_lines WHERE estimate_id = eid), 0),
    total_price = COALESCE((SELECT SUM(total_price) FROM public.estimate_lines WHERE estimate_id = eid), 0),
    total_discount = COALESCE((SELECT SUM(discount) FROM public.estimate_lines WHERE estimate_id = eid), 0),
    sub_total = COALESCE((SELECT SUM(sub_total) FROM public.estimate_lines WHERE estimate_id = eid), 0),
    vat_total = COALESCE((SELECT SUM(vat_amount) FROM public.estimate_lines WHERE estimate_id = eid), 0),
    grand_total = COALESCE((SELECT SUM(grand_total) FROM public.estimate_lines WHERE estimate_id = eid), 0),
    updated_at = now()
  WHERE id = eid;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_estimate_lines_rollup ON public.estimate_lines;
CREATE TRIGGER trg_estimate_lines_rollup AFTER INSERT OR UPDATE OR DELETE ON public.estimate_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_rollup_estimate();

-- ============= GANTT: task dependencies + full scheduling on wp_tasks =============
ALTER TABLE public.wp_tasks
  ADD COLUMN IF NOT EXISTS milestone_id UUID REFERENCES public.wp_milestones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duration_days NUMERIC,
  ADD COLUMN IF NOT EXISTS sort_index INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gantt_color TEXT;

-- wp_task_dependencies already exists; ensure link_type column
ALTER TABLE public.wp_task_dependencies
  ADD COLUMN IF NOT EXISTS link_type TEXT NOT NULL DEFAULT 'FS',
  ADD COLUMN IF NOT EXISTS lag_days NUMERIC NOT NULL DEFAULT 0;
