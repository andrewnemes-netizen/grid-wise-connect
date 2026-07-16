
CREATE OR REPLACE FUNCTION public.trg_rams_notify()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recipient uuid;
BEGIN
  IF lower(COALESCE(NEW.status,'')) <> 'approved' THEN RETURN NEW; END IF;
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  recipient := NEW.created_by;
  IF recipient IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications(user_id, type, message)
  VALUES (recipient, 'rams.approved', COALESCE(NEW.title,'RAMS')||' approved');
  RETURN NEW;
END; $$;
