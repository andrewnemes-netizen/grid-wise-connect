
-- Enums
CREATE TYPE public.site_estimate_status AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED');
CREATE TYPE public.site_estimate_exception_kind AS ENUM (
  'missing_rate', 'unconfirmed_quantity', 'price_override', 'manual_addition', 'allowance_review', 'other'
);
CREATE TYPE public.site_estimate_exception_severity AS ENUM ('info', 'warning', 'blocker');

-- site_estimates
CREATE TABLE public.site_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  rate_card_version_id UUID REFERENCES public.rate_card_versions(id) ON DELETE SET NULL,
  recipe_id UUID REFERENCES public.estimate_recipes(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  status public.site_estimate_status NOT NULL DEFAULT 'DRAFT',
  currency TEXT NOT NULL DEFAULT 'GBP',
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_markup NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  superseded_by_estimate_id UUID REFERENCES public.site_estimates(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, version_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_estimates TO authenticated;
GRANT ALL ON public.site_estimates TO service_role;
ALTER TABLE public.site_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view site estimates" ON public.site_estimates
  FOR SELECT TO authenticated USING (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can insert site estimates" ON public.site_estimates
  FOR INSERT TO authenticated WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can update site estimates" ON public.site_estimates
  FOR UPDATE TO authenticated USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can delete site estimates" ON public.site_estimates
  FOR DELETE TO authenticated USING (public.is_gridwise_staff(auth.uid()));

CREATE INDEX idx_site_estimates_site ON public.site_estimates(site_id);
CREATE INDEX idx_site_estimates_contract ON public.site_estimates(contract_id);
CREATE INDEX idx_site_estimates_status ON public.site_estimates(status);
CREATE TRIGGER trg_site_estimates_updated_at BEFORE UPDATE ON public.site_estimates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- site_estimate_lines
CREATE TABLE public.site_estimate_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_estimate_id UUID NOT NULL REFERENCES public.site_estimates(id) ON DELETE CASCADE,
  recipe_item_id UUID REFERENCES public.recipe_items(id) ON DELETE SET NULL,
  rate_item_id UUID REFERENCES public.rate_items(id) ON DELETE SET NULL,
  rate_code TEXT,
  description TEXT NOT NULL,
  unit TEXT,
  quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_price NUMERIC(14,4) NOT NULL DEFAULT 0,
  markup_amount NUMERIC(14,4) NOT NULL DEFAULT 0,
  markup_pct NUMERIC(6,3),
  line_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  stage TEXT,
  cost_code TEXT,
  cost_code_category TEXT,
  is_allowance BOOLEAN NOT NULL DEFAULT false,
  is_manual_addition BOOLEAN NOT NULL DEFAULT false,
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_estimate_lines TO authenticated;
GRANT ALL ON public.site_estimate_lines TO service_role;
ALTER TABLE public.site_estimate_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view site estimate lines" ON public.site_estimate_lines
  FOR SELECT TO authenticated USING (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can insert site estimate lines" ON public.site_estimate_lines
  FOR INSERT TO authenticated WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can update site estimate lines" ON public.site_estimate_lines
  FOR UPDATE TO authenticated USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can delete site estimate lines" ON public.site_estimate_lines
  FOR DELETE TO authenticated USING (public.is_gridwise_staff(auth.uid()));

CREATE INDEX idx_site_estimate_lines_estimate ON public.site_estimate_lines(site_estimate_id);
CREATE INDEX idx_site_estimate_lines_rate_item ON public.site_estimate_lines(rate_item_id);
CREATE TRIGGER trg_site_estimate_lines_updated_at BEFORE UPDATE ON public.site_estimate_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- site_estimate_exceptions
CREATE TABLE public.site_estimate_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_estimate_id UUID NOT NULL REFERENCES public.site_estimates(id) ON DELETE CASCADE,
  site_estimate_line_id UUID REFERENCES public.site_estimate_lines(id) ON DELETE CASCADE,
  kind public.site_estimate_exception_kind NOT NULL,
  severity public.site_estimate_exception_severity NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_estimate_exceptions TO authenticated;
GRANT ALL ON public.site_estimate_exceptions TO service_role;
ALTER TABLE public.site_estimate_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view site estimate exceptions" ON public.site_estimate_exceptions
  FOR SELECT TO authenticated USING (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can insert site estimate exceptions" ON public.site_estimate_exceptions
  FOR INSERT TO authenticated WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can update site estimate exceptions" ON public.site_estimate_exceptions
  FOR UPDATE TO authenticated USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can delete site estimate exceptions" ON public.site_estimate_exceptions
  FOR DELETE TO authenticated USING (public.is_gridwise_staff(auth.uid()));

CREATE INDEX idx_site_estimate_exceptions_estimate ON public.site_estimate_exceptions(site_estimate_id);
CREATE INDEX idx_site_estimate_exceptions_kind ON public.site_estimate_exceptions(kind);
CREATE TRIGGER trg_site_estimate_exceptions_updated_at BEFORE UPDATE ON public.site_estimate_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Immutability guard: prevent edits/deletes on lines of APPROVED estimates
CREATE OR REPLACE FUNCTION public.prevent_approved_site_estimate_line_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.site_estimate_status;
  v_id UUID;
BEGIN
  v_id := COALESCE(OLD.site_estimate_id, NEW.site_estimate_id);
  SELECT status INTO v_status FROM public.site_estimates WHERE id = v_id;
  IF v_status = 'APPROVED' THEN
    RAISE EXCEPTION 'Cannot modify lines on an APPROVED site estimate. Create a new draft version instead.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_prevent_approved_site_estimate_line_change
  BEFORE UPDATE OR DELETE ON public.site_estimate_lines
  FOR EACH ROW EXECUTE FUNCTION public.prevent_approved_site_estimate_line_change();
