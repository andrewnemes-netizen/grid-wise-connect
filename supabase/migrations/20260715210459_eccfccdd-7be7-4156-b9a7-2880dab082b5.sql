-- Phase 4: Estimating revisions, prelims, and award trigger

-- 1) estimates: revision + prelims + award columns
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS revision int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS source_estimate_id uuid REFERENCES public.estimates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prelims_pct numeric,
  ADD COLUMN IF NOT EXISTS prelims_amount numeric,
  ADD COLUMN IF NOT EXISTS awarded_at timestamptz,
  ADD COLUMN IF NOT EXISTS awarded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS awarded_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_estimates_source_lineage ON public.estimates(source_estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimates_is_current ON public.estimates(is_current) WHERE is_current = true;

-- 2) estimate_lines: prelim tagging
ALTER TABLE public.estimate_lines
  ADD COLUMN IF NOT EXISTS is_prelim boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_estimate_lines_prelim ON public.estimate_lines(estimate_id) WHERE is_prelim = true;

-- 3) Helper: clone an estimate as a new revision
CREATE OR REPLACE FUNCTION public.clone_estimate_as_revision(_estimate_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_id uuid;
  _root_id uuid;
  _next_rev int;
BEGIN
  -- Find lineage root: walk source_estimate_id chain
  SELECT COALESCE(source_estimate_id, id) INTO _root_id
  FROM public.estimates WHERE id = _estimate_id;

  SELECT COALESCE(MAX(revision), 0) + 1 INTO _next_rev
  FROM public.estimates
  WHERE id = _root_id OR source_estimate_id = _root_id;

  -- Mark all existing revisions in lineage not current
  UPDATE public.estimates
     SET is_current = false
   WHERE id = _root_id OR source_estimate_id = _root_id;

  -- Insert clone
  INSERT INTO public.estimates (
    name, description, currency, exchange_rate, project_id, work_package_id, org_id,
    rate_card_version_id, status, revision, is_current, source_estimate_id,
    prelims_pct, prelims_amount, visibility_lens_default, boq_compact_view, show_recipe_totals,
    created_by
  )
  SELECT
    name || ' (Rev ' || _next_rev || ')',
    description, currency, exchange_rate, project_id, work_package_id, org_id,
    rate_card_version_id, 'DRAFT', _next_rev, true, _root_id,
    prelims_pct, prelims_amount, visibility_lens_default, boq_compact_view, show_recipe_totals,
    auth.uid()
  FROM public.estimates
  WHERE id = _estimate_id
  RETURNING id INTO _new_id;

  -- Copy lines
  INSERT INTO public.estimate_lines (estimate_id, is_prelim,
    description, ref, qty, uom, unit_rate_id, rate_item_id, recipe_id,
    material_cost, labour_cost, subcontractor_cost, hire_cost, expense_cost,
    labour_hours, markup_pct, discount_pct, vat_rate,
    line_total, sub_total, total_cost, total_price, total_markup, total_discount,
    parent_line_id, sort_order, group_id, notes,
    visibility_lens, waste_pct, currency
  )
  SELECT _new_id, is_prelim,
    description, ref, qty, uom, unit_rate_id, rate_item_id, recipe_id,
    material_cost, labour_cost, subcontractor_cost, hire_cost, expense_cost,
    labour_hours, markup_pct, discount_pct, vat_rate,
    line_total, sub_total, total_cost, total_price, total_markup, total_discount,
    parent_line_id, sort_order, group_id, notes,
    visibility_lens, waste_pct, currency
  FROM public.estimate_lines
  WHERE estimate_id = _estimate_id
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'estimate_lines' AND column_name = 'is_prelim'
    );

  RETURN _new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clone_estimate_as_revision(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clone_estimate_as_revision(uuid) TO authenticated;

-- 4) Award trigger: on AWARDED, supersede siblings and stamp awarded_at
CREATE OR REPLACE FUNCTION public.on_estimate_awarded()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _root_id uuid;
BEGIN
  IF NEW.status = 'AWARDED' AND (OLD.status IS DISTINCT FROM 'AWARDED') THEN
    IF NEW.awarded_at IS NULL THEN
      NEW.awarded_at := now();
    END IF;
    IF NEW.awarded_by IS NULL THEN
      NEW.awarded_by := auth.uid();
    END IF;
    NEW.is_current := true;

    _root_id := COALESCE(NEW.source_estimate_id, NEW.id);

    UPDATE public.estimates
       SET status = 'SUPERSEDED',
           is_current = false
     WHERE (id = _root_id OR source_estimate_id = _root_id)
       AND id <> NEW.id
       AND status <> 'AWARDED';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_estimate_award ON public.estimates;
CREATE TRIGGER trg_estimate_award
  BEFORE UPDATE OF status ON public.estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.on_estimate_awarded();