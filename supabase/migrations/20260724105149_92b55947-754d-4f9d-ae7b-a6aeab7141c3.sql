
-- 1) rate_items.award_code
ALTER TABLE public.rate_items
  ADD COLUMN IF NOT EXISTS award_code text
  CHECK (award_code IS NULL OR award_code IN ('C','I','E'));

COMMENT ON COLUMN public.rate_items.award_code IS
  'Scope this rate line sits within, for partner award purposes: C = Civils, I = ICP, E = Electrical';

-- 2) scope_awards
CREATE TABLE IF NOT EXISTS public.scope_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  award_code text NOT NULL CHECK (award_code IN ('C','I','E')),
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  notes text,
  awarded_at timestamptz,
  awarded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_package_id, award_code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scope_awards TO authenticated;
GRANT ALL ON public.scope_awards TO service_role;
ALTER TABLE public.scope_awards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scope_awards_auth_all" ON public.scope_awards
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_set_updated_at_scope_awards()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_scope_awards_updated ON public.scope_awards;
CREATE TRIGGER trg_scope_awards_updated BEFORE UPDATE ON public.scope_awards
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_scope_awards();

-- 3) Relax approved rate_items immutability for needs_pricing completion
CREATE OR REPLACE FUNCTION public.prevent_approved_rate_item_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.rate_card_status;
  is_pricing_completion boolean;
BEGIN
  SELECT status INTO v_status
  FROM public.rate_card_versions
  WHERE id = COALESCE(NEW.rate_card_version_id, OLD.rate_card_version_id);

  IF v_status = 'APPROVED' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Rate items on an APPROVED rate card version are immutable. Create a new DRAFT version instead.';
    END IF;

    is_pricing_completion :=
      COALESCE(OLD.needs_pricing, false) = true
      AND NEW.description IS NOT DISTINCT FROM OLD.description
      AND NEW.unit IS NOT DISTINCT FROM OLD.unit
      AND NEW.category IS NOT DISTINCT FROM OLD.category
      AND NEW.rate_code IS NOT DISTINCT FROM OLD.rate_code
      AND NEW.award_code IS NOT DISTINCT FROM OLD.award_code
      AND (NEW.total_unit_cost IS DISTINCT FROM OLD.total_unit_cost OR NEW.client_unit_price IS DISTINCT FROM OLD.client_unit_price);

    IF NOT is_pricing_completion THEN
      RAISE EXCEPTION 'Rate items on an APPROVED rate card version are immutable. Create a new DRAFT version instead.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
