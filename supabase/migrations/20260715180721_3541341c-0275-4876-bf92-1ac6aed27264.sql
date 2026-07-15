
CREATE POLICY "imports_owner_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'imports' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "imports_owner_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'imports' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_gridwise_staff(auth.uid())));

CREATE POLICY "imports_owner_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'imports' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_gridwise_staff(auth.uid())));
