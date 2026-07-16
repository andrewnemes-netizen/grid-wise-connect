
-- 1. wp_tasks INSERT / owner change → notify owner (or creator fallback)
CREATE OR REPLACE FUNCTION public.trg_wp_task_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
  msg text;
  wp_name text;
  site_name_txt text;
BEGIN
  recipient := COALESCE(NEW.owner_user_id, NEW.created_by);
  IF recipient IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only fire when this row is newly relevant to recipient
  IF TG_OP = 'UPDATE'
     AND OLD.owner_user_id IS NOT DISTINCT FROM NEW.owner_user_id THEN
    RETURN NEW;
  END IF;

  SELECT name INTO wp_name FROM public.work_packages WHERE id = NEW.work_package_id;
  IF NEW.site_id IS NOT NULL THEN
    SELECT site_name INTO site_name_txt FROM public.sites WHERE id = NEW.site_id;
  END IF;

  msg := COALESCE(NEW.title, 'Task')
      || CASE WHEN site_name_txt IS NOT NULL THEN ' — ' || site_name_txt ELSE '' END
      || CASE WHEN wp_name IS NOT NULL THEN ' (' || wp_name || ')' ELSE '' END
      || CASE WHEN NEW.due_date IS NOT NULL THEN ' · due ' || NEW.due_date::text ELSE '' END;

  INSERT INTO public.notifications(user_id, type, message)
  VALUES (recipient, 'wp_task.' || COALESCE(NEW.task_kind, 'other'), msg);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wp_tasks_notify ON public.wp_tasks;
CREATE TRIGGER trg_wp_tasks_notify
AFTER INSERT OR UPDATE OF owner_user_id ON public.wp_tasks
FOR EACH ROW EXECUTE FUNCTION public.trg_wp_task_notify();

-- 2. design_submissions approved → notify submitter
CREATE OR REPLACE FUNCTION public.trg_design_submission_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
BEGIN
  IF lower(COALESCE(NEW.status,'')) <> 'approved' THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  recipient := COALESCE(NEW.submitted_by, NEW.created_by);
  IF recipient IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.notifications(user_id, type, message)
  VALUES (
    recipient,
    'design.approved',
    'Design ' || COALESCE(NEW.design_type,'submission') || ' approved'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_design_submissions_notify ON public.design_submissions;
CREATE TRIGGER trg_design_submissions_notify
AFTER UPDATE OF status ON public.design_submissions
FOR EACH ROW EXECUTE FUNCTION public.trg_design_submission_notify();

-- 3. rams_documents approved → notify uploader/creator
CREATE OR REPLACE FUNCTION public.trg_rams_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recipient uuid;
BEGIN
  IF lower(COALESCE(NEW.status,'')) <> 'approved' THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  recipient := COALESCE(NEW.uploaded_by, NEW.created_by);
  IF recipient IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.notifications(user_id, type, message)
  VALUES (recipient, 'rams.approved', COALESCE(NEW.title,'RAMS') || ' approved');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rams_notify ON public.rams_documents;
CREATE TRIGGER trg_rams_notify
AFTER UPDATE OF status ON public.rams_documents
FOR EACH ROW EXECUTE FUNCTION public.trg_rams_notify();

-- 4. final_review gate passed → notify WP team
CREATE OR REPLACE FUNCTION public.trg_precon_gate_release_notify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member RECORD;
  site_name_txt text;
BEGIN
  IF NEW.gate_key <> 'final_review' OR NEW.state <> 'passed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.state = 'passed' THEN RETURN NEW; END IF;

  SELECT site_name INTO site_name_txt FROM public.sites WHERE id = NEW.site_id;

  FOR member IN
    SELECT DISTINCT user_id FROM public.wp_team WHERE work_package_id = NEW.work_package_id AND user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications(user_id, type, message)
    VALUES (
      member.user_id,
      'precon.ready_for_delivery',
      COALESCE(site_name_txt,'Site') || ' released to delivery'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_precon_gates_notify ON public.site_precon_gates;
CREATE TRIGGER trg_precon_gates_notify
AFTER INSERT OR UPDATE OF state ON public.site_precon_gates
FOR EACH ROW EXECUTE FUNCTION public.trg_precon_gate_release_notify();
