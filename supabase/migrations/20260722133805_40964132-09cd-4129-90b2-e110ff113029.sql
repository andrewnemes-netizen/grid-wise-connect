CREATE OR REPLACE FUNCTION public.working_days_between(from_date date, to_date date)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COUNT(*)::int
  FROM generate_series(LEAST(from_date, to_date), GREATEST(from_date, to_date) - 1, '1 day') AS d
  WHERE EXTRACT(DOW FROM d) NOT IN (0, 6);
$$;

REVOKE ALL ON FUNCTION public.working_days_between(date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.working_days_between(date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.working_days_between(date, date) TO service_role;

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
  v_next_label text;
  v_wp_name text;
  v_count int := array_length(p_site_ids, 1);
  v_processed int := 0;
  v_link text;
  v_is_count_up boolean;
  v_is_count_down boolean;
  v_wait_target date;
BEGIN
  IF v_count IS NULL OR v_count = 0 THEN
    RETURN jsonb_build_object('processed', 0, 'notified', 0);
  END IF;

  PERFORM set_config('app.suppress_stage_notify', '1', true);

  IF p_stage = 'survey_completed' THEN
    v_next_stages := ARRAY['build_design_po_gate','icp_po'];
  ELSIF p_stage IN ('build_handover_gate','connections_handover_gate') THEN
    v_next_stages := ARRAY[]::text[];
  ELSE
    v_next_stages := CASE p_stage
      WHEN 'intake'                        THEN ARRAY['poc_application']
      WHEN 'poc_application'             THEN ARRAY['poc_offer_awaiting']
      WHEN 'poc_offer_awaiting'          THEN ARRAY['poc_quote']
      WHEN 'poc_quote'                   THEN ARRAY['client_site_selection']
      WHEN 'client_site_selection'       THEN ARRAY['issue_survey_design_quote']
      WHEN 'issue_survey_design_quote'   THEN ARRAY['survey_po_gate']
      WHEN 'survey_po_gate'              THEN ARRAY['survey_allocation']
      WHEN 'survey_allocation'           THEN ARRAY['survey_completed']
      WHEN 'build_design_po_gate'        THEN ARRAY['build_quote_design']
      WHEN 'build_quote_design'          THEN ARRAY['build_quote_sent']
      WHEN 'build_quote_sent'            THEN ARRAY['build_handover_gate']
      WHEN 'icp_po'                      THEN ARRAY['connections_handover_gate']
      ELSE ARRAY[]::text[]
    END;
  END IF;

  FOREACH v_site IN ARRAY p_site_ids LOOP
    INSERT INTO public.site_stage_status
      (work_package_id, site_id, stage, workflow_status, owner_id,
       recipient_user_ids, recipient_contact_ids, actual_finish_date, blocked_reason)
    VALUES
      (p_wp_id, v_site, p_stage::public.site_stage_key, 'done'::public.site_stage_state, NULL,
       '{}'::uuid[], '{}'::uuid[], v_today, NULL)
    ON CONFLICT (site_id, stage) DO UPDATE
      SET work_package_id = EXCLUDED.work_package_id,
          workflow_status = 'done'::public.site_stage_state,
          owner_id = NULL,
          recipient_user_ids = '{}'::uuid[],
          recipient_contact_ids = '{}'::uuid[],
          actual_finish_date = v_today,
          blocked_reason = NULL;
    v_processed := v_processed + 1;
  END LOOP;

  IF array_length(v_next_stages, 1) IS NOT NULL AND array_length(p_next_recipient_user_ids, 1) IS NOT NULL THEN
    FOREACH v_next IN ARRAY v_next_stages LOOP
      -- poc_offer_awaiting: count-down target (20 working days).
      -- survey_po_gate: count-up start date (quote issued), no target.
      v_is_count_down := v_next = 'poc_offer_awaiting';
      v_is_count_up   := v_next = 'survey_po_gate';

      IF v_is_count_down THEN
        SELECT d::date INTO v_wait_target
        FROM (
          SELECT generate_series(v_today + 1, v_today + 40, '1 day')::date AS d
        ) s
        WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
        ORDER BY d
        OFFSET 19 LIMIT 1;
      ELSE
        v_wait_target := NULL;
      END IF;

      FOREACH v_site IN ARRAY p_site_ids LOOP
        INSERT INTO public.site_stage_status
          (work_package_id, site_id, stage, workflow_status, owner_id,
           recipient_user_ids, recipient_contact_ids, actual_start_date,
           wait_started_at, wait_target_date, wait_delay_reason, wait_delay_logged_at)
        VALUES
          (p_wp_id, v_site, v_next::public.site_stage_key, 'in_progress'::public.site_stage_state,
           CASE WHEN v_next IN ('build_handover_gate','connections_handover_gate')
                THEN NULL ELSE p_next_recipient_user_ids[1] END,
           p_next_recipient_user_ids, '{}'::uuid[], v_today,
           CASE WHEN v_is_count_down OR v_is_count_up THEN now() ELSE NULL END,
           v_wait_target,
           NULL, NULL)
        ON CONFLICT (site_id, stage) DO UPDATE
          SET work_package_id = EXCLUDED.work_package_id,
              workflow_status = CASE
                WHEN site_stage_status.workflow_status = 'not_started'::public.site_stage_state
                THEN 'in_progress'::public.site_stage_state
                ELSE site_stage_status.workflow_status
              END,
              owner_id = CASE WHEN v_next IN ('build_handover_gate','connections_handover_gate')
                              THEN NULL ELSE p_next_recipient_user_ids[1] END,
              recipient_user_ids = p_next_recipient_user_ids,
              recipient_contact_ids = '{}'::uuid[],
              actual_start_date = COALESCE(site_stage_status.actual_start_date, v_today),
              wait_started_at = CASE WHEN (v_is_count_down OR v_is_count_up) AND site_stage_status.wait_started_at IS NULL
                                     THEN now() ELSE site_stage_status.wait_started_at END,
              wait_target_date = CASE WHEN v_is_count_down AND site_stage_status.wait_target_date IS NULL
                                    THEN v_wait_target ELSE site_stage_status.wait_target_date END;
      END LOOP;
    END LOOP;
  END IF;

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