
-- Auto-pass final_review gate when prerequisites are complete
CREATE OR REPLACE FUNCTION public.maybe_auto_pass_final_review(p_wp uuid, p_site uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  poc_ok boolean;
  com_ok boolean;
  rams_ok boolean;
  design_ok boolean;
  final_state text;
BEGIN
  IF p_wp IS NULL OR p_site IS NULL THEN RETURN; END IF;

  SELECT state INTO final_state
    FROM public.site_precon_gates
   WHERE work_package_id = p_wp AND site_id = p_site AND gate_key = 'final_review';

  -- Don't clobber a manually-passed or waived final gate
  IF final_state IN ('passed','waived') THEN RETURN; END IF;

  SELECT EXISTS (SELECT 1 FROM public.site_precon_gates
                  WHERE work_package_id = p_wp AND site_id = p_site
                    AND gate_key = 'poc' AND state IN ('passed','waived')) INTO poc_ok;
  SELECT EXISTS (SELECT 1 FROM public.site_precon_gates
                  WHERE work_package_id = p_wp AND site_id = p_site
                    AND gate_key = 'commercial' AND state IN ('passed','waived')) INTO com_ok;
  SELECT EXISTS (SELECT 1 FROM public.site_precon_gates
                  WHERE work_package_id = p_wp AND site_id = p_site
                    AND gate_key = 'rams' AND state IN ('passed','waived')) INTO rams_ok;
  SELECT EXISTS (SELECT 1 FROM public.site_precon_gates
                  WHERE work_package_id = p_wp AND site_id = p_site
                    AND gate_key IN ('design_ev','design_icp')
                    AND state IN ('passed','waived')) INTO design_ok;

  IF poc_ok AND com_ok AND rams_ok AND design_ok THEN
    PERFORM public.upsert_precon_gate(p_wp, p_site, 'final_review', 'passed');
    INSERT INTO public.audit_log (action, site_id, meta_json)
    VALUES ('precon.final_review.auto_passed', p_site,
            jsonb_build_object('work_package_id', p_wp));
  END IF;
END $$;

-- Trigger: whenever a prerequisite gate changes, re-evaluate final_review
CREATE OR REPLACE FUNCTION public.trg_precon_gate_maybe_release()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.gate_key IN ('poc','commercial','rams','design_ev','design_icp')
     AND NEW.state IN ('passed','waived') THEN
    PERFORM public.maybe_auto_pass_final_review(NEW.work_package_id, NEW.site_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_precon_gates_maybe_release ON public.site_precon_gates;
CREATE TRIGGER trg_precon_gates_maybe_release
AFTER INSERT OR UPDATE OF state ON public.site_precon_gates
FOR EACH ROW EXECUTE FUNCTION public.trg_precon_gate_maybe_release();

-- Backfill: evaluate every existing (wp, site) pair once
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT work_package_id, site_id
      FROM public.site_precon_gates
  LOOP
    PERFORM public.maybe_auto_pass_final_review(r.work_package_id, r.site_id);
  END LOOP;
END $$;
