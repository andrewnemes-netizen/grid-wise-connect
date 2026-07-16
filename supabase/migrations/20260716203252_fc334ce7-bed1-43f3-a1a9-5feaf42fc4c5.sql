
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid;

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications(user_id, created_at DESC);

-- Refresh triggers to populate link + entity
CREATE OR REPLACE FUNCTION public.trg_wp_task_notify()
RETURNS trigger
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

  INSERT INTO public.notifications(user_id, type, message, link, entity_type, entity_id)
  VALUES (
    recipient, 'wp_task.' || kind_txt, msg,
    '/wp/' || NEW.work_package_id || '/delivery/tasks',
    'wp_task', NEW.id
  );
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_design_submission_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE recipient uuid;
BEGIN
  IF lower(COALESCE(NEW.status::text,'')) <> 'approved' THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  recipient := COALESCE(NEW.submitted_by_user_id, NEW.approved_by);
  IF recipient IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications(user_id, type, message, link, entity_type, entity_id)
  VALUES (
    recipient, 'design.approved',
    'Design ' || COALESCE(NEW.design_type,'submission') || ' approved',
    CASE WHEN NEW.work_package_id IS NOT NULL
         THEN '/wp/' || NEW.work_package_id || '/engineering/design'
         ELSE NULL END,
    'design_submission', NEW.id
  );
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_rams_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE recipient uuid;
BEGIN
  IF lower(COALESCE(NEW.status::text,'')) <> 'approved' THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  recipient := NEW.created_by;
  IF recipient IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications(user_id, type, message, link, entity_type, entity_id)
  VALUES (
    recipient, 'rams.approved',
    COALESCE(NEW.title,'RAMS') || ' approved',
    CASE WHEN NEW.work_package_id IS NOT NULL
         THEN '/wp/' || NEW.work_package_id || '/sites/pre-construction'
         ELSE NULL END,
    'rams_document', NEW.id
  );
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_precon_gate_release_notify()
RETURNS trigger
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
    SELECT DISTINCT user_id FROM public.wp_team
     WHERE work_package_id = NEW.work_package_id AND user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications(user_id, type, message, link, entity_type, entity_id)
    VALUES (
      member.user_id, 'precon.ready_for_delivery',
      COALESCE(site_name_txt,'Site') || ' released to delivery',
      '/wp/' || NEW.work_package_id || '/sites/readiness',
      'site', NEW.site_id
    );
  END LOOP;
  RETURN NEW;
END; $$;

-- New: dedicated notification when a DNO offer arrives
CREATE OR REPLACE FUNCTION public.trg_dno_offer_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  member RECORD;
  site_name_txt text;
BEGIN
  IF NEW.site_id IS NOT NULL THEN
    SELECT site_name INTO site_name_txt FROM public.sites WHERE id = NEW.site_id;
  END IF;

  FOR member IN
    SELECT DISTINCT user_id FROM public.wp_team
     WHERE work_package_id = NEW.work_package_id AND user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications(user_id, type, message, link, entity_type, entity_id)
    VALUES (
      member.user_id, 'dno_offer.received',
      'DNO offer received' || CASE WHEN site_name_txt IS NOT NULL THEN ' — ' || site_name_txt ELSE '' END,
      '/wp/' || NEW.work_package_id || '/engineering/dno-offers',
      'dno_offer', NEW.id
    );
  END LOOP;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_dno_offers_notify ON public.dno_offers;
CREATE TRIGGER trg_dno_offers_notify
AFTER INSERT ON public.dno_offers
FOR EACH ROW EXECUTE FUNCTION public.trg_dno_offer_notify();

-- Enable realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
