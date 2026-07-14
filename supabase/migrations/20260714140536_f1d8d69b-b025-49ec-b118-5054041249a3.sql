
CREATE OR REPLACE FUNCTION public.apply_programme_template(_project_id UUID, _template_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tpl RECORD;
  _proj RECORD;
  _uid UUID := auth.uid();
  _ms JSONB;
  _task JSONB;
  _new_ms_id UUID;
  _seq INT := 0;
  _cursor DATE;
  _dur INT;
  _ms_end DATE;
  _tasks_created INT := 0;
  _ms_created INT := 0;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_access_project(_project_id, _uid) THEN
    RAISE EXCEPTION 'Access denied to project';
  END IF;

  SELECT * INTO _tpl FROM public.programme_templates WHERE key = _template_key AND is_published;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template not found: %', _template_key; END IF;

  SELECT * INTO _proj FROM public.projects WHERE id = _project_id;
  _cursor := COALESCE(_proj.start_date, CURRENT_DATE);

  FOR _ms IN SELECT * FROM jsonb_array_elements(COALESCE(_tpl.template_json->'milestones','[]'::jsonb))
  LOOP
    _ms_end := _cursor;
    INSERT INTO public.project_milestones (project_id, name, phase, sequence, planned_date, status)
    VALUES (
      _project_id,
      _ms->>'name',
      COALESCE((_ms->>'phase')::public.milestone_phase, 'delivery'),
      _seq,
      _cursor,
      'not_started'
    )
    RETURNING id INTO _new_ms_id;
    _ms_created := _ms_created + 1;

    FOR _task IN SELECT * FROM jsonb_array_elements(COALESCE(_ms->'tasks','[]'::jsonb))
    LOOP
      _dur := COALESCE((_task->>'duration_days')::INT, 1);
      INSERT INTO public.project_tasks
        (project_id, milestone_id, title, status, priority, start_date, due_date, estimated_hours, sort_index, created_by,
         metadata_json)
      VALUES
        (_project_id, _new_ms_id, _task->>'title', 'todo', 'medium',
         _cursor, _cursor + (_dur || ' days')::interval,
         NULLIF(_task->>'estimated_hours','')::numeric,
         _tasks_created, _uid,
         jsonb_build_object('role', _task->>'role', 'template_key', _tpl.key));
      _cursor := _cursor + (_dur || ' days')::interval;
      _ms_end := _cursor;
      _tasks_created := _tasks_created + 1;
    END LOOP;

    UPDATE public.project_milestones SET planned_date = _ms_end WHERE id = _new_ms_id;
    _seq := _seq + 1;
  END LOOP;

  UPDATE public.projects
     SET template_id = _tpl.id,
         target_end_date = COALESCE(_proj.target_end_date, _cursor)
   WHERE id = _project_id;

  INSERT INTO public.project_activity (project_id, actor_user_id, entity_type, entity_id, action, summary, diff_json)
  VALUES (_project_id, _uid, 'projects', _project_id, 'template_applied',
          'Programme template applied: ' || _tpl.name,
          jsonb_build_object('template_key', _tpl.key, 'milestones', _ms_created, 'tasks', _tasks_created));

  RETURN jsonb_build_object('milestones', _ms_created, 'tasks', _tasks_created, 'template', _tpl.name);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_programme_template(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_programme_template(UUID, TEXT) TO authenticated;
