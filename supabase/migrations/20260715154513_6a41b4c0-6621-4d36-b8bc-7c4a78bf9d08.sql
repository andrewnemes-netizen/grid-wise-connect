CREATE POLICY "Public can upload site-survey files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'site-surveys');

CREATE POLICY "Authenticated can read site-survey files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'site-surveys');

CREATE POLICY "Public can read site-survey files"
ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'site-surveys');

CREATE POLICY "Admins can delete site-survey files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'site-surveys' AND public.has_role(auth.uid(), 'admin'));
