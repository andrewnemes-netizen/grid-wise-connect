
-- Create gas_dataset_registry with same schema as dno_dataset_registry
CREATE TABLE public.gas_dataset_registry (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dataset_id text NOT NULL,
  title text,
  description text,
  portal_url text,
  updated_at_source timestamptz,
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
  storage_table text,
  schema_hash text,
  active boolean NOT NULL DEFAULT false,
  linked_layer_id uuid REFERENCES public.layer_registry(id),
  last_sync_at timestamptz,
  last_sync_status text DEFAULT 'never'::text,
  last_sync_rows integer DEFAULT 0,
  last_sync_error text,
  refresh_strategy text NOT NULL DEFAULT 'full'::text,
  schedule text DEFAULT 'manual'::text,
  dno text NOT NULL DEFAULT 'CADENT'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dno, dataset_id)
);

-- Move Cadent rows from dno_dataset_registry to gas_dataset_registry
INSERT INTO public.gas_dataset_registry (
  id, dataset_id, title, description, portal_url, updated_at_source,
  is_geospatial, geometry_field, geometry_type, fields_json, record_count,
  endpoint_records, endpoint_metadata, endpoint_export_csv, endpoint_export_json,
  endpoint_export_geojson, endpoint_export_parquet, attachment_urls, export_formats,
  primary_key_guess, storage_table, schema_hash, active, linked_layer_id,
  last_sync_at, last_sync_status, last_sync_rows, last_sync_error,
  refresh_strategy, schedule, dno, created_at, updated_at
)
SELECT
  id, dataset_id, title, description, portal_url, updated_at_source,
  is_geospatial, geometry_field, geometry_type, fields_json, record_count,
  endpoint_records, endpoint_metadata, endpoint_export_csv, endpoint_export_json,
  endpoint_export_geojson, endpoint_export_parquet, attachment_urls, export_formats,
  primary_key_guess, storage_table, schema_hash, active, linked_layer_id,
  last_sync_at, last_sync_status, last_sync_rows, last_sync_error,
  refresh_strategy, schedule, dno, created_at, updated_at
FROM public.dno_dataset_registry
WHERE dno = 'CADENT';

DELETE FROM public.dno_dataset_registry WHERE dno = 'CADENT';

-- RLS
ALTER TABLE public.gas_dataset_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage gas_dataset_registry"
  ON public.gas_dataset_registry FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can read gas_dataset_registry"
  ON public.gas_dataset_registry FOR SELECT TO authenticated
  USING (true);
