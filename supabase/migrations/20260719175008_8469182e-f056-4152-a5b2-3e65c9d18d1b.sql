
CREATE OR REPLACE FUNCTION public.delete_work_package(_wp_id uuid, _reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _archive_id uuid;
  _exists boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_capability(_uid, 'entity.archive') THEN
    RAISE EXCEPTION 'Not authorised to archive work packages';
  END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Archive reason is required';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.work_packages WHERE id = _wp_id) INTO _exists;
  IF NOT _exists THEN RAISE EXCEPTION 'Work package not found'; END IF;

  -- Snapshot to deleted_entities (90-day retention default)
  _archive_id := public.archive_entity('work_package', _wp_id, _reason);

  -- Hard delete; FKs cascade for wp_sites, wp_tasks, estimates, etc.
  -- studies.wp_id and projects.work_package_id ON DELETE SET NULL.
  DELETE FROM public.work_packages WHERE id = _wp_id;

  RETURN _archive_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_work_package(uuid, text) TO authenticated;
