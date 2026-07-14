
-- ============ M8: Templates v2 + acceptance RPCs ============

-- Seed WP-level templates (idempotent upsert on key)
INSERT INTO public.programme_templates (key, name, description, wp_type_key, is_published, template_json) VALUES
('ev_hub_wp_v1', 'EV Hub — Work Package v1',
 'Standard EV Hub delivery WP: mobilisation, design batch, procurement, construction, commissioning, handover.',
 'ev_hub',
 true,
 jsonb_build_object(
   'wp_milestones', jsonb_build_array(
     jsonb_build_object('name','Mobilisation complete','phase','mobilisation','tasks',jsonb_build_array(
       jsonb_build_object('title','Kick-off meeting','role','pm','duration_days',1),
       jsonb_build_object('title','Set up WP workspace and permissions','role','pm','duration_days',1),
       jsonb_build_object('title','Confirm site list and access','role','delivery','duration_days',2)
     )),
     jsonb_build_object('name','Design batch approved','phase','design_batch','tasks',jsonb_build_array(
       jsonb_build_object('title','Consolidate site designs','role','engineer','duration_days',3),
       jsonb_build_object('title','Client design review','role','pm','duration_days',2)
     )),
     jsonb_build_object('name','Procurement placed','phase','procurement','tasks',jsonb_build_array(
       jsonb_build_object('title','Aggregate BOQ across sites','role','commercial','duration_days',2),
       jsonb_build_object('title','Raise POs for long-lead items','role','commercial','duration_days',2)
     )),
     jsonb_build_object('name','Construction complete','phase','construction','tasks',jsonb_build_array(
       jsonb_build_object('title','Track site completions','role','delivery','duration_days',30)
     )),
     jsonb_build_object('name','Commissioned and handed over','phase','handover','tasks',jsonb_build_array(
       jsonb_build_object('title','Compile as-builts and test certs','role','delivery','duration_days',5),
       jsonb_build_object('title','Issue completion pack to client','role','pm','duration_days',2)
     ))
   ),
   'wp_tasks', '[]'::jsonb,
   'site_milestones', jsonb_build_array(
     jsonb_build_object('name','Survey & design','phase','delivery','tasks',jsonb_build_array(
       jsonb_build_object('title','Site survey','role','engineer','stage','survey','duration_days',2),
       jsonb_build_object('title','Detailed design','role','engineer','stage','design','duration_days',3),
       jsonb_build_object('title','DNO application','role','engineer','stage','dno','duration_days',5)
     )),
     jsonb_build_object('name','Permits','phase','delivery','tasks',jsonb_build_array(
       jsonb_build_object('title','Streetworks / TTRO permit','role','delivery','stage','permit','duration_days',10)
     )),
     jsonb_build_object('name','Civils & electrical','phase','delivery','tasks',jsonb_build_array(
       jsonb_build_object('title','Civils works','role','delivery','stage','civils','duration_days',5),
       jsonb_build_object('title','Cable pull and terminations','role','delivery','stage','electrical','duration_days',3),
       jsonb_build_object('title','Meter fit','role','delivery','stage','meter','duration_days',1)
     )),
     jsonb_build_object('name','Commissioning & handover','phase','commissioning','tasks',jsonb_build_array(
       jsonb_build_object('title','Energisation','role','engineer','stage','electrical','duration_days',1),
       jsonb_build_object('title','Commissioning tests','role','engineer','stage','handover','duration_days',1),
       jsonb_build_object('title','Handover pack uploaded','role','pm','stage','handover','duration_days',1)
     ))
   )
 )),
('connected_kerb_wp_v1', 'Connected Kerb style — Work Package v1',
 'On-street LA programme: batches of 10–20 sites with permit-heavy site programmes.',
 'ev_hub',
 true,
 jsonb_build_object(
   'wp_milestones', jsonb_build_array(
     jsonb_build_object('name','LA agreement signed','phase','mobilisation','tasks',jsonb_build_array(
       jsonb_build_object('title','Confirm framework and rates','role','commercial','duration_days',3)
     )),
     jsonb_build_object('name','Batch permits submitted','phase','design_batch','tasks',jsonb_build_array(
       jsonb_build_object('title','Bulk streetworks permit submission','role','delivery','duration_days',10)
     )),
     jsonb_build_object('name','Batch energised','phase','construction','tasks',jsonb_build_array(
       jsonb_build_object('title','Weekly site status review','role','pm','duration_days',60)
     )),
     jsonb_build_object('name','Batch commissioned','phase','handover','tasks',jsonb_build_array(
       jsonb_build_object('title','LA sign-off pack','role','pm','duration_days',5)
     ))
   ),
   'wp_tasks', '[]'::jsonb,
   'site_milestones', jsonb_build_array(
     jsonb_build_object('name','Survey & consent','phase','delivery','tasks',jsonb_build_array(
       jsonb_build_object('title','Site survey and photos','role','engineer','stage','survey','duration_days',1),
       jsonb_build_object('title','LA consent confirmed','role','pm','stage','permit','duration_days',5)
     )),
     jsonb_build_object('name','Install','phase','delivery','tasks',jsonb_build_array(
       jsonb_build_object('title','Civils','role','delivery','stage','civils','duration_days',2),
       jsonb_build_object('title','Chargepoint install','role','delivery','stage','electrical','duration_days',1),
       jsonb_build_object('title','Meter and back-office','role','delivery','stage','meter','duration_days',1)
     )),
     jsonb_build_object('name','Handover','phase','handover','tasks',jsonb_build_array(
       jsonb_build_object('title','As-built and test cert','role','engineer','stage','handover','duration_days',1)
     ))
   )
 ))
ON CONFLICT (key) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      wp_type_key = EXCLUDED.wp_type_key,
      is_published = EXCLUDED.is_published,
      template_json = EXCLUDED.template_json,
      updated_at = now();

-- ============ preview_accept_proposal ============
CREATE OR REPLACE FUNCTION public.preview_accept_proposal(
  _proposal_id uuid,
  _wp_id uuid DEFAULT NULL,
  _template_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _proposal record;
  _study record;
  _site_id uuid;
  _site_name text;
  _site_address text;
  _wp record;
  _tpl record;
  _wp_ms int := 0;
  _wp_tk int := 0;
  _st_ms int := 0;
  _st_tk int := 0;
  _existing int := 0;
  _already_in_wp boolean := false;
  _estimate_total numeric;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _proposal FROM public.proposals WHERE id = _proposal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;

  SELECT * INTO _study FROM public.studies WHERE id = _proposal.study_id;

  IF _study.site_id IS NOT NULL THEN
    SELECT id, name, address INTO _site_id, _site_name, _site_address
      FROM public.sites WHERE id = _study.site_id;
  END IF;

  IF _wp_id IS NOT NULL THEN
    SELECT * INTO _wp FROM public.work_packages WHERE id = _wp_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Work package not found'; END IF;
    SELECT count(*) INTO _existing FROM public.wp_sites WHERE work_package_id = _wp_id;
    IF _site_id IS NOT NULL THEN
      SELECT EXISTS(SELECT 1 FROM public.wp_sites WHERE work_package_id = _wp_id AND site_id = _site_id)
        INTO _already_in_wp;
    END IF;
  END IF;

  IF _template_key IS NOT NULL THEN
    SELECT * INTO _tpl FROM public.programme_templates WHERE key = _template_key AND is_published;
    IF FOUND THEN
      _wp_ms := jsonb_array_length(COALESCE(_tpl.template_json->'wp_milestones','[]'::jsonb));
      SELECT COALESCE(sum(jsonb_array_length(COALESCE(ms->'tasks','[]'::jsonb))),0) INTO _wp_tk
        FROM jsonb_array_elements(COALESCE(_tpl.template_json->'wp_milestones','[]'::jsonb)) AS ms;
      _st_ms := jsonb_array_length(COALESCE(_tpl.template_json->'site_milestones','[]'::jsonb));
      SELECT COALESCE(sum(jsonb_array_length(COALESCE(ms->'tasks','[]'::jsonb))),0) INTO _st_tk
        FROM jsonb_array_elements(COALESCE(_tpl.template_json->'site_milestones','[]'::jsonb)) AS ms;
    END IF;
  END IF;

  _estimate_total := COALESCE(
    NULLIF(_study.cost_estimate_json->>'total_cost','')::numeric,
    NULLIF(_study.cost_estimate_json->>'total','')::numeric,
    _proposal.total_amount
  );

  RETURN jsonb_build_object(
    'proposal', jsonb_build_object(
      'id', _proposal.id, 'title', _proposal.title,
      'total_amount', _proposal.total_amount, 'status', _proposal.status,
      'currency', _proposal.currency
    ),
    'study', CASE WHEN _study.id IS NOT NULL THEN
      jsonb_build_object('id', _study.id, 'name', _study.study_name, 'version', _study.version)
      ELSE NULL END,
    'site', CASE WHEN _site_id IS NOT NULL THEN
      jsonb_build_object('id', _site_id, 'name', _site_name, 'address', _site_address)
      ELSE NULL END,
    'work_package', CASE WHEN _wp.id IS NOT NULL THEN
      jsonb_build_object('id', _wp.id, 'name', _wp.name, 'code', _wp.code,
                         'existing_site_count', _existing,
                         'already_contains_site', _already_in_wp,
                         'is_new', false)
      ELSE jsonb_build_object('is_new', true) END,
    'template', CASE WHEN _tpl.id IS NOT NULL THEN jsonb_build_object(
      'key', _tpl.key, 'name', _tpl.name,
      'wp_milestones_to_create', CASE WHEN _wp.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.wp_milestones WHERE work_package_id = _wp.id) THEN _wp_ms ELSE 0 END,
      'wp_tasks_to_create', CASE WHEN _wp.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.wp_milestones WHERE work_package_id = _wp.id) THEN _wp_tk ELSE 0 END,
      'site_milestones_to_create', _st_ms,
      'site_tasks_to_create', _st_tk
    ) ELSE NULL END,
    'estimate_snapshot_total', _estimate_total
  );
END; $$;

REVOKE ALL ON FUNCTION public.preview_accept_proposal(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_accept_proposal(uuid, uuid, text) TO authenticated;

-- ============ accept_proposal_into_wp ============
CREATE OR REPLACE FUNCTION public.accept_proposal_into_wp(
  _proposal_id uuid,
  _wp_id uuid DEFAULT NULL,
  _programme_id uuid DEFAULT NULL,
  _new_wp_name text DEFAULT NULL,
  _new_wp_code text DEFAULT NULL,
  _template_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _proposal record;
  _study record;
  _wp_id_final uuid := _wp_id;
  _wp record;
  _tpl record;
  _ms jsonb; _task jsonb;
  _new_ms_id uuid;
  _seq int;
  _cursor date;
  _dur int;
  _wp_ms_created int := 0;
  _wp_tk_created int := 0;
  _site_ms_created int := 0;
  _site_tk_created int := 0;
  _site_project_id uuid;
  _existing_project uuid;
  _snapshot jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO _proposal FROM public.proposals WHERE id = _proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;
  IF _proposal.status = 'accepted' THEN RAISE EXCEPTION 'Proposal is already accepted'; END IF;

  SELECT * INTO _study FROM public.studies WHERE id = _proposal.study_id;
  IF _study.site_id IS NULL THEN
    RAISE EXCEPTION 'Study has no site — cannot attach to a work package';
  END IF;

  -- Create WP if none provided
  IF _wp_id_final IS NULL THEN
    IF _programme_id IS NULL THEN
      RAISE EXCEPTION 'Either wp_id or programme_id must be provided';
    END IF;
    INSERT INTO public.work_packages
      (programme_id, name, code, status, pm_user_id, created_by, start_date)
    VALUES
      (_programme_id,
       COALESCE(NULLIF(_new_wp_name,''), 'Work package ' || to_char(now(),'YYYY-MM-DD')),
       COALESCE(NULLIF(_new_wp_code,''), 'WP-' || substring(gen_random_uuid()::text, 1, 6)),
       'planning', _uid, _uid, CURRENT_DATE)
    RETURNING id INTO _wp_id_final;
  END IF;

  SELECT * INTO _wp FROM public.work_packages WHERE id = _wp_id_final;

  -- Attach site (idempotent)
  INSERT INTO public.wp_sites (work_package_id, site_id)
  VALUES (_wp_id_final, _study.site_id)
  ON CONFLICT (work_package_id, site_id) DO NOTHING;

  -- Snapshot estimate + BOQ onto proposal
  _snapshot := jsonb_build_object(
    'accepted_at', now(),
    'accepted_by', _uid,
    'work_package_id', _wp_id_final,
    'study_id', _study.id,
    'study_version', _study.version,
    'cost_estimate', _study.cost_estimate_json,
    'bom', _study.bom_json
  );

  UPDATE public.proposals
     SET status = 'accepted',
         accepted_at = now(),
         accepted_by = _uid,
         snapshot_json = COALESCE(_proposal.snapshot_json,'{}'::jsonb) || _snapshot
   WHERE id = _proposal_id;

  -- Create or reuse site programme (projects row: one per (wp, site))
  SELECT id INTO _existing_project
    FROM public.projects
   WHERE work_package_id = _wp_id_final AND site_id = _study.site_id
   LIMIT 1;

  IF _existing_project IS NULL THEN
    INSERT INTO public.projects
      (proposal_id, work_package_id, account_id, site_id, study_id, org_id,
       name, status, start_date, created_by)
    VALUES
      (_proposal_id, _wp_id_final, _proposal.account_id, _study.site_id, _study.id, _proposal.org_id,
       COALESCE(NULLIF(_proposal.title,''), 'Site delivery'),
       'planning', CURRENT_DATE, _uid)
    RETURNING id INTO _site_project_id;
  ELSE
    _site_project_id := _existing_project;
    UPDATE public.projects
       SET proposal_id = _proposal_id,
           study_id = _study.id
     WHERE id = _existing_project;
  END IF;

  -- Apply template
  IF _template_key IS NOT NULL THEN
    SELECT * INTO _tpl FROM public.programme_templates WHERE key = _template_key AND is_published;
    IF FOUND THEN
      -- WP-level items only if none yet
      IF NOT EXISTS (SELECT 1 FROM public.wp_milestones WHERE work_package_id = _wp_id_final) THEN
        _cursor := COALESCE(_wp.start_date, CURRENT_DATE);
        _seq := 0;
        FOR _ms IN SELECT * FROM jsonb_array_elements(COALESCE(_tpl.template_json->'wp_milestones','[]'::jsonb))
        LOOP
          INSERT INTO public.wp_milestones
            (work_package_id, name, phase, sequence, planned_date, status, created_by)
          VALUES
            (_wp_id_final, _ms->>'name',
             COALESCE((_ms->>'phase')::public.wp_milestone_phase, 'mobilisation'),
             _seq, _cursor, 'not_started', _uid)
          RETURNING id INTO _new_ms_id;
          _wp_ms_created := _wp_ms_created + 1;

          FOR _task IN SELECT * FROM jsonb_array_elements(COALESCE(_ms->'tasks','[]'::jsonb))
          LOOP
            _dur := COALESCE((_task->>'duration_days')::int, 1);
            INSERT INTO public.wp_tasks
              (work_package_id, milestone_id, title, status, priority,
               start_date, due_date, sort_index, created_by, metadata_json)
            VALUES
              (_wp_id_final, _new_ms_id, _task->>'title', 'not_started', 'medium',
               _cursor, _cursor + (_dur||' days')::interval, _wp_tk_created, _uid,
               jsonb_build_object('role', _task->>'role', 'template_key', _tpl.key));
            _cursor := _cursor + (_dur||' days')::interval;
            _wp_tk_created := _wp_tk_created + 1;
          END LOOP;

          UPDATE public.wp_milestones SET planned_date = _cursor WHERE id = _new_ms_id;
          _seq := _seq + 1;
        END LOOP;
      END IF;

      -- Site-level items (always applied to a freshly created site programme)
      IF NOT EXISTS (SELECT 1 FROM public.project_milestones WHERE project_id = _site_project_id) THEN
        _cursor := CURRENT_DATE;
        _seq := 0;
        FOR _ms IN SELECT * FROM jsonb_array_elements(COALESCE(_tpl.template_json->'site_milestones','[]'::jsonb))
        LOOP
          INSERT INTO public.project_milestones
            (project_id, name, phase, sequence, planned_date, status)
          VALUES
            (_site_project_id, _ms->>'name',
             COALESCE((_ms->>'phase')::public.milestone_phase, 'delivery'),
             _seq, _cursor, 'not_started')
          RETURNING id INTO _new_ms_id;
          _site_ms_created := _site_ms_created + 1;

          FOR _task IN SELECT * FROM jsonb_array_elements(COALESCE(_ms->'tasks','[]'::jsonb))
          LOOP
            _dur := COALESCE((_task->>'duration_days')::int, 1);
            INSERT INTO public.project_tasks
              (project_id, milestone_id, title, status, priority,
               start_date, due_date, sort_index, created_by, metadata_json)
            VALUES
              (_site_project_id, _new_ms_id, _task->>'title', 'todo', 'medium',
               _cursor, _cursor + (_dur||' days')::interval, _site_tk_created, _uid,
               jsonb_build_object('role', _task->>'role', 'stage', _task->>'stage', 'template_key', _tpl.key));
            _cursor := _cursor + (_dur||' days')::interval;
            _site_tk_created := _site_tk_created + 1;
          END LOOP;

          UPDATE public.project_milestones SET planned_date = _cursor WHERE id = _new_ms_id;
          _seq := _seq + 1;
        END LOOP;
      END IF;

      -- Update WP template pointer + target end
      UPDATE public.work_packages
         SET target_end_date = COALESCE(target_end_date, _cursor)
       WHERE id = _wp_id_final;
    END IF;
  END IF;

  -- Activity trail (project_activity is per-site)
  BEGIN
    INSERT INTO public.project_activity
      (project_id, actor_user_id, entity_type, entity_id, action, summary, diff_json)
    VALUES
      (_site_project_id, _uid, 'proposals', _proposal_id, 'accepted',
       'Proposal accepted into work package ' || COALESCE(_wp.name, _wp_id_final::text),
       jsonb_build_object(
         'work_package_id', _wp_id_final,
         'template_key', _template_key,
         'wp_milestones_created', _wp_ms_created,
         'wp_tasks_created', _wp_tk_created,
         'site_milestones_created', _site_ms_created,
         'site_tasks_created', _site_tk_created,
         'estimate_snapshot', _snapshot->'cost_estimate'
       ));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'work_package_id', _wp_id_final,
    'site_project_id', _site_project_id,
    'wp_milestones_created', _wp_ms_created,
    'wp_tasks_created', _wp_tk_created,
    'site_milestones_created', _site_ms_created,
    'site_tasks_created', _site_tk_created
  );
END; $$;

REVOKE ALL ON FUNCTION public.accept_proposal_into_wp(uuid, uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_proposal_into_wp(uuid, uuid, uuid, text, text, text) TO authenticated;
