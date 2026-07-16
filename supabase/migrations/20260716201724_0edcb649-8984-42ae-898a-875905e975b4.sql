
CREATE OR REPLACE FUNCTION public.trg_site_estimate_after_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.client_decision = 'accepted'
     AND (OLD.client_decision IS DISTINCT FROM NEW.client_decision) THEN
    FOR r IN SELECT ws.work_package_id FROM public.wp_sites ws WHERE ws.site_id = NEW.site_id LOOP
      PERFORM public.upsert_precon_gate(r.work_package_id, NEW.site_id, 'commercial', 'passed');
    END LOOP;
    UPDATE public.sites SET blocker_reason = NULL WHERE id = NEW.site_id AND blocker_reason IS NOT NULL;
    INSERT INTO public.audit_log(action, site_id, meta_json)
    VALUES ('client_decision.accepted', NEW.site_id, jsonb_build_object('site_estimate_id', NEW.id));
  END IF;

  IF NEW.client_decision = 'rejected'
     AND (OLD.client_decision IS DISTINCT FROM NEW.client_decision) THEN
    UPDATE public.sites
      SET blocker_reason = COALESCE(NEW.decision_notes, 'Client rejected quotation')
      WHERE id = NEW.site_id;
    UPDATE public.wp_tasks
      SET status='cancelled', updated_at=now()
      WHERE site_id = NEW.site_id
        AND task_kind IN ('poc','estimate','client_decision')
        AND status IN ('not_started','in_progress');
    INSERT INTO public.audit_log(action, site_id, meta_json)
    VALUES ('client_decision.rejected', NEW.site_id,
            jsonb_build_object('site_estimate_id', NEW.id, 'notes', NEW.decision_notes));
  END IF;

  RETURN NEW;
END;
$$;
