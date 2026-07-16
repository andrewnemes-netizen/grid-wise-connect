
CREATE POLICY "Org members can read invoice files" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'invoices' AND EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.user_id = auth.uid() AND om.org_id::text = (storage.foldername(name))[1]
  )
);
CREATE POLICY "Org members can upload invoice files" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'invoices' AND EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.user_id = auth.uid() AND om.org_id::text = (storage.foldername(name))[1]
  )
);
