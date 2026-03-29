
CREATE TABLE public.osm_ingestion_meta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_slug text NOT NULL,
  source_endpoint text,
  query_hash text NOT NULL,
  query_text text,
  tile_id text,
  bbox jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  row_count integer,
  status text NOT NULL DEFAULT 'success',
  error_detail text,
  fetched_by uuid
);

ALTER TABLE public.osm_ingestion_meta ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_osm_ingestion_meta_slug_hash ON public.osm_ingestion_meta (layer_slug, query_hash);

CREATE POLICY "Admins can manage osm_ingestion_meta"
  ON public.osm_ingestion_meta FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can read osm_ingestion_meta"
  ON public.osm_ingestion_meta FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert osm_ingestion_meta"
  ON public.osm_ingestion_meta FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
