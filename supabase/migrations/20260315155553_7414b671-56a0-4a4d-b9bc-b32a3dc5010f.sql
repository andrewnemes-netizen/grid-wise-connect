
-- Table to store discovered datasets from DNO Opendatasoft portals
CREATE TABLE public.dno_dataset_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dno text NOT NULL DEFAULT 'NPG',
  dataset_id text NOT NULL,
  title text,
  description text,
  portal_url text,
  updated_at_source timestamp with time zone,
  is_geospatial boolean NOT NULL DEFAULT false,
  geometry_field text,
  geometry_type text,
  fields_json jsonb DEFAULT '[]'::jsonb,
  record_count integer DEFAULT 0,
  endpoint_records text,
  endpoint_metadata text,
  endpoint_export_csv text,
  endpoint_export_json text,
  endpoint_export_geojson text,
  endpoint_export_parquet text,
  attachment_urls jsonb DEFAULT '[]'::jsonb,
  export_formats jsonb DEFAULT '[]'::jsonb,
  primary_key_guess text,
  refresh_strategy text NOT NULL DEFAULT 'full',
  schedule text DEFAULT 'manual',
  active boolean NOT NULL DEFAULT false,
  linked_layer_id uuid REFERENCES public.layer_registry(id) ON DELETE SET NULL,
  storage_table text,
  last_sync_at timestamp with time zone,
  last_sync_status text DEFAULT 'never',
  last_sync_rows integer DEFAULT 0,
  last_sync_error text,
  schema_hash text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(dno, dataset_id)
);

ALTER TABLE public.dno_dataset_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dno_dataset_registry"
  ON public.dno_dataset_registry FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can read dno_dataset_registry"
  ON public.dno_dataset_registry FOR SELECT
  TO authenticated
  USING (true);
