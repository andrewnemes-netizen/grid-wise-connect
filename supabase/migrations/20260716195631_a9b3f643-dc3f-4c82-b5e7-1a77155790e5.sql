
-- Helper: upsert a gate row
CREATE OR REPLACE FUNCTION public.upsert_precon_gate(
  p_wp uuid, p_site uuid, p_gate text, p_state text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_wp IS NULL OR p_site IS NULL THEN RETURN; END IF;
  INSERT INTO public.site_precon_gates (work_package_id, site_id, gate_key, state, passed_at)
  VALUES (p_wp, p_site, p_gate, p_state,
          CASE WHEN p_state = 'passed' THEN now() ELSE NULL END)
  ON CONFLICT (work_package_id, site_id, gate_key)
  DO UPDATE SET state = EXCLUDED.state,
                passed_at = COALESCE(EXCLUDED.passed_at, site_precon_gates.passed_at),
                updated_at = now();
END $$;

-- 1. DNO offer inserted → close POC task, raise Estimate task, pass POC gate
CREATE OR REPLACE FUNCTION public.trg_dno_offer_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE due date := (current_date + 21);
BEGIN
  IF NEW.site_id IS NULL OR NEW.work_package_id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.wp_tasks
     SET status = 'done', percent_complete = 100, updated_at = now()
   WHERE work_package_id = NEW.work_package_id
     AND site_id = NEW.site_id
     AND task_kind::text = 'poc'
     AND status <> 'done';

  IF NOT EXISTS (
    SELECT 1 FROM public.wp_tasks
     WHERE work_package_id = NEW.work_package_id
       AND site_id = NEW.site_id
       AND task_kind::text = 'estimate'
  ) THEN
    INSERT INTO public.wp_tasks (work_package_id, site_id, task_kind, title, status, due_date)
    VALUES (NEW.work_package_id, NEW.site_id, 'estimate', 'Estimate from offer', 'todo', due);
  END IF;

  PERFORM public.upsert_precon_gate(NEW.work_package_id, NEW.site_id, 'poc', 'passed');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dno_offers_precon ON public.dno_offers;
CREATE TRIGGER trg_dno_offers_precon
AFTER INSERT ON public.dno_offers
FOR EACH ROW EXECUTE FUNCTION public.trg_dno_offer_after_insert();

-- 2. site_estimates approved → pass commercial gate on every WP the site belongs to
CREATE OR REPLACE FUNCTION public.trg_site_estimate_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r record;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    FOR r IN SELECT work_package_id FROM public.wp_sites WHERE site_id = NEW.site_id LOOP
      PERFORM public.upsert_precon_gate(r.work_package_id, NEW.site_id, 'commercial', 'passed');
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_site_estimates_precon ON public.site_estimates;
CREATE TRIGGER trg_site_estimates_precon
AFTER UPDATE OF status ON public.site_estimates
FOR EACH ROW EXECUTE FUNCTION public.trg_site_estimate_after_update();

-- 3. design_submissions approved → pass design_ev / design_icp gate
CREATE OR REPLACE FUNCTION public.trg_design_submission_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE gate text;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.site_id IS NOT NULL AND NEW.work_package_id IS NOT NULL THEN
    gate := CASE WHEN NEW.design_type = 'icp' THEN 'design_icp' ELSE 'design_ev' END;
    PERFORM public.upsert_precon_gate(NEW.work_package_id, NEW.site_id, gate, 'passed');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_design_submissions_precon ON public.design_submissions;
CREATE TRIGGER trg_design_submissions_precon
AFTER UPDATE OF status ON public.design_submissions
FOR EACH ROW EXECUTE FUNCTION public.trg_design_submission_after_update();

-- 4. rams_documents approved → pass rams gate
CREATE OR REPLACE FUNCTION public.trg_rams_after_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.site_id IS NOT NULL AND NEW.work_package_id IS NOT NULL THEN
    PERFORM public.upsert_precon_gate(NEW.work_package_id, NEW.site_id, 'rams', 'passed');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_rams_precon ON public.rams_documents;
CREATE TRIGGER trg_rams_precon
AFTER UPDATE OF status ON public.rams_documents
FOR EACH ROW EXECUTE FUNCTION public.trg_rams_after_update();

-- 5. final_review passed → release delivery project_tasks for that site (blocked→todo)
CREATE OR REPLACE FUNCTION public.trg_precon_gate_release_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE proj uuid;
BEGIN
  IF NEW.gate_key <> 'final_review' OR NEW.state <> 'passed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.state = 'passed' THEN RETURN NEW; END IF;

  SELECT delivery_project_id INTO proj FROM public.work_packages WHERE id = NEW.work_package_id;
  IF proj IS NULL THEN RETURN NEW; END IF;

  UPDATE public.project_tasks
     SET status = 'todo', updated_at = now()
   WHERE project_id = proj
     AND site_id = NEW.site_id
     AND status = 'blocked';

  INSERT INTO public.audit_log (action, site_id, meta_json)
  VALUES ('precon.delivery_released', NEW.site_id,
          jsonb_build_object('work_package_id', NEW.work_package_id, 'project_id', proj));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_precon_gates_release ON public.site_precon_gates;
CREATE TRIGGER trg_precon_gates_release
AFTER INSERT OR UPDATE OF state ON public.site_precon_gates
FOR EACH ROW EXECUTE FUNCTION public.trg_precon_gate_release_delivery();
