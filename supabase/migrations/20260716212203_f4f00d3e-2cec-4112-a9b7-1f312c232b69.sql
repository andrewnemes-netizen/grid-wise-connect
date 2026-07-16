
-- Root folder setting on app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS onedrive_root_folder text NOT NULL DEFAULT 'EcoPower UK';

-- Folder path cache
CREATE TABLE public.onedrive_folder_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  work_package_id uuid,
  category text NOT NULL,
  folder_path text NOT NULL,
  onedrive_item_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX onedrive_folder_cache_key
  ON public.onedrive_folder_cache (
    COALESCE(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(work_package_id, '00000000-0000-0000-0000-000000000000'::uuid),
    category
  );

GRANT SELECT ON public.onedrive_folder_cache TO authenticated;
GRANT ALL ON public.onedrive_folder_cache TO service_role;
ALTER TABLE public.onedrive_folder_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read folder cache"
  ON public.onedrive_folder_cache FOR SELECT TO authenticated USING (true);

-- Per-upload audit
CREATE TABLE public.onedrive_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  project_id uuid,
  work_package_id uuid,
  onedrive_item_id text,
  web_url text,
  path text NOT NULL,
  filename text,
  status text NOT NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX onedrive_uploads_created_at_idx ON public.onedrive_uploads (created_at DESC);
CREATE INDEX onedrive_uploads_entity_idx ON public.onedrive_uploads (entity_type, entity_id);

GRANT SELECT ON public.onedrive_uploads TO authenticated;
GRANT ALL ON public.onedrive_uploads TO service_role;
ALTER TABLE public.onedrive_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read onedrive uploads"
  ON public.onedrive_uploads FOR SELECT TO authenticated USING (true);
