
CREATE TYPE public.wp_estimate_status AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED');
CREATE TYPE public.wp_estimate_adjustment_kind AS ENUM (
  'contingency', 'preliminaries', 'overhead', 'discount', 'risk', 'management_fee', 'other'
);

-- work_package_estimates
CREATE TABLE public.work_package_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id UUID NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL,
  rate_card_version_id UUID REFERENCES public.rate_card_versions(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  version_number INTEGER NOT NULL DEFAULT 1,
  status public.wp_estimate_status NOT NULL DEFAULT 'DRAFT',
  currency TEXT NOT NULL DEFAULT 'GBP',
  sites_total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  sites_total_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  adjustments_total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  adjustments_total_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_markup NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  superseded_by_estimate_id UUID REFERENCES public.work_package_estimates(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (work_package_id, version_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_package_estimates TO authenticated;
GRANT ALL ON public.work_package_estimates TO service_role;
ALTER TABLE public.work_package_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view wp estimates" ON public.work_package_estimates
  FOR SELECT TO authenticated USING (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can insert wp estimates" ON public.work_package_estimates
  FOR INSERT TO authenticated WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can update wp estimates" ON public.work_package_estimates
  FOR UPDATE TO authenticated USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can delete wp estimates" ON public.work_package_estimates
  FOR DELETE TO authenticated USING (public.is_gridwise_staff(auth.uid()));

CREATE INDEX idx_wp_estimates_wp ON public.work_package_estimates(work_package_id);
CREATE INDEX idx_wp_estimates_contract ON public.work_package_estimates(contract_id);
CREATE INDEX idx_wp_estimates_status ON public.work_package_estimates(status);
CREATE TRIGGER trg_wp_estimates_updated_at BEFORE UPDATE ON public.work_package_estimates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- wp_estimate_sites
CREATE TABLE public.wp_estimate_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wp_estimate_id UUID NOT NULL REFERENCES public.work_package_estimates(id) ON DELETE CASCADE,
  site_estimate_id UUID NOT NULL REFERENCES public.site_estimates(id) ON DELETE RESTRICT,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  included BOOLEAN NOT NULL DEFAULT true,
  contribution_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  contribution_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wp_estimate_id, site_estimate_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wp_estimate_sites TO authenticated;
GRANT ALL ON public.wp_estimate_sites TO service_role;
ALTER TABLE public.wp_estimate_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view wp estimate sites" ON public.wp_estimate_sites
  FOR SELECT TO authenticated USING (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can insert wp estimate sites" ON public.wp_estimate_sites
  FOR INSERT TO authenticated WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can update wp estimate sites" ON public.wp_estimate_sites
  FOR UPDATE TO authenticated USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can delete wp estimate sites" ON public.wp_estimate_sites
  FOR DELETE TO authenticated USING (public.is_gridwise_staff(auth.uid()));

CREATE INDEX idx_wp_estimate_sites_estimate ON public.wp_estimate_sites(wp_estimate_id);
CREATE INDEX idx_wp_estimate_sites_site ON public.wp_estimate_sites(site_id);
CREATE TRIGGER trg_wp_estimate_sites_updated_at BEFORE UPDATE ON public.wp_estimate_sites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- wp_estimate_adjustments
CREATE TABLE public.wp_estimate_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wp_estimate_id UUID NOT NULL REFERENCES public.work_package_estimates(id) ON DELETE CASCADE,
  kind public.wp_estimate_adjustment_kind NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  applies_to TEXT NOT NULL DEFAULT 'total',
  is_percentage BOOLEAN NOT NULL DEFAULT false,
  percentage NUMERIC(6,3),
  amount_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wp_estimate_adjustments TO authenticated;
GRANT ALL ON public.wp_estimate_adjustments TO service_role;
ALTER TABLE public.wp_estimate_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view wp estimate adjustments" ON public.wp_estimate_adjustments
  FOR SELECT TO authenticated USING (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can insert wp estimate adjustments" ON public.wp_estimate_adjustments
  FOR INSERT TO authenticated WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can update wp estimate adjustments" ON public.wp_estimate_adjustments
  FOR UPDATE TO authenticated USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can delete wp estimate adjustments" ON public.wp_estimate_adjustments
  FOR DELETE TO authenticated USING (public.is_gridwise_staff(auth.uid()));

CREATE INDEX idx_wp_estimate_adjustments_estimate ON public.wp_estimate_adjustments(wp_estimate_id);
CREATE TRIGGER trg_wp_estimate_adjustments_updated_at BEFORE UPDATE ON public.wp_estimate_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Immutability guard for approved WP estimates
CREATE OR REPLACE FUNCTION public.prevent_approved_wp_estimate_child_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.wp_estimate_status;
  v_id UUID;
BEGIN
  v_id := COALESCE(OLD.wp_estimate_id, NEW.wp_estimate_id);
  SELECT status INTO v_status FROM public.work_package_estimates WHERE id = v_id;
  IF v_status = 'APPROVED' THEN
    RAISE EXCEPTION 'Cannot modify children of an APPROVED work-package estimate. Create a new draft version instead.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_prevent_approved_wp_estimate_sites_change
  BEFORE UPDATE OR DELETE ON public.wp_estimate_sites
  FOR EACH ROW EXECUTE FUNCTION public.prevent_approved_wp_estimate_child_change();

CREATE TRIGGER trg_prevent_approved_wp_estimate_adjustments_change
  BEFORE UPDATE OR DELETE ON public.wp_estimate_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_approved_wp_estimate_child_change();
