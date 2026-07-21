CREATE OR REPLACE FUNCTION public.notify_stage_owner_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid; v_stage_label text; v_site_name text; v_wp_name text; v_link text; v_context text;
BEGIN
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
      WHERE TG_OP='INSERT' OR NOT (u = ANY (COALESCE(OLD.recipient_user_ids,'{}'::uuid[])))
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