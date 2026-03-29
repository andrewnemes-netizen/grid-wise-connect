CREATE TABLE public.osm_tile_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_slug text NOT NULL,
  tile_id text NOT NULL,
  query_hash text NOT NULL,
  geojson jsonb NOT NULL DEFAULT '{"type":"FeatureCollection","features":[]}'::jsonb,
  feature_count integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour'),
  source_endpoint text
);

-- Unique constraint: one cached result per layer+tile
CREATE UNIQUE INDEX idx_osm_tile_cache_slug_tile ON public.osm_tile_cache (layer_slug, tile_id);

-- Index for expiry cleanup
CREATE INDEX idx_osm_tile_cache_expires ON public.osm_tile_cache (expires_at);

ALTER TABLE public.osm_tile_cache ENABLE ROW LEVEL SECURITY;

-- Service role inserts/updates via edge function; authenticated users can read
CREATE POLICY "Authenticated can read osm_tile_cache"
  ON public.osm_tile_cache FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated can insert osm_tile_cache"
  ON public.osm_tile_cache FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can manage osm_tile_cache"
  ON public.osm_tile_cache FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));