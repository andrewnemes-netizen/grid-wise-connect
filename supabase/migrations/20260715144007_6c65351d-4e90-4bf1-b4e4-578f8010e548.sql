CREATE POLICY "Authenticated can upload quotations"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'quotations');

CREATE POLICY "Authenticated can read quotations"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'quotations');

CREATE POLICY "Authenticated can update own quotations"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'quotations' AND owner = auth.uid());