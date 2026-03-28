
-- Add unique constraint on geo_points(layer_id, asset_id) for upsert support
-- First remove any duplicates keeping the latest
DELETE FROM public.geo_points a
USING public.geo_points b
WHERE a.layer_id = b.layer_id
  AND a.asset_id = b.asset_id
  AND a.created_at < b.created_at;

-- Now add the unique constraint
ALTER TABLE public.geo_points
  ADD CONSTRAINT geo_points_layer_id_asset_id_key UNIQUE (layer_id, asset_id);
