ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS surveyor_email text;

CREATE TABLE public.site_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  sent_to_email text NOT NULL,
  sent_to_name text,
  sent_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','expired','cancelled')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  submitted_at timestamptz,
  response_id uuid,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_site_surveys_site ON public.site_surveys(site_id);
CREATE INDEX idx_site_surveys_org ON public.site_surveys(org_id);
CREATE INDEX idx_site_surveys_token ON public.site_surveys(token);
CREATE INDEX idx_site_surveys_status ON public.site_surveys(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_surveys TO authenticated;
GRANT ALL ON public.site_surveys TO service_role;
ALTER TABLE public.site_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view surveys" ON public.site_surveys FOR SELECT TO authenticated
USING (
  (org_id IS NULL AND sent_by = auth.uid())
  OR EXISTS (SELECT 1 FROM public.org_members WHERE org_id = site_surveys.org_id AND user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Org members can insert surveys" ON public.site_surveys FOR INSERT TO authenticated
WITH CHECK (
  sent_by = auth.uid() AND (
    org_id IS NULL
    OR EXISTS (SELECT 1 FROM public.org_members WHERE org_id = site_surveys.org_id AND user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  )
);
CREATE POLICY "Org members can update surveys" ON public.site_surveys FOR UPDATE TO authenticated
USING (
  sent_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.org_members WHERE org_id = site_surveys.org_id AND user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Org members can delete surveys" ON public.site_surveys FOR DELETE TO authenticated
USING (sent_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.site_survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.site_surveys(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
  submission jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_url text,
  image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  pdf_url text,
  submitter_name text,
  submitter_email text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_survey_responses_site ON public.site_survey_responses(site_id);
CREATE INDEX idx_survey_responses_survey ON public.site_survey_responses(survey_id);
CREATE INDEX idx_survey_responses_org ON public.site_survey_responses(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_survey_responses TO authenticated;
GRANT ALL ON public.site_survey_responses TO service_role;
ALTER TABLE public.site_survey_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view responses" ON public.site_survey_responses FOR SELECT TO authenticated
USING (
  org_id IS NULL
  OR EXISTS (SELECT 1 FROM public.org_members WHERE org_id = site_survey_responses.org_id AND user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Admins can delete responses" ON public.site_survey_responses FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_site_surveys_updated_at
BEFORE UPDATE ON public.site_surveys
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_survey_by_token(_token text)
RETURNS TABLE (
  survey_id uuid, site_id uuid, site_name text, postcode text,
  status text, expires_at timestamptz, sent_to_email text, sent_to_name text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.site_id, si.site_name, si.postcode, s.status, s.expires_at, s.sent_to_email, s.sent_to_name
  FROM public.site_surveys s
  JOIN public.sites si ON si.id = s.site_id
  WHERE s.token = _token AND s.status = 'pending' AND s.expires_at > now()
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_survey_by_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_survey_by_token(
  _token text, _submission jsonb, _signature_url text, _image_urls jsonb,
  _pdf_url text, _submitter_name text, _submitter_email text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_survey public.site_surveys%ROWTYPE; v_response_id uuid;
BEGIN
  SELECT * INTO v_survey FROM public.site_surveys
  WHERE token = _token AND status = 'pending' AND expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid or expired survey token'; END IF;
  INSERT INTO public.site_survey_responses (
    survey_id, site_id, org_id, submission, signature_url, image_urls, pdf_url, submitter_name, submitter_email
  ) VALUES (
    v_survey.id, v_survey.site_id, v_survey.org_id,
    COALESCE(_submission, '{}'::jsonb), _signature_url,
    COALESCE(_image_urls, '[]'::jsonb), _pdf_url, _submitter_name, _submitter_email
  ) RETURNING id INTO v_response_id;
  UPDATE public.site_surveys SET status = 'submitted', submitted_at = now(),
    response_id = v_response_id, updated_at = now() WHERE id = v_survey.id;
  RETURN v_response_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.submit_survey_by_token(text, jsonb, text, jsonb, text, text, text) TO anon, authenticated;
