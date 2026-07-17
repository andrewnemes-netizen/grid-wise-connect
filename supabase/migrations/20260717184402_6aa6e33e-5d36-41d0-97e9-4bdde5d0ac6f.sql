
ALTER TABLE public.site_photos
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS site_survey_response_id UUID;

CREATE INDEX IF NOT EXISTS idx_site_photos_survey_response
  ON public.site_photos(site_survey_response_id);
