
-- 1. Add client decision fields to site_estimates
ALTER TABLE public.site_estimates
  ADD COLUMN IF NOT EXISTS client_decision text,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by uuid,
  ADD COLUMN IF NOT EXISTS decision_notes text;

-- Validate client_decision values via trigger (avoid CHECK for future-proofing)
CREATE OR REPLACE FUNCTION public.validate_site_estimate_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.client_decision IS NOT NULL
     AND NEW.client_decision NOT IN ('accepted','rejected','pending') THEN
    RAISE EXCEPTION 'client_decision must be one of accepted, rejected, pending (got %)', NEW.client_decision;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_site_estimate_decision ON public.site_estimates;
CREATE TRIGGER trg_validate_site_estimate_decision
BEFORE INSERT OR UPDATE OF client_decision ON public.site_estimates
FOR EACH ROW EXECUTE FUNCTION public.validate_site_estimate_decision();

-- 2. Replace trigger: commercial gate should fire on client_decision='accepted'
--    (not on status='approved', which is only internal approval)
CREATE OR REPLACE FUNCTION public.trg_site_estimate_after_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
BEGIN
  -- Client accepted → pass commercial gate on every WP that owns this site
  IF NEW.client_decision = 'accepted'
     AND (OLD.client_decision IS DISTINCT FROM NEW.client_decision) THEN
    FOR r IN
      SELECT ws.work_package_id
      FROM public.wp_sites ws
      WHERE ws.site_id = NEW.site_id
    LOOP
      PERFORM public.upsert_precon_gate(
        r.work_package_id, NEW.site_id, 'commercial',
        'passed', NEW.decided_by,
        jsonb_build_object('site_estimate_id', NEW.id, 'source', 'client_decision.accepted')
      );
    END LOOP;

    -- Clear any prior blocker_reason
    UPDATE public.sites SET blocker_reason = NULL WHERE id = NEW.site_id AND blocker_reason IS NOT NULL;

    INSERT INTO public.audit_log(action, site_id, meta_json)
    VALUES ('client_decision.accepted', NEW.site_id, jsonb_build_object('site_estimate_id', NEW.id));
  END IF;

  -- Client rejected → set blocker on site + cancel open POC/estimate tasks
  IF NEW.client_decision = 'rejected'
     AND (OLD.client_decision IS DISTINCT FROM NEW.client_decision) THEN
    UPDATE public.sites
      SET blocker_reason = COALESCE(NEW.decision_notes, 'Client rejected quotation')
      WHERE id = NEW.site_id;

    UPDATE public.wp_tasks
      SET status = 'cancelled', updated_at = now()
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

-- Ensure the trigger is bound to the right column set
DROP TRIGGER IF EXISTS trg_site_estimates_precon ON public.site_estimates;
CREATE TRIGGER trg_site_estimates_precon
AFTER UPDATE OF status, client_decision ON public.site_estimates
FOR EACH ROW EXECUTE FUNCTION public.trg_site_estimate_after_update();
