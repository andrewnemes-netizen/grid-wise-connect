
-- Add lifecycle columns
ALTER TABLE public.site_surveys
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid,
  ADD COLUMN IF NOT EXISTS resent_from_id uuid REFERENCES public.site_surveys(id) ON DELETE SET NULL;

-- Widen status check
ALTER TABLE public.site_surveys DROP CONSTRAINT IF EXISTS site_surveys_status_check;
ALTER TABLE public.site_surveys
  ADD CONSTRAINT site_surveys_status_check
  CHECK (status = ANY (ARRAY['pending','opened','submitted','expired','cancelled','revoked']));

-- Public RPC: mark opened when survey page loads (token-scoped, no auth)
CREATE OR REPLACE FUNCTION public.mark_survey_opened(_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.site_surveys
     SET opened_at = COALESCE(opened_at, now()),
         status = CASE WHEN status = 'pending' THEN 'opened' ELSE status END,
         updated_at = now()
   WHERE token = _token
     AND status IN ('pending','opened')
     AND expires_at > now();
END;
$$;
REVOKE ALL ON FUNCTION public.mark_survey_opened(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_survey_opened(text) TO anon, authenticated;

-- Revoke a survey (org member / sender / admin)
CREATE OR REPLACE FUNCTION public.revoke_survey(_survey_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _org uuid; _sender uuid; _status text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT org_id, sent_by, status INTO _org, _sender, _status
    FROM public.site_surveys WHERE id = _survey_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Survey not found'; END IF;
  IF _status IN ('submitted','revoked','cancelled') THEN
    RAISE EXCEPTION 'Cannot revoke survey with status %', _status;
  END IF;
  IF NOT (
    _sender = _uid
    OR public.has_role(_uid, 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.org_members WHERE org_id = _org AND user_id = _uid)
  ) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  UPDATE public.site_surveys
     SET status = 'revoked', revoked_at = now(), revoked_by = _uid,
         message = COALESCE(NULLIF(_reason,''), message),
         updated_at = now()
   WHERE id = _survey_id;
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_survey(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_survey(uuid, text) TO authenticated;

-- Extend expiry
CREATE OR REPLACE FUNCTION public.extend_survey_expiry(_survey_id uuid, _days int)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _org uuid; _sender uuid; _status text; _new timestamptz;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF _days IS NULL OR _days < 1 OR _days > 180 THEN
    RAISE EXCEPTION 'days must be between 1 and 180';
  END IF;
  SELECT org_id, sent_by, status INTO _org, _sender, _status
    FROM public.site_surveys WHERE id = _survey_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Survey not found'; END IF;
  IF _status NOT IN ('pending','opened','expired') THEN
    RAISE EXCEPTION 'Cannot extend survey with status %', _status;
  END IF;
  IF NOT (
    _sender = _uid
    OR public.has_role(_uid, 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.org_members WHERE org_id = _org AND user_id = _uid)
  ) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  UPDATE public.site_surveys
     SET expires_at = GREATEST(expires_at, now()) + (_days || ' days')::interval,
         status = CASE WHEN status = 'expired' THEN 'pending' ELSE status END,
         updated_at = now()
   WHERE id = _survey_id
   RETURNING expires_at INTO _new;
  RETURN _new;
END;
$$;
REVOKE ALL ON FUNCTION public.extend_survey_expiry(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extend_survey_expiry(uuid, int) TO authenticated;
