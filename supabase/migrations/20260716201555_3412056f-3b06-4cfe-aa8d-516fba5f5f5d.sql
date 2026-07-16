
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
  kind_txt text;
BEGIN
  recipient := COALESCE(NEW.owner_user_id, NEW.created_by);
  IF recipient IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.owner_user_id IS NOT DISTINCT FROM NEW.owner_user_id THEN
    RETURN NEW;
  END IF;

  SELECT name INTO wp_name FROM public.work_packages WHERE id = NEW.work_package_id;
  IF NEW.site_id IS NOT NULL THEN
    SELECT site_name INTO site_name_txt FROM public.sites WHERE id = NEW.site_id;
  END IF;

  kind_txt := COALESCE(NEW.task_kind::text, 'other');

  msg := COALESCE(NEW.title, 'Task')
      || CASE WHEN site_name_txt IS NOT NULL THEN ' — ' || site_name_txt ELSE '' END
      || CASE WHEN wp_name IS NOT NULL THEN ' (' || wp_name || ')' ELSE '' END
      || CASE WHEN NEW.due_date IS NOT NULL THEN ' · due ' || NEW.due_date::text ELSE '' END;

  INSERT INTO public.notifications(user_id, type, message)
  VALUES (recipient, 'wp_task.' || kind_txt, msg);

  RETURN NEW;
END;
$$;
