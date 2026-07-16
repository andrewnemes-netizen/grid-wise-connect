
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
  recipient := COALESCE(NEW.submitted_by_user_id, NEW.approved_by);
  IF recipient IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.notifications(user_id, type, message)
  VALUES (recipient, 'design.approved', 'Design ' || COALESCE(NEW.design_type,'submission') || ' approved');
  RETURN NEW;
END;
$$;
