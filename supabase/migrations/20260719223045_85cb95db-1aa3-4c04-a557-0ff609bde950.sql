DROP POLICY IF EXISTS "Site-survey overwrite for open surveys" ON storage.objects;

CREATE POLICY "Site-survey overwrite for open surveys"
  ON storage.objects
  FOR UPDATE
  TO anon, authenticated
  USING (
    bucket_id = 'site-surveys'
    AND public.is_open_site_survey(NULLIF((storage.foldername(name))[1], '')::uuid)
  )
  WITH CHECK (
    bucket_id = 'site-surveys'
    AND public.is_open_site_survey(NULLIF((storage.foldername(name))[1], '')::uuid)
  );