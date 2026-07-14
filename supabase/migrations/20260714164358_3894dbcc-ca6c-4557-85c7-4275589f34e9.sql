
-- Approve a DRAFT estimate_recipe
CREATE OR REPLACE FUNCTION public.approve_estimate_recipe(_recipe_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r public.estimate_recipes%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve recipes';
  END IF;

  SELECT * INTO _r FROM public.estimate_recipes WHERE id = _recipe_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recipe not found'; END IF;
  IF _r.status <> 'DRAFT' THEN RAISE EXCEPTION 'Only DRAFT recipes can be approved'; END IF;

  -- Supersede any other APPROVED versions of the same recipe (same contract + name)
  UPDATE public.estimate_recipes
     SET status = 'SUPERSEDED', updated_at = now()
   WHERE status = 'APPROVED'
     AND name = _r.name
     AND coalesce(contract_id::text,'') = coalesce(_r.contract_id::text,'')
     AND id <> _r.id;

  UPDATE public.estimate_recipes
     SET status = 'APPROVED', approved_at = now(), approved_by = auth.uid(), updated_at = now()
   WHERE id = _recipe_id;

  INSERT INTO public.audit_log (user_id, action, site_id, metadata)
  VALUES (auth.uid(), 'recipe.approve', NULL,
          jsonb_build_object('recipe_id', _recipe_id, 'name', _r.name, 'version', _r.version_number));
END;
$$;

-- Clone any estimate_recipe into a new DRAFT version
CREATE OR REPLACE FUNCTION public.clone_estimate_recipe_to_draft(_recipe_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r public.estimate_recipes%ROWTYPE;
  _new_id uuid;
  _next_version int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can clone recipes';
  END IF;

  SELECT * INTO _r FROM public.estimate_recipes WHERE id = _recipe_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recipe not found'; END IF;

  SELECT coalesce(max(version_number),0) + 1 INTO _next_version
    FROM public.estimate_recipes
   WHERE name = _r.name
     AND coalesce(contract_id::text,'') = coalesce(_r.contract_id::text,'');

  INSERT INTO public.estimate_recipes (
    contract_id, name, build_type, socket_count, delivering_partner,
    version_number, status, source_workbook, imported_at, imported_by, notes
  ) VALUES (
    _r.contract_id, _r.name, _r.build_type, _r.socket_count, _r.delivering_partner,
    _next_version, 'DRAFT', _r.source_workbook, now(), auth.uid(),
    coalesce(_r.notes,'') || case when _r.notes is not null then E'\n' else '' end
      || 'Cloned from v' || _r.version_number || ' on ' || to_char(now(),'YYYY-MM-DD')
  )
  RETURNING id INTO _new_id;

  INSERT INTO public.recipe_items (
    recipe_id, rate_item_id, description_override, unit, default_quantity,
    quantity_rule_json, quantity_rule_confirmed, markup_amount, markup_pct,
    stage, cost_code, cost_code_category, is_allowance, related_allowance_ref,
    create_project_task, task_stage_tag, sort_index, notes
  )
  SELECT
    _new_id, rate_item_id, description_override, unit, default_quantity,
    quantity_rule_json, quantity_rule_confirmed, markup_amount, markup_pct,
    stage, cost_code, cost_code_category, is_allowance, related_allowance_ref,
    create_project_task, task_stage_tag, sort_index, notes
    FROM public.recipe_items WHERE recipe_id = _recipe_id;

  INSERT INTO public.audit_log (user_id, action, site_id, metadata)
  VALUES (auth.uid(), 'recipe.clone', NULL,
          jsonb_build_object('source_recipe_id', _recipe_id, 'new_recipe_id', _new_id,
                             'name', _r.name, 'new_version', _next_version));

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_estimate_recipe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clone_estimate_recipe_to_draft(uuid) TO authenticated;
