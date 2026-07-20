
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_estimates_deleted_at ON public.estimates (deleted_at);

CREATE OR REPLACE FUNCTION public.scan_entity_dependencies(_entity_type text, _entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cnt bigint; _out jsonb := '{}'::jsonb;
BEGIN
  IF _entity_type = 'site' THEN
    SELECT COUNT(*) INTO _cnt FROM public.wp_tasks WHERE site_id = _entity_id;
    _out := _out || jsonb_build_object('wp_tasks', _cnt);
    SELECT COUNT(*) INTO _cnt FROM public.site_photos WHERE site_id = _entity_id;
    _out := _out || jsonb_build_object('site_photos', _cnt);
    SELECT COUNT(*) INTO _cnt FROM public.design_submissions WHERE site_id = _entity_id;
    _out := _out || jsonb_build_object('design_submissions', _cnt);
    SELECT COUNT(*) INTO _cnt FROM public.dno_offer_sites WHERE site_id = _entity_id;
    _out := _out || jsonb_build_object('dno_offer_sites', _cnt);
    SELECT COUNT(*) INTO _cnt FROM public.permits WHERE site_id = _entity_id;
    _out := _out || jsonb_build_object('permits', _cnt);
    SELECT COUNT(*) INTO _cnt FROM public.wp_sites WHERE site_id = _entity_id;
    _out := _out || jsonb_build_object('wp_sites', _cnt);
  ELSIF _entity_type = 'work_package' THEN
    SELECT COUNT(*) INTO _cnt FROM public.wp_sites WHERE work_package_id = _entity_id;
    _out := _out || jsonb_build_object('wp_sites', _cnt);
    SELECT COUNT(*) INTO _cnt FROM public.wp_tasks WHERE work_package_id = _entity_id;
    _out := _out || jsonb_build_object('wp_tasks', _cnt);
  ELSIF _entity_type = 'programme' THEN
    SELECT COUNT(*) INTO _cnt FROM public.work_packages WHERE programme_id = _entity_id;
    _out := _out || jsonb_build_object('work_packages', _cnt);
  ELSIF _entity_type = 'estimate' THEN
    SELECT COUNT(*) INTO _cnt FROM public.estimate_groups WHERE estimate_id = _entity_id;
    _out := _out || jsonb_build_object('estimate_groups', _cnt);
    SELECT COUNT(*) INTO _cnt FROM public.estimate_lines WHERE estimate_id = _entity_id;
    _out := _out || jsonb_build_object('estimate_lines', _cnt);
  END IF;
  RETURN _out;
END; $$;

CREATE OR REPLACE FUNCTION public.archive_entity(_entity_type text, _entity_id uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _snapshot jsonb; _archive_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_capability(_uid, 'entity.archive') THEN
    RAISE EXCEPTION 'Not authorised to archive entities';
  END IF;
  IF _reason IS NULL OR btrim(_reason)='' THEN
    RAISE EXCEPTION 'Archive reason is required';
  END IF;

  IF _entity_type = 'site' THEN
    SELECT to_jsonb(s.*) INTO _snapshot FROM public.sites s WHERE s.id = _entity_id;
  ELSIF _entity_type = 'work_package' THEN
    SELECT to_jsonb(wp.*) INTO _snapshot FROM public.work_packages wp WHERE wp.id = _entity_id;
  ELSIF _entity_type = 'programme' THEN
    SELECT to_jsonb(p.*) INTO _snapshot FROM public.programmes p WHERE p.id = _entity_id;
  ELSIF _entity_type = 'estimate' THEN
    SELECT jsonb_build_object(
      'estimate',    to_jsonb(e.*),
      'groups',      COALESCE((SELECT jsonb_agg(to_jsonb(g.*)) FROM public.estimate_groups g WHERE g.estimate_id = _entity_id), '[]'::jsonb),
      'lines',       COALESCE((SELECT jsonb_agg(to_jsonb(l.*)) FROM public.estimate_lines  l WHERE l.estimate_id = _entity_id), '[]'::jsonb)
    ) INTO _snapshot
    FROM public.estimates e WHERE e.id = _entity_id;
  ELSE
    RAISE EXCEPTION 'Unsupported entity type %', _entity_type;
  END IF;

  IF _snapshot IS NULL THEN RAISE EXCEPTION 'Entity not found'; END IF;

  _snapshot := jsonb_build_object(
    'root', _snapshot,
    'dependencies', public.scan_entity_dependencies(_entity_type, _entity_id));

  INSERT INTO public.deleted_entities
    (entity_type, entity_id, snapshot, reason, archived_by)
  VALUES (_entity_type, _entity_id, _snapshot, _reason, _uid)
  RETURNING id INTO _archive_id;

  -- Soft-hide the estimate so it disappears from lists but stays recoverable
  IF _entity_type = 'estimate' THEN
    UPDATE public.estimates SET deleted_at = now() WHERE id = _entity_id;
  END IF;

  INSERT INTO public.audit_log (user_id, action, site_id, meta_json)
  VALUES (_uid, 'entity.archived',
    CASE WHEN _entity_type='site' THEN _entity_id ELSE NULL END,
    jsonb_build_object('entity_type',_entity_type,'entity_id',_entity_id,
                       'archive_id',_archive_id,'reason',_reason));
  RETURN _archive_id;
END; $$;

CREATE OR REPLACE FUNCTION public.restore_entity(_archive_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row public.deleted_entities%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_capability(_uid, 'entity.restore') THEN
    RAISE EXCEPTION 'Not authorised to restore entities';
  END IF;
  SELECT * INTO _row FROM public.deleted_entities WHERE id = _archive_id FOR UPDATE;
  IF NOT FOUND OR _row.status <> 'archived' THEN
    RAISE EXCEPTION 'Archive record unavailable';
  END IF;

  IF _row.entity_type = 'estimate' THEN
    UPDATE public.estimates SET deleted_at = NULL WHERE id = _row.entity_id;
  END IF;

  UPDATE public.deleted_entities
  SET status='restored', restored_by=_uid, restored_at=now()
  WHERE id = _archive_id;

  INSERT INTO public.audit_log (user_id, action, site_id, meta_json)
  VALUES (_uid, 'entity.restored',
    CASE WHEN _row.entity_type='site' THEN _row.entity_id ELSE NULL END,
    jsonb_build_object('entity_type',_row.entity_type,'entity_id',_row.entity_id,
                       'archive_id',_archive_id));
  RETURN _row.entity_id;
END; $$;

CREATE OR REPLACE FUNCTION public.purge_entity(_archive_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row public.deleted_entities%ROWTYPE;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_capability(_uid, 'entity.delete_forever') THEN
    RAISE EXCEPTION 'Not authorised to permanently delete';
  END IF;
  SELECT * INTO _row FROM public.deleted_entities WHERE id = _archive_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Archive record not found'; END IF;

  IF _row.entity_type = 'estimate' THEN
    DELETE FROM public.estimates WHERE id = _row.entity_id;
  END IF;

  UPDATE public.deleted_entities SET status='purged', purged_at=now()
  WHERE id = _archive_id;
  INSERT INTO public.audit_log (user_id, action, site_id, meta_json)
  VALUES (_uid, 'entity.purged',
    CASE WHEN _row.entity_type='site' THEN _row.entity_id ELSE NULL END,
    jsonb_build_object('entity_type',_row.entity_type,'entity_id',_row.entity_id,
                       'archive_id',_archive_id));
  RETURN true;
END; $$;
