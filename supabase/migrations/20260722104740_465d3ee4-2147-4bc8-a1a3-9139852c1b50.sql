
-- 1) Make stage notification trigger skip when session flag is set (bulk mode).
CREATE OR REPLACE FUNCTION public.notify_stage_owner_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid; v_stage_label text; v_site_name text; v_wp_name text; v_link text; v_context text;
BEGIN
  -- Bulk suppression flag: set by bulk_complete_stage_and_assign_next
  IF current_setting('app.suppress_stage_notify', true) = '1' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(label, NEW.stage::text) INTO v_stage_label
    FROM public.stage_definitions WHERE key = NEW.stage::text LIMIT 1;
  IF v_stage_label IS NULL THEN v_stage_label := NEW.stage::text; END IF;
  SELECT site_name INTO v_site_name FROM public.sites WHERE id = NEW.site_id;
  SELECT name INTO v_wp_name FROM public.work_packages WHERE id = NEW.work_package_id;
  v_link := '/wp/'||NEW.work_package_id||'/sites/matrix?site='||NEW.site_id;
  v_context := COALESCE(v_wp_name,'Work package')||' · '||COALESCE(v_site_name,'Site');

  IF NEW.owner_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id) THEN
    INSERT INTO public.notifications (user_id, type, message, link, entity_type, entity_id)
    VALUES (NEW.owner_id, 'stage_assigned',
      'Assigned: '||v_stage_label||' — '||v_context,
      v_link, 'site_stage_status', NEW.id);
  END IF;

  IF TG_OP='UPDATE' AND OLD.owner_id IS NOT NULL AND (NEW.owner_id IS NULL OR NEW.owner_id IS DISTINCT FROM OLD.owner_id) THEN
    INSERT INTO public.notifications (user_id, type, message, link, entity_type, entity_id)
    VALUES (OLD.owner_id, 'stage_unassigned',
      'Unassigned: '||v_stage_label||' — '||v_context,
      v_link, 'site_stage_status', NEW.id);
  END IF;

  IF COALESCE(array_length(NEW.recipient_user_ids,1),0) > 0 THEN
    FOR v_uid IN
      SELECT DISTINCT u FROM unnest(NEW.recipient_user_ids) u
      WHERE (TG_OP='INSERT' OR NOT (u = ANY (COALESCE(OLD.recipient_user_ids,'{}'::uuid[]))))
        AND u IS DISTINCT FROM NEW.owner_id
    LOOP
      INSERT INTO public.notifications (user_id, type, message, link, entity_type, entity_id)
      VALUES (v_uid, 'stage_assigned',
        'Next up: '||v_stage_label||' — '||v_context,
        v_link, 'site_stage_status', NEW.id);
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Bulk RPC: mark many sites Done on the same stage, assign next stage(s)
--    to a single set of recipients, and emit ONE aggregated notification per
--    recipient per next stage (instead of one per site).
CREATE OR REPLACE FUNCTION public.bulk_complete_stage_and_assign_next(
  p_wp_id uuid,
  p_site_ids uuid[],
  p_stage text,
  p_next_recipient_user_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'utc')::date;
  v_site uuid;
  v_next_stages text[];
  v_next text;
  v_uid uuid;
  v_stage_label text;
  v_next_label text;
  v_wp_name text;
  v_count int := array_length(p_site_ids, 1);
  v_processed int := 0;
  v_link text;
BEGIN
  IF v_count IS NULL OR v_count = 0 THEN
    RETURN jsonb_build_object('processed', 0, 'notified', 0);
  END IF;

  -- Suppress per-row notifications for this transaction.
  PERFORM set_config('app.suppress_stage_notify', '1', true);

  -- Resolve next stages using the same rules as the client helper.
  IF p_stage = 'survey_completed' THEN
    v_next_stages := ARRAY['build_design_po_gate','icp_po'];
  ELSIF p_stage IN ('build_handover_gate','connections_handover_gate') THEN
    v_next_stages := ARRAY[]::text[];
  ELSE
    -- linear next within same track — read from stage_definitions ordering if
    -- present, else fall back to a hard-coded map.
    v_next_stages := CASE p_stage
      WHEN 'intake'                 THEN ARRAY['poc_application']
      WHEN 'poc_application'        THEN ARRAY['poc_offer_awaiting']
      WHEN 'poc_offer_awaiting'     THEN ARRAY['poc_quote_review']
      WHEN 'poc_quote_review'       THEN ARRAY['poc_quote_sent']
      WHEN 'poc_quote_sent'         THEN ARRAY['client_site_selection']
      WHEN 'client_site_selection'  THEN ARRAY['survey_po_gate']
      WHEN 'survey_po_gate'         THEN ARRAY['survey_allocation']
      WHEN 'survey_allocation'      THEN ARRAY['survey_completed']
      WHEN 'build_design_po_gate'   THEN ARRAY['build_quote_design']
      WHEN 'build_quote_design'     THEN ARRAY['build_quote_sent']
      WHEN 'build_quote_sent'       THEN ARRAY['build_handover_gate']
      WHEN 'icp_po'                 THEN ARRAY['connections_handover_gate']
      ELSE ARRAY[]::text[]
    END;
  END IF;

  -- 1) Close current stage for every site.
  FOREACH v_site IN ARRAY p_site_ids LOOP
    INSERT INTO public.site_stage_status
      (work_package_id, site_id, stage, workflow_status, owner_id,
       recipient_user_ids, recipient_contact_ids, actual_finish_date, blocked_reason)
    VALUES
      (p_wp_id, v_site, p_stage::stage_key, 'done', NULL,
       '{}'::uuid[], '{}'::uuid[], v_today, NULL)
    ON CONFLICT (site_id, stage) DO UPDATE
      SET work_package_id = EXCLUDED.work_package_id,
          workflow_status = 'done',
          owner_id = NULL,
          recipient_user_ids = '{}'::uuid[],
          recipient_contact_ids = '{}'::uuid[],
          actual_finish_date = v_today,
          blocked_reason = NULL;
    v_processed := v_processed + 1;
  END LOOP;

  -- 2) Open each next stage for every site with the given recipients.
  IF array_length(v_next_stages, 1) IS NOT NULL AND array_length(p_next_recipient_user_ids, 1) IS NOT NULL THEN
    FOREACH v_next IN ARRAY v_next_stages LOOP
      FOREACH v_site IN ARRAY p_site_ids LOOP
        INSERT INTO public.site_stage_status
          (work_package_id, site_id, stage, workflow_status, owner_id,
           recipient_user_ids, recipient_contact_ids, actual_start_date)
        VALUES
          (p_wp_id, v_site, v_next::stage_key, 'in_progress',
           CASE WHEN v_next IN ('build_handover_gate','connections_handover_gate')
                THEN NULL ELSE p_next_recipient_user_ids[1] END,
           p_next_recipient_user_ids, '{}'::uuid[], v_today)
        ON CONFLICT (site_id, stage) DO UPDATE
          SET work_package_id = EXCLUDED.work_package_id,
              workflow_status = CASE
                WHEN site_stage_status.workflow_status = 'not_started'
                THEN 'in_progress'::stage_status
                ELSE site_stage_status.workflow_status
              END,
              owner_id = CASE WHEN v_next IN ('build_handover_gate','connections_handover_gate')
                              THEN NULL ELSE p_next_recipient_user_ids[1] END,
              recipient_user_ids = p_next_recipient_user_ids,
              recipient_contact_ids = '{}'::uuid[],
              actual_start_date = COALESCE(site_stage_status.actual_start_date, v_today);
      END LOOP;
    END LOOP;
  END IF;

  -- 3) Emit ONE aggregated notification per recipient per next stage.
  SELECT name INTO v_wp_name FROM public.work_packages WHERE id = p_wp_id;

  IF array_length(v_next_stages, 1) IS NOT NULL AND array_length(p_next_recipient_user_ids, 1) IS NOT NULL THEN
    FOREACH v_next IN ARRAY v_next_stages LOOP
      SELECT COALESCE(label, v_next) INTO v_next_label
        FROM public.stage_definitions WHERE key = v_next LIMIT 1;
      IF v_next_label IS NULL THEN v_next_label := v_next; END IF;
      v_link := '/wp/'||p_wp_id||'/sites/matrix?stage='||v_next;

      FOREACH v_uid IN ARRAY p_next_recipient_user_ids LOOP
        INSERT INTO public.notifications (user_id, type, message, link, entity_type, entity_id)
        VALUES (v_uid, 'stage_assigned',
          'Next up: '||v_next_label||' — '||v_count||' sites in '||COALESCE(v_wp_name,'Work package'),
          v_link, 'work_package', p_wp_id);
      END LOOP;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'next_stages', to_jsonb(v_next_stages),
    'recipients', array_length(p_next_recipient_user_ids, 1)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_complete_stage_and_assign_next(uuid, uuid[], text, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.bulk_complete_stage_and_assign_next(uuid, uuid[], text, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_complete_stage_and_assign_next(uuid, uuid[], text, uuid[]) TO service_role;
