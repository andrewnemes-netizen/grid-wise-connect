
-- Pre-Construction Pipeline: owner assignment metadata + notification on assign
ALTER TABLE public.stage_definitions
  ADD COLUMN IF NOT EXISTS requires_owner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_owner_roles text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Trigger: when owner_id changes on site_stage_status, create a notification
-- to the picked owner and audit the change. No defaults, only fires when set.
CREATE OR REPLACE FUNCTION public.notify_stage_owner_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_name text;
BEGIN
  IF NEW.owner_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id) THEN
    SELECT site_name INTO v_site_name FROM public.sites WHERE id = NEW.site_id;
    INSERT INTO public.notifications (user_id, type, message, link, entity_type, entity_id)
    VALUES (
      NEW.owner_id,
      'stage_owner_assigned',
      'You have been assigned as owner for ' || COALESCE(v_site_name, 'a site') || ' — ' || NEW.stage::text,
      '/wp/' || NEW.work_package_id::text || '/sites/matrix?site=' || NEW.site_id::text,
      'site_stage_status',
      NEW.id
    );
    -- If previous owner existed, notify them of unassignment
    IF TG_OP = 'UPDATE' AND OLD.owner_id IS NOT NULL AND OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
      INSERT INTO public.notifications (user_id, type, message, link, entity_type, entity_id)
      VALUES (
        OLD.owner_id,
        'stage_owner_unassigned',
        'You are no longer owner for ' || COALESCE(v_site_name, 'a site') || ' — ' || NEW.stage::text,
        '/wp/' || NEW.work_package_id::text || '/sites/matrix?site=' || NEW.site_id::text,
        'site_stage_status',
        NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_stage_owner ON public.site_stage_status;
CREATE TRIGGER trg_notify_stage_owner
AFTER INSERT OR UPDATE OF owner_id ON public.site_stage_status
FOR EACH ROW
EXECUTE FUNCTION public.notify_stage_owner_assignment();
