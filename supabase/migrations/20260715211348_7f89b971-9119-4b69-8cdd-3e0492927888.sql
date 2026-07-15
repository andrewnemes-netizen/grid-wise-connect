-- Widen status check to include revise_requested
ALTER TABLE public.design_submissions DROP CONSTRAINT IF EXISTS design_submissions_status_check;
ALTER TABLE public.design_submissions
  ADD CONSTRAINT design_submissions_status_check
  CHECK (status = ANY (ARRAY['draft','submitted','in_review','approved','rejected','revise_requested','superseded']));

-- Rewrite trigger fns with lowercase status values
CREATE OR REPLACE FUNCTION public.on_design_review_recorded()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _wp uuid;
  _sub_status text;
BEGIN
  SELECT work_package_id INTO _wp FROM public.design_submissions WHERE id = NEW.design_submission_id;

  _sub_status := CASE upper(NEW.decision)
    WHEN 'APPROVED' THEN 'approved'
    WHEN 'REJECTED' THEN 'rejected'
    WHEN 'REVISE'   THEN 'revise_requested'
    ELSE 'in_review'
  END;

  UPDATE public.design_submissions
     SET status = _sub_status,
         decision = upper(NEW.decision),
         approved_at = CASE WHEN _sub_status = 'approved' THEN COALESCE(approved_at, now()) ELSE approved_at END,
         approved_by = CASE WHEN _sub_status = 'approved' THEN COALESCE(approved_by, NEW.reviewer_id) ELSE approved_by END,
         is_current = true
   WHERE id = NEW.design_submission_id;

  IF _sub_status = 'approved' THEN
    UPDATE public.design_submissions
       SET status = 'superseded',
           is_current = false
     WHERE work_package_id = _wp
       AND id <> NEW.design_submission_id
       AND status <> 'approved';

    UPDATE public.work_packages
       SET latest_design_submission_id = NEW.design_submission_id
     WHERE id = _wp;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_design_submission_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.design_submissions
     SET is_current = false,
         status = CASE WHEN status IN ('draft','submitted','in_review','revise_requested','rejected')
                       THEN 'superseded' ELSE status END
   WHERE work_package_id = NEW.work_package_id
     AND id <> NEW.id;
  RETURN NEW;
END;
$$;