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
  SELECT COALESCE(source_estimate_id, id) INTO _root_id
    FROM public.estimates WHERE id = _estimate_id;

  SELECT COALESCE(MAX(revision), 0) + 1 INTO _next_rev
    FROM public.estimates
   WHERE id = _root_id OR source_estimate_id = _root_id;

  UPDATE public.estimates
     SET is_current = false
   WHERE id = _root_id OR source_estimate_id = _root_id;

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

  INSERT INTO public.estimate_lines (
    estimate_id, group_id, recipe_id, parent_line_id, sort_index,
    boq_item_name, boq_description, pricing_notes, item_logic,
    qty, uom, time_value, time_measure, no_resources,
    supplier, product_service, product_type,
    unit_cost, unit_price,
    markup_type, markup_dollar, markup_pct, contingency_pct, net_markup_pct,
    total_cost, total_markup, total_price, discount, sub_total,
    vat_rate, vat_amount, grand_total,
    cost_category, cost_code, charge_out_rate_used, conversion_type,
    show_image_in_proposal, solution_link, image_link,
    itemised, flexible_qty, fixed_price, lock_markup_dollar,
    split_labour_materials, calculate_time, rfq_required,
    is_allowance, compare_list, compare_title,
    project_sync_type, project_task_name, project_description, task_owner,
    milestone_for_sync, project_stage, include_in_create_task, stage,
    attribute_group, locked,
    rate_item_id, rate_card_version_id, rate_code, partner_visible,
    is_prelim
  )
  SELECT
    _new_id, group_id, recipe_id, parent_line_id, sort_index,
    boq_item_name, boq_description, pricing_notes, item_logic,
    qty, uom, time_value, time_measure, no_resources,
    supplier, product_service, product_type,
    unit_cost, unit_price,
    markup_type, markup_dollar, markup_pct, contingency_pct, net_markup_pct,
    total_cost, total_markup, total_price, discount, sub_total,
    vat_rate, vat_amount, grand_total,
    cost_category, cost_code, charge_out_rate_used, conversion_type,
    show_image_in_proposal, solution_link, image_link,
    itemised, flexible_qty, fixed_price, lock_markup_dollar,
    split_labour_materials, calculate_time, rfq_required,
    is_allowance, compare_list, compare_title,
    project_sync_type, project_task_name, project_description, task_owner,
    milestone_for_sync, project_stage, include_in_create_task, stage,
    attribute_group, locked,
    rate_item_id, rate_card_version_id, rate_code, partner_visible,
    is_prelim
  FROM public.estimate_lines
  WHERE estimate_id = _estimate_id;

  RETURN _new_id;
END;
$$;