
ALTER TABLE public.site_precon_gates
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE OR REPLACE FUNCTION public.remove_sites_from_wp(_wp_id uuid, _site_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean;
  _has_access boolean;
  _attached uuid[];
  _blocked uuid[];
  _sid uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  _is_admin := public.has_role(_uid, 'admin'::app_role);
  SELECT EXISTS(
    SELECT 1 FROM public.wp_access
    WHERE work_package_id = _wp_id AND user_id = _uid
  ) INTO _has_access;

  IF NOT (_is_admin OR _has_access) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(array_agg(site_id), '{}')
  INTO _attached
  FROM public.wp_sites
  WHERE work_package_id = _wp_id
    AND site_id = ANY(_site_ids);

  SELECT COALESCE(array_agg(sid), '{}')
  INTO _blocked
  FROM unnest(_site_ids) sid
  WHERE sid <> ALL(_attached);

  IF array_length(_attached, 1) IS NULL THEN
    RETURN jsonb_build_object('removed', 0, 'blocked', to_jsonb(_blocked));
  END IF;

  -- Archive WP-scoped tasks (keep rows for audit)
  UPDATE public.wp_tasks
     SET status = 'cancelled'::wp_item_status,
         metadata_json = COALESCE(metadata_json, '{}'::jsonb)
           || jsonb_build_object(
                'archived_at', now(),
                'archived_reason', 'site_removed_from_wp',
                'archived_by', _uid
              ),
         updated_at = now()
   WHERE work_package_id = _wp_id
     AND site_id = ANY(_attached)
     AND status <> 'done'::wp_item_status
     AND status <> 'cancelled'::wp_item_status;

  -- Archive Pre-Con gates
  UPDATE public.site_precon_gates
     SET archived_at = now(),
         updated_at = now()
   WHERE work_package_id = _wp_id
     AND site_id = ANY(_attached)
     AND archived_at IS NULL;

  -- Clear per-stage status for this WP (will re-seed on re-add)
  DELETE FROM public.site_stage_status
   WHERE work_package_id = _wp_id
     AND site_id = ANY(_attached);

  -- Remove the wp_sites links
  DELETE FROM public.wp_sites
   WHERE work_package_id = _wp_id
     AND site_id = ANY(_attached);

  -- Audit
  FOREACH _sid IN ARRAY _attached LOOP
    INSERT INTO public.audit_log(user_id, action, site_id, meta_json)
    VALUES (_uid, 'wp_site_removed', _sid,
            jsonb_build_object('work_package_id', _wp_id));
  END LOOP;

  RETURN jsonb_build_object(
    'removed', COALESCE(array_length(_attached, 1), 0),
    'blocked', to_jsonb(_blocked)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.remove_sites_from_wp(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_sites_from_wp(uuid, uuid[]) TO authenticated;
