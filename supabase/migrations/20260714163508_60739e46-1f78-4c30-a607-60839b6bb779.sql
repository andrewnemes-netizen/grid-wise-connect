
-- Rate card version approval & cloning helpers

CREATE OR REPLACE FUNCTION public.approve_rate_card_version(_version_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card uuid;
  v_status public.rate_card_status;
  v_needs int;
BEGIN
  IF NOT public.is_gridwise_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT rate_card_id, status INTO v_card, v_status
  FROM public.rate_card_versions WHERE id = _version_id;
  IF v_card IS NULL THEN RAISE EXCEPTION 'Version not found'; END IF;
  IF v_status <> 'DRAFT' THEN RAISE EXCEPTION 'Only DRAFT versions can be approved'; END IF;

  SELECT count(*) INTO v_needs FROM public.rate_items
    WHERE rate_card_version_id = _version_id AND needs_pricing = true;
  IF v_needs > 0 THEN
    RAISE EXCEPTION 'Cannot approve: % rate item(s) still need pricing', v_needs;
  END IF;

  -- Supersede any previously approved versions on this card
  UPDATE public.rate_card_versions
    SET status = 'SUPERSEDED', effective_to = now()
    WHERE rate_card_id = v_card AND status = 'APPROVED';

  UPDATE public.rate_card_versions
    SET status = 'APPROVED',
        approved_at = now(),
        approved_by = auth.uid(),
        effective_from = now()
    WHERE id = _version_id;

  INSERT INTO public.audit_log (user_id, action, meta_json)
  VALUES (auth.uid(), 'rate_card_version_approved',
          jsonb_build_object('version_id', _version_id, 'rate_card_id', v_card));

  RETURN _version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.clone_rate_card_version_to_draft(_version_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card uuid;
  v_next int;
  v_new_id uuid;
BEGIN
  IF NOT public.is_gridwise_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT rate_card_id INTO v_card
  FROM public.rate_card_versions WHERE id = _version_id;
  IF v_card IS NULL THEN RAISE EXCEPTION 'Version not found'; END IF;

  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next
  FROM public.rate_card_versions WHERE rate_card_id = v_card;

  INSERT INTO public.rate_card_versions
    (rate_card_id, version_number, status, notes, source_workbook, imported_at, imported_by)
  SELECT rate_card_id, v_next, 'DRAFT',
         'Cloned from v' || version_number, source_workbook, now(), auth.uid()
  FROM public.rate_card_versions WHERE id = _version_id
  RETURNING id INTO v_new_id;

  INSERT INTO public.rate_items
    (rate_card_version_id, rate_code, description, unit, labour_cost, material_cost,
     plant_cost, subcontract_cost, total_unit_cost, client_unit_price, needs_pricing,
     cost_split_available, category, cost_code, cost_code_category, provided_by,
     source_sheet, source_ser, notes)
  SELECT v_new_id, rate_code, description, unit, labour_cost, material_cost,
     plant_cost, subcontract_cost, total_unit_cost, client_unit_price, needs_pricing,
     cost_split_available, category, cost_code, cost_code_category, provided_by,
     source_sheet, source_ser, notes
  FROM public.rate_items WHERE rate_card_version_id = _version_id;

  INSERT INTO public.audit_log (user_id, action, meta_json)
  VALUES (auth.uid(), 'rate_card_version_cloned',
          jsonb_build_object('source_version_id', _version_id,
                             'new_version_id', v_new_id,
                             'rate_card_id', v_card));

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_rate_card_version(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clone_rate_card_version_to_draft(uuid) TO authenticated;
