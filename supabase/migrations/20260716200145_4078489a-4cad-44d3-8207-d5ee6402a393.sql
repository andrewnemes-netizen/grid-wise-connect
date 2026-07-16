
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
    VALUES (NEW.work_package_id, NEW.site_id, 'estimate', 'Estimate from offer', 'not_started', due);
  END IF;

  PERFORM public.upsert_precon_gate(NEW.work_package_id, NEW.site_id, 'poc', 'passed');
  RETURN NEW;
END $$;
