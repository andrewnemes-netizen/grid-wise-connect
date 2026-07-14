
CREATE POLICY "project_files_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'project-files' AND EXISTS (
    SELECT 1 FROM public.project_files f
    WHERE f.storage_path = storage.objects.name
      AND public.can_access_project(f.project_id, auth.uid())
  ));
CREATE POLICY "project_files_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-files' AND owner = auth.uid());
CREATE POLICY "project_files_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'project-files' AND owner = auth.uid());
