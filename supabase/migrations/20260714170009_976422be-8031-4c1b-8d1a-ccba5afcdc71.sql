
-- Variations against APPROVED WP estimates
CREATE TABLE public.wp_estimate_variations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wp_estimate_id UUID NOT NULL REFERENCES public.work_package_estimates(id) ON DELETE CASCADE,
  variation_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
  delta_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  delta_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'GBP',
  submitted_by UUID REFERENCES auth.users(id),
  submitted_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  decision_notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (wp_estimate_id, variation_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wp_estimate_variations TO authenticated;
GRANT ALL ON public.wp_estimate_variations TO service_role;

ALTER TABLE public.wp_estimate_variations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view wp estimate variations"
  ON public.wp_estimate_variations FOR SELECT TO authenticated
  USING (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can insert wp estimate variations"
  ON public.wp_estimate_variations FOR INSERT TO authenticated
  WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can update wp estimate variations"
  ON public.wp_estimate_variations FOR UPDATE TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can delete wp estimate variations"
  ON public.wp_estimate_variations FOR DELETE TO authenticated
  USING (public.is_gridwise_staff(auth.uid()));

CREATE TRIGGER update_wp_estimate_variations_updated_at
BEFORE UPDATE ON public.wp_estimate_variations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_wp_estimate_variations_estimate ON public.wp_estimate_variations(wp_estimate_id, status);

-- Line items on a variation
CREATE TABLE public.wp_estimate_variation_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  variation_id UUID NOT NULL REFERENCES public.wp_estimate_variations(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  rate_item_id UUID REFERENCES public.rate_items(id) ON DELETE SET NULL,
  rate_code TEXT,
  description TEXT NOT NULL,
  unit TEXT,
  quantity NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  unit_price NUMERIC(14,4) NOT NULL DEFAULT 0,
  line_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'ADD' CHECK (kind IN ('ADD','REMOVE','CHANGE')),
  sort_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wp_estimate_variation_lines TO authenticated;
GRANT ALL ON public.wp_estimate_variation_lines TO service_role;

ALTER TABLE public.wp_estimate_variation_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view wp variation lines"
  ON public.wp_estimate_variation_lines FOR SELECT TO authenticated
  USING (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can insert wp variation lines"
  ON public.wp_estimate_variation_lines FOR INSERT TO authenticated
  WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can update wp variation lines"
  ON public.wp_estimate_variation_lines FOR UPDATE TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "Staff can delete wp variation lines"
  ON public.wp_estimate_variation_lines FOR DELETE TO authenticated
  USING (public.is_gridwise_staff(auth.uid()));

CREATE TRIGGER update_wp_variation_lines_updated_at
BEFORE UPDATE ON public.wp_estimate_variation_lines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_wp_variation_lines_variation ON public.wp_estimate_variation_lines(variation_id);

-- RPCs -----------------------------------------------------------------
-- Assign next variation_number and create draft
CREATE OR REPLACE FUNCTION public.create_wp_estimate_variation(
  _wp_estimate_id UUID,
  _title TEXT,
  _description TEXT DEFAULT NULL,
  _reason TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_next INT;
  v_status TEXT;
BEGIN
  IF NOT public.is_gridwise_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorised';
  END IF;
  SELECT status INTO v_status FROM public.work_package_estimates WHERE id = _wp_estimate_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'wp estimate not found'; END IF;
  IF v_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'variations can only be raised against APPROVED wp estimates (current: %)', v_status;
  END IF;

  SELECT COALESCE(MAX(variation_number),0)+1 INTO v_next
    FROM public.wp_estimate_variations WHERE wp_estimate_id = _wp_estimate_id;

  INSERT INTO public.wp_estimate_variations(wp_estimate_id, variation_number, title, description, reason, created_by)
  VALUES (_wp_estimate_id, v_next, _title, _description, _reason, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.audit_log(actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'wp_variation.create', 'wp_estimate_variation', v_id,
          jsonb_build_object('wp_estimate_id', _wp_estimate_id, 'variation_number', v_next));
  RETURN v_id;
END;
$$;

-- Recalculate deltas from lines
CREATE OR REPLACE FUNCTION public.recalc_wp_estimate_variation(_variation_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE t_cost NUMERIC(14,2); t_price NUMERIC(14,2);
BEGIN
  SELECT COALESCE(SUM(CASE WHEN kind = 'REMOVE' THEN -line_cost  ELSE line_cost  END),0),
         COALESCE(SUM(CASE WHEN kind = 'REMOVE' THEN -line_price ELSE line_price END),0)
    INTO t_cost, t_price
    FROM public.wp_estimate_variation_lines WHERE variation_id = _variation_id;
  UPDATE public.wp_estimate_variations
     SET delta_cost = t_cost, delta_price = t_price, updated_at = now()
   WHERE id = _variation_id;
END;
$$;

-- Transitions
CREATE OR REPLACE FUNCTION public.submit_wp_estimate_variation(_variation_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_status TEXT;
BEGIN
  IF NOT public.is_gridwise_staff(auth.uid()) THEN RAISE EXCEPTION 'not authorised'; END IF;
  SELECT status INTO v_status FROM public.wp_estimate_variations WHERE id = _variation_id;
  IF v_status <> 'DRAFT' THEN RAISE EXCEPTION 'only DRAFT variations can be submitted'; END IF;
  PERFORM public.recalc_wp_estimate_variation(_variation_id);
  UPDATE public.wp_estimate_variations
     SET status = 'SUBMITTED', submitted_by = auth.uid(), submitted_at = now()
   WHERE id = _variation_id;
  INSERT INTO public.audit_log(actor_id, action, entity_type, entity_id)
  VALUES (auth.uid(),'wp_variation.submit','wp_estimate_variation',_variation_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_wp_estimate_variation(
  _variation_id UUID, _approve BOOLEAN, _notes TEXT DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_status TEXT;
BEGIN
  IF NOT public.is_gridwise_staff(auth.uid()) THEN RAISE EXCEPTION 'not authorised'; END IF;
  SELECT status INTO v_status FROM public.wp_estimate_variations WHERE id = _variation_id;
  IF v_status <> 'SUBMITTED' THEN RAISE EXCEPTION 'only SUBMITTED variations can be decided'; END IF;
  PERFORM public.recalc_wp_estimate_variation(_variation_id);
  UPDATE public.wp_estimate_variations
     SET status = CASE WHEN _approve THEN 'APPROVED' ELSE 'REJECTED' END,
         decided_by = auth.uid(), decided_at = now(), decision_notes = _notes
   WHERE id = _variation_id;
  INSERT INTO public.audit_log(actor_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(),
          CASE WHEN _approve THEN 'wp_variation.approve' ELSE 'wp_variation.reject' END,
          'wp_estimate_variation', _variation_id,
          jsonb_build_object('notes', _notes));
END;
$$;
