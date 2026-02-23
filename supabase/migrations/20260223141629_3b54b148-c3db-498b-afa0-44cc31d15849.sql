
-- Drop existing overly permissive storage policies for training-images
DROP POLICY IF EXISTS "Authenticated users can upload training images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update training images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete training images" ON storage.objects;

-- Recreate with admin-only access (the edge function uses service role key so it bypasses RLS)
CREATE POLICY "Admins can upload training images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'training-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update training images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'training-images' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete training images"
ON storage.objects FOR DELETE
USING (bucket_id = 'training-images' AND public.has_role(auth.uid(), 'admin'));
