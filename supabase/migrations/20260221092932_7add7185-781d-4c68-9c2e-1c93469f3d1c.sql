-- Create training-images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('training-images', 'training-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Training images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'training-images');

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload training images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'training-images' AND auth.role() = 'authenticated');

-- Allow authenticated users to update training images
CREATE POLICY "Authenticated users can update training images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'training-images' AND auth.role() = 'authenticated');

-- Allow authenticated users to delete training images
CREATE POLICY "Authenticated users can delete training images"
ON storage.objects FOR DELETE
USING (bucket_id = 'training-images' AND auth.role() = 'authenticated');