
CREATE OR REPLACE FUNCTION public.approve_estimate_recipe(_recipe_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r public.estimate_recipes%ROWTYPE;
  _total int;
  _unlinked int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can approve recipes';
  END IF;

  SELECT * INTO _r FROM public.estimate_recipes WHERE id = _recipe_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recipe not found'; END IF;
  IF _r.status <> 'DRAFT' THEN RAISE EXCEPTION 'Only DRAFT recipes can be approved'; END IF;

  SELECT count(*), count(*) FILTER (WHERE rate_item_id IS NULL)
    INTO _total, _unlinked
    FROM public.recipe_items WHERE recipe_id = _recipe_id;

  IF _total = 0 THEN
    RAISE EXCEPTION 'Recipe has no lines';
  END IF;
  IF _unlinked > 0 THEN
    RAISE EXCEPTION 'Recipe has % line(s) not linked to a rate item', _unlinked;
  END IF;

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
          jsonb_build_object('recipe_id', _recipe_id, 'name', _r.name, 'version', _r.version_number, 'lines', _total));
END;
$$;
