
-- 1. CAPABILITY-BASED RBAC
CREATE TABLE public.capability_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  capability text NOT NULL,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, capability)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.capability_grants TO authenticated;
GRANT ALL ON public.capability_grants TO service_role;
ALTER TABLE public.capability_grants ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_capability(_user_id uuid, _capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.capability_grants
                 WHERE user_id = _user_id AND capability = _capability);
$$;

CREATE POLICY "Users see own grants" ON public.capability_grants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage grants" ON public.capability_grants
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.capability_grants (user_id, capability)
SELECT ur.user_id, cap FROM public.user_roles ur
CROSS JOIN (VALUES ('site.move'),('site.bulk_move'),('entity.archive'),
                   ('entity.restore'),('entity.delete_forever')) AS c(cap)
WHERE ur.role = 'admin'::app_role
ON CONFLICT DO NOTHING;

INSERT INTO public.capability_grants (user_id, capability)
SELECT ur.user_id, 'site.move' FROM public.user_roles ur
WHERE ur.role = 'engineer'::app_role
ON CONFLICT DO NOTHING;

-- 2. DELETED ENTITIES
CREATE TABLE public.deleted_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  parent_type text,
  parent_id uuid,
  snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'archived',
  reason text,
  onedrive_archive_path text,
  archived_by uuid,
  archived_at timestamptz NOT NULL DEFAULT now(),
  retention_expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  restored_by uuid,
  restored_at timestamptz,
  purged_at timestamptz
);
CREATE INDEX idx_deleted_entities_type_status ON public.deleted_entities (entity_type, status);
CREATE INDEX idx_deleted_entities_entity ON public.deleted_entities (entity_id);
CREATE INDEX idx_deleted_entities_retention ON public.deleted_entities (retention_expires_at)
  WHERE status = 'archived';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deleted_entities TO authenticated;
GRANT ALL ON public.deleted_entities TO service_role;
ALTER TABLE public.deleted_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Archive readers" ON public.deleted_entities
  FOR SELECT TO authenticated
  USING (public.has_capability(auth.uid(), 'entity.archive')
    OR public.has_capability(auth.uid(), 'entity.restore')
    OR public.has_capability(auth.uid(), 'entity.delete_forever')
    OR public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Archive writers" ON public.deleted_entities
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. ENTITY MOVE LOG
CREATE TABLE public.entity_move_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL,
  from_wp_id uuid,
  to_wp_id uuid NOT NULL,
  moved_by uuid,
  moved_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  partner_change jsonb,
  records_moved jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'success',
  error_message text
);
CREATE INDEX idx_entity_move_log_site ON public.entity_move_log (site_id, moved_at DESC);
CREATE INDEX idx_entity_move_log_to_wp ON public.entity_move_log (to_wp_id, moved_at DESC);
GRANT SELECT, INSERT ON public.entity_move_log TO authenticated;
GRANT ALL ON public.entity_move_log TO service_role;
ALTER TABLE public.entity_move_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Move log readers" ON public.entity_move_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_wp_access(auth.uid(), to_wp_id)
    OR (from_wp_id IS NOT NULL AND public.has_wp_access(auth.uid(), from_wp_id)));
CREATE POLICY "Move log writers" ON public.entity_move_log
  FOR INSERT TO authenticated
  WITH CHECK (moved_by = auth.uid());

-- 4. LOCK FLAGS
ALTER TABLE public.revenue_invoices
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS financial_period_lock_before date;

-- 5. LOCK CHECK
CREATE OR REPLACE FUNCTION public.site_move_blockers(_site_id uuid)
RETURNS TABLE (blocker text, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _lock_before date;
BEGIN
  SELECT financial_period_lock_before INTO _lock_before FROM public.app_settings LIMIT 1;

  RETURN QUERY
    SELECT 'commissioning_complete'::text, 'Commissioning record ' || cr.id::text
    FROM public.commissioning_records cr
    WHERE cr.site_id = _site_id AND cr.commissioning_date IS NOT NULL;

  RETURN QUERY
    SELECT 'handover_signed'::text, 'Handover pack ' || hp.id::text
    FROM public.handover_packs hp
    WHERE hp.site_id = _site_id
      AND hp.status IN ('signed','completed','handed_over');

  RETURN QUERY
    SELECT 'contract_closed'::text, 'Contract ' || c.id::text
    FROM public.contracts c
    WHERE c.closed_at IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.site_estimates se
        WHERE se.site_id = _site_id AND se.contract_id = c.id
      );

  IF _lock_before IS NOT NULL THEN
    RETURN QUERY
      SELECT 'financial_period_locked'::text,
             'Site has actual costs dated before ' || _lock_before::text
      FROM public.actual_costs ac
      WHERE ac.site_id = _site_id
        AND ac.created_at::date < _lock_before
      LIMIT 1;
  END IF;
END;
$$;

-- 6. MOVE SITES BETWEEN WPS
CREATE OR REPLACE FUNCTION public.move_sites_between_wps(
  _site_ids uuid[], _to_wp_id uuid, _reason text,
  _adopt_destination_partner boolean DEFAULT false)
RETURNS TABLE (site_id uuid, status text, message text, records_moved jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _sid uuid;
  _from_wp uuid;
  _dest_partner uuid;
  _src_partner uuid;
  _blockers text[];
  _counts jsonb;
  _bulk boolean;
  _tables text[] := ARRAY[
    'wp_tasks','design_submissions','dno_offers','permits','rams_documents',
    'traffic_management_plans','site_photos','site_precon_gates','site_stage_status',
    'site_handover_docs','snagging_items','inspections','daily_logs',
    'materials_deliveries','test_certificates','commissioning_records','handover_packs',
    'onedrive_uploads','actual_costs','projects','resource_allocations','workflow_instances'
  ];
  _tbl text;
  _moved integer;
  _partner_change jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _reason IS NULL OR btrim(_reason) = '' THEN
    RAISE EXCEPTION 'Move reason is required';
  END IF;

  _bulk := COALESCE(array_length(_site_ids,1),0) > 1;

  IF _bulk THEN
    IF NOT public.has_capability(_uid, 'site.bulk_move') THEN
      RAISE EXCEPTION 'Not authorised to bulk move sites';
    END IF;
  ELSE
    IF NOT (public.has_capability(_uid, 'site.move')
            OR public.has_capability(_uid, 'site.bulk_move')) THEN
      RAISE EXCEPTION 'Not authorised to move sites';
    END IF;
  END IF;

  SELECT wpa.partner_id INTO _dest_partner
  FROM public.wp_partner_allocations wpa
  WHERE wpa.work_package_id = _to_wp_id
  ORDER BY wpa.created_at ASC LIMIT 1;

  FOREACH _sid IN ARRAY _site_ids LOOP
    BEGIN
      SELECT ws.work_package_id, ws.partner_id INTO _from_wp, _src_partner
      FROM public.wp_sites ws WHERE ws.site_id = _sid
      ORDER BY ws.created_at DESC LIMIT 1;

      IF _from_wp IS NULL THEN
        site_id := _sid; status := 'error';
        message := 'Site not attached to any Work Package';
        records_moved := '{}'::jsonb; RETURN NEXT; CONTINUE;
      END IF;

      IF _from_wp = _to_wp_id THEN
        site_id := _sid; status := 'skipped';
        message := 'Site already on destination Work Package';
        records_moved := '{}'::jsonb; RETURN NEXT; CONTINUE;
      END IF;

      SELECT array_agg(blocker || ': ' || detail) INTO _blockers
      FROM public.site_move_blockers(_sid);

      IF _blockers IS NOT NULL AND array_length(_blockers,1) > 0 THEN
        site_id := _sid; status := 'blocked';
        message := array_to_string(_blockers, '; ');
        records_moved := '{}'::jsonb;
        INSERT INTO public.entity_move_log
          (site_id, from_wp_id, to_wp_id, moved_by, reason, status, error_message)
        VALUES (_sid, _from_wp, _to_wp_id, _uid, _reason, 'blocked', message);
        RETURN NEXT; CONTINUE;
      END IF;

      UPDATE public.wp_sites
      SET work_package_id = _to_wp_id,
          partner_id = CASE
            WHEN _adopt_destination_partner AND _dest_partner IS NOT NULL THEN _dest_partner
            ELSE partner_id END
      WHERE site_id = _sid AND work_package_id = _from_wp;

      _partner_change := CASE
        WHEN _adopt_destination_partner AND _dest_partner IS NOT NULL
             AND _src_partner IS DISTINCT FROM _dest_partner
          THEN jsonb_build_object('from', _src_partner, 'to', _dest_partner)
        ELSE jsonb_build_object('unchanged', true) END;

      _counts := '{}'::jsonb;
      FOREACH _tbl IN ARRAY _tables LOOP
        BEGIN
          EXECUTE format(
            'UPDATE public.%I SET work_package_id=$1 WHERE site_id=$2 AND work_package_id=$3',
            _tbl) USING _to_wp_id, _sid, _from_wp;
          GET DIAGNOSTICS _moved = ROW_COUNT;
          IF _moved > 0 THEN
            _counts := _counts || jsonb_build_object(_tbl, _moved);
          END IF;
        EXCEPTION WHEN OTHERS THEN
          _counts := _counts || jsonb_build_object(_tbl || '__error', SQLERRM);
        END;
      END LOOP;

      INSERT INTO public.entity_move_log
        (site_id, from_wp_id, to_wp_id, moved_by, reason, partner_change, records_moved, status)
      VALUES (_sid, _from_wp, _to_wp_id, _uid, _reason, _partner_change, _counts, 'success');

      INSERT INTO public.audit_log (user_id, action, site_id, meta_json)
      VALUES (_uid, 'site.moved', _sid,
        jsonb_build_object('from_wp', _from_wp, 'to_wp', _to_wp_id,
          'reason', _reason, 'records_moved', _counts,
          'partner_change', _partner_change));

      INSERT INTO public.notifications (user_id, type, message, entity_type, entity_id, link)
      SELECT DISTINCT wt.user_id, 'site_moved',
        'Site moved between Work Packages: ' || _reason,
        'site', _sid, '/wp/' || _to_wp_id::text
      FROM public.wp_team wt
      WHERE wt.work_package_id IN (_from_wp, _to_wp_id)
        AND wt.user_id IS NOT NULL AND wt.user_id <> _uid;

      site_id := _sid; status := 'moved';
      message := 'Moved successfully'; records_moved := _counts;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      site_id := _sid; status := 'error';
      message := SQLERRM; records_moved := '{}'::jsonb;
      INSERT INTO public.entity_move_log
        (site_id, from_wp_id, to_wp_id, moved_by, reason, status, error_message)
      VALUES (_sid, _from_wp, _to_wp_id, _uid, _reason, 'error', SQLERRM);
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.move_sites_between_wps(uuid[], uuid, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.move_sites_between_wps(uuid[], uuid, text, boolean) TO authenticated;

-- 7. ARCHIVE / RESTORE / PURGE
CREATE OR REPLACE FUNCTION public.scan_entity_dependencies(_entity_type text, _entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _out jsonb := '{}'::jsonb; _cnt integer;
BEGIN
  IF _entity_type = 'site' THEN
    SELECT COUNT(*) INTO _cnt FROM public.wp_tasks WHERE site_id = _entity_id;
    _out := _out || jsonb_build_object('wp_tasks', _cnt);
    SELECT COUNT(*) INTO _cnt FROM public.site_photos WHERE site_id = _entity_id;
    _out := _out || jsonb_build_object('site_photos', _cnt);
    SELECT COUNT(*) INTO _cnt FROM public.design_submissions WHERE site_id = _entity_id;
    _out := _out || jsonb_build_object('design_submissions', _cnt);
    SELECT COUNT(*) INTO _cnt FROM public.dno_offer_sites WHERE site_id = _entity_id;
    _out := _out || jsonb_build_object('dno_offers', _cnt);
    SELECT COUNT(*) INTO _cnt FROM public.permits WHERE site_id = _entity_id;
    _out := _out || jsonb_build_object('permits', _cnt);
    SELECT COUNT(*) INTO _cnt FROM public.wp_sites WHERE site_id = _entity_id;
    _out := _out || jsonb_build_object('wp_memberships', _cnt);
  ELSIF _entity_type = 'work_package' THEN
    SELECT COUNT(*) INTO _cnt FROM public.wp_sites WHERE work_package_id = _entity_id;
    _out := _out || jsonb_build_object('sites', _cnt);
    SELECT COUNT(*) INTO _cnt FROM public.wp_tasks WHERE work_package_id = _entity_id;
    _out := _out || jsonb_build_object('tasks', _cnt);
  ELSIF _entity_type = 'programme' THEN
    SELECT COUNT(*) INTO _cnt FROM public.work_packages WHERE programme_id = _entity_id;
    _out := _out || jsonb_build_object('work_packages', _cnt);
  END IF;
  RETURN _out;
END;
$$;
REVOKE ALL ON FUNCTION public.scan_entity_dependencies(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.scan_entity_dependencies(text, uuid) TO authenticated;

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

  INSERT INTO public.audit_log (user_id, action, site_id, meta_json)
  VALUES (_uid, 'entity.archived',
    CASE WHEN _entity_type='site' THEN _entity_id ELSE NULL END,
    jsonb_build_object('entity_type',_entity_type,'entity_id',_entity_id,
                       'archive_id',_archive_id,'reason',_reason));
  RETURN _archive_id;
END;
$$;
REVOKE ALL ON FUNCTION public.archive_entity(text, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.archive_entity(text, uuid, text) TO authenticated;

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
  UPDATE public.deleted_entities
  SET status='restored', restored_by=_uid, restored_at=now()
  WHERE id = _archive_id;

  INSERT INTO public.audit_log (user_id, action, site_id, meta_json)
  VALUES (_uid, 'entity.restored',
    CASE WHEN _row.entity_type='site' THEN _row.entity_id ELSE NULL END,
    jsonb_build_object('entity_type',_row.entity_type,'entity_id',_row.entity_id,
                       'archive_id',_archive_id));
  RETURN _row.entity_id;
END;
$$;
REVOKE ALL ON FUNCTION public.restore_entity(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.restore_entity(uuid) TO authenticated;

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
  UPDATE public.deleted_entities SET status='purged', purged_at=now()
  WHERE id = _archive_id;
  INSERT INTO public.audit_log (user_id, action, site_id, meta_json)
  VALUES (_uid, 'entity.purged',
    CASE WHEN _row.entity_type='site' THEN _row.entity_id ELSE NULL END,
    jsonb_build_object('entity_type',_row.entity_type,'entity_id',_row.entity_id,
                       'archive_id',_archive_id));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_entity(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.purge_entity(uuid) TO authenticated;
