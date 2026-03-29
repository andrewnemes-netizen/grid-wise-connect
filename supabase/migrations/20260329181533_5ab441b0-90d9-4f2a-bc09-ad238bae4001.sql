-- Allow service-role upserts: authenticated users need UPDATE for upsert
CREATE POLICY "Authenticated can update osm_tile_cache"
  ON public.osm_tile_cache FOR UPDATE
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Convert the unique index to a proper unique constraint for upsert onConflict
ALTER TABLE public.osm_tile_cache ADD CONSTRAINT uq_osm_tile_cache_slug_tile UNIQUE USING INDEX idx_osm_tile_cache_slug_tile;