-- Phase 5: Studies & Design approvals

-- 1) design_submissions: approval + current flag
ALTER TABLE public.design_submissions
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decision text,
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_design_submissions_wp_current
  ON public.design_submissions(work_package_id) WHERE is_current = true;

-- 2) work_packages: latest submission pointer (nullable, maintained by trigger)
ALTER TABLE public.work_packages
  ADD COLUMN IF NOT EXISTS latest_design_submission_id uuid REFERENCES public.design_submissions(id) ON DELETE SET NULL;

-- 3) studies: indexes for the site/wp linkage columns
CREATE INDEX IF NOT EXISTS idx_studies_site_id ON public.studies(site_id) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_studies_wp_id ON public.studies(wp_id) WHERE wp_id IS NOT NULL;

-- 4) Trigger fn: when a review is inserted, mirror decision onto the submission
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

  -- Normalise decision → submission status
  _sub_status := CASE upper(NEW.decision)
    WHEN 'APPROVED' THEN 'APPROVED'
    WHEN 'REJECTED' THEN 'REJECTED'
    WHEN 'REVISE'   THEN 'REVISE_REQUESTED'
    ELSE 'IN_REVIEW'
  END;

  UPDATE public.design_submissions
     SET status = _sub_status,
         decision = upper(NEW.decision),
         approved_at = CASE WHEN _sub_status = 'APPROVED' THEN COALESCE(approved_at, now()) ELSE approved_at END,
         approved_by = CASE WHEN _sub_status = 'APPROVED' THEN COALESCE(approved_by, NEW.reviewer_id) ELSE approved_by END,
         is_current = true
   WHERE id = NEW.design_submission_id;

  IF _sub_status = 'APPROVED' THEN
    -- Supersede older submissions on the same WP
    UPDATE public.design_submissions
       SET status = 'SUPERSEDED',
           is_current = false
     WHERE work_package_id = _wp
       AND id <> NEW.design_submission_id
       AND status <> 'APPROVED';

    -- Point the WP at the latest approved submission
    UPDATE public.work_packages
       SET latest_design_submission_id = NEW.design_submission_id
     WHERE id = _wp;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_design_review_recorded ON public.design_reviews;
CREATE TRIGGER trg_design_review_recorded
  AFTER INSERT ON public.design_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.on_design_review_recorded();

-- 5) When a NEW submission is inserted for a WP, prior in-flight submissions
--    move to SUPERSEDED (only APPROVED ones stay untouched).
CREATE OR REPLACE FUNCTION public.on_design_submission_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.design_submissions
     SET is_current = false,
         status = CASE WHEN status IN ('DRAFT','IN_REVIEW','REVISE_REQUESTED','REJECTED')
                       THEN 'SUPERSEDED' ELSE status END
   WHERE work_package_id = NEW.work_package_id
     AND id <> NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_design_submission_created ON public.design_submissions;
CREATE TRIGGER trg_design_submission_created
  AFTER INSERT ON public.design_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.on_design_submission_created();