
CREATE POLICY "Read WP handover files" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'wp-handover-docs' AND EXISTS (
      SELECT 1 FROM public.site_handover_docs h
      WHERE h.storage_path = storage.objects.name
        AND public.can_access_wp(auth.uid(), h.work_package_id)
    )
  );
CREATE POLICY "Upload WP handover files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'wp-handover-docs' AND owner = auth.uid()
  );
CREATE POLICY "Delete own handover files" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'wp-handover-docs' AND owner = auth.uid()
  );
