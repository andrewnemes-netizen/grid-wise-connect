
CREATE OR REPLACE FUNCTION public.trg_site_estimate_after_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF lower(NEW.status::text) = 'approved' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    FOR r IN SELECT work_package_id FROM public.wp_sites WHERE site_id = NEW.site_id LOOP
      PERFORM public.upsert_precon_gate(r.work_package_id, NEW.site_id, 'commercial', 'passed');
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_design_submission_after_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE gate text;
BEGIN
  IF lower(NEW.status::text) = 'approved' AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.site_id IS NOT NULL AND NEW.work_package_id IS NOT NULL THEN
    gate := CASE WHEN NEW.design_type = 'icp' THEN 'design_icp' ELSE 'design_ev' END;
    PERFORM public.upsert_precon_gate(NEW.work_package_id, NEW.site_id, gate, 'passed');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.trg_rams_after_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(NEW.status::text) = 'approved' AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.site_id IS NOT NULL AND NEW.work_package_id IS NOT NULL THEN
    PERFORM public.upsert_precon_gate(NEW.work_package_id, NEW.site_id, 'rams', 'passed');
  END IF;
  RETURN NEW;
END $$;
