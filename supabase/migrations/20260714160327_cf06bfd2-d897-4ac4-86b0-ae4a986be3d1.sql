
CREATE OR REPLACE FUNCTION public.approve_site_estimate(p_estimate_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS public.site_estimates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.site_estimates;
BEGIN
  IF v_uid IS NULL OR NOT public.is_gridwise_staff(v_uid) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT * INTO v_row FROM public.site_estimates WHERE id = p_estimate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Site estimate not found'; END IF;
  IF v_row.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only DRAFT site estimates can be approved (current: %)', v_row.status;
  END IF;

  UPDATE public.site_estimates
     SET status='APPROVED', approved_at=now(), approved_by=v_uid,
         notes=COALESCE(p_notes, notes), updated_at=now()
   WHERE id=p_estimate_id RETURNING * INTO v_row;

  INSERT INTO public.audit_log (user_id, action, site_id, meta_json)
  VALUES (v_uid, 'site_estimate.approve', v_row.site_id,
          jsonb_build_object('entity_type','site_estimate','entity_id',p_estimate_id,
                             'version_number',v_row.version_number,'total_price',v_row.total_price));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.clone_site_estimate_to_draft(p_estimate_id UUID)
RETURNS public.site_estimates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_src public.site_estimates;
  v_new public.site_estimates;
  v_next INTEGER;
BEGIN
  IF v_uid IS NULL OR NOT public.is_gridwise_staff(v_uid) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT * INTO v_src FROM public.site_estimates WHERE id=p_estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Site estimate not found'; END IF;

  SELECT COALESCE(MAX(version_number),0)+1 INTO v_next
    FROM public.site_estimates WHERE site_id=v_src.site_id;

  INSERT INTO public.site_estimates
    (site_id, contract_id, rate_card_version_id, recipe_id, name, version_number, status, currency,
     total_cost, total_markup, total_price, notes, created_by)
  VALUES
    (v_src.site_id, v_src.contract_id, v_src.rate_card_version_id, v_src.recipe_id, v_src.name, v_next, 'DRAFT', v_src.currency,
     v_src.total_cost, v_src.total_markup, v_src.total_price, v_src.notes, v_uid)
  RETURNING * INTO v_new;

  INSERT INTO public.site_estimate_lines
    (site_estimate_id, recipe_item_id, rate_item_id, rate_code, description, unit, quantity,
     unit_cost, unit_price, markup_amount, markup_pct, line_cost, line_price,
     stage, cost_code, cost_code_category, is_allowance, is_manual_addition, sort_index)
  SELECT v_new.id, recipe_item_id, rate_item_id, rate_code, description, unit, quantity,
         unit_cost, unit_price, markup_amount, markup_pct, line_cost, line_price,
         stage, cost_code, cost_code_category, is_allowance, is_manual_addition, sort_index
    FROM public.site_estimate_lines WHERE site_estimate_id=v_src.id;

  IF v_src.status='APPROVED' THEN
    UPDATE public.site_estimates
       SET status='SUPERSEDED', superseded_by_estimate_id=v_new.id, updated_at=now()
     WHERE id=v_src.id;
  END IF;

  INSERT INTO public.audit_log (user_id, action, site_id, meta_json)
  VALUES (v_uid, 'site_estimate.clone_to_draft', v_new.site_id,
          jsonb_build_object('entity_type','site_estimate','entity_id',v_new.id,
                             'source_id',v_src.id,'version_number',v_next));
  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_wp_estimate(p_estimate_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS public.work_package_estimates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.work_package_estimates;
  v_unapproved INTEGER;
BEGIN
  IF v_uid IS NULL OR NOT public.is_gridwise_staff(v_uid) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT * INTO v_row FROM public.work_package_estimates WHERE id=p_estimate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WP estimate not found'; END IF;
  IF v_row.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Only DRAFT WP estimates can be approved (current: %)', v_row.status;
  END IF;

  SELECT COUNT(*) INTO v_unapproved
    FROM public.wp_estimate_sites wes
    JOIN public.site_estimates se ON se.id=wes.site_estimate_id
   WHERE wes.wp_estimate_id=p_estimate_id AND wes.included=true AND se.status<>'APPROVED';
  IF v_unapproved > 0 THEN
    RAISE EXCEPTION 'Cannot approve: % included site estimate(s) are not yet APPROVED', v_unapproved;
  END IF;

  PERFORM public.recalculate_wp_estimate_totals(p_estimate_id);

  UPDATE public.work_package_estimates
     SET status='APPROVED', approved_at=now(), approved_by=v_uid,
         notes=COALESCE(p_notes, notes), updated_at=now()
   WHERE id=p_estimate_id RETURNING * INTO v_row;

  INSERT INTO public.audit_log (user_id, action, site_id, meta_json)
  VALUES (v_uid, 'wp_estimate.approve', NULL,
          jsonb_build_object('entity_type','wp_estimate','entity_id',p_estimate_id,
                             'work_package_id',v_row.work_package_id,
                             'version_number',v_row.version_number,'total_price',v_row.total_price));
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.clone_wp_estimate_to_draft(p_estimate_id UUID)
RETURNS public.work_package_estimates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_src public.work_package_estimates;
  v_new public.work_package_estimates;
  v_next INTEGER;
BEGIN
  IF v_uid IS NULL OR NOT public.is_gridwise_staff(v_uid) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT * INTO v_src FROM public.work_package_estimates WHERE id=p_estimate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'WP estimate not found'; END IF;

  SELECT COALESCE(MAX(version_number),0)+1 INTO v_next
    FROM public.work_package_estimates WHERE work_package_id=v_src.work_package_id;

  INSERT INTO public.work_package_estimates
    (work_package_id, contract_id, rate_card_version_id, name, version_number, status, currency,
     sites_total_cost, sites_total_price, adjustments_total_cost, adjustments_total_price,
     total_cost, total_markup, total_price, notes, created_by)
  VALUES
    (v_src.work_package_id, v_src.contract_id, v_src.rate_card_version_id, v_src.name, v_next, 'DRAFT', v_src.currency,
     v_src.sites_total_cost, v_src.sites_total_price, v_src.adjustments_total_cost, v_src.adjustments_total_price,
     v_src.total_cost, v_src.total_markup, v_src.total_price, v_src.notes, v_uid)
  RETURNING * INTO v_new;

  INSERT INTO public.wp_estimate_sites
    (wp_estimate_id, site_estimate_id, site_id, included, contribution_cost, contribution_price, notes, sort_index)
  SELECT v_new.id, site_estimate_id, site_id, included, contribution_cost, contribution_price, notes, sort_index
    FROM public.wp_estimate_sites WHERE wp_estimate_id=v_src.id;

  INSERT INTO public.wp_estimate_adjustments
    (wp_estimate_id, kind, label, description, applies_to, is_percentage, percentage,
     amount_cost, amount_price, sort_index)
  SELECT v_new.id, kind, label, description, applies_to, is_percentage, percentage,
         amount_cost, amount_price, sort_index
    FROM public.wp_estimate_adjustments WHERE wp_estimate_id=v_src.id;

  IF v_src.status='APPROVED' THEN
    UPDATE public.work_package_estimates
       SET status='SUPERSEDED', superseded_by_estimate_id=v_new.id, updated_at=now()
     WHERE id=v_src.id;
  END IF;

  INSERT INTO public.audit_log (user_id, action, site_id, meta_json)
  VALUES (v_uid, 'wp_estimate.clone_to_draft', NULL,
          jsonb_build_object('entity_type','wp_estimate','entity_id',v_new.id,
                             'work_package_id',v_new.work_package_id,
                             'source_id',v_src.id,'version_number',v_next));
  RETURN v_new;
END;
$$;
