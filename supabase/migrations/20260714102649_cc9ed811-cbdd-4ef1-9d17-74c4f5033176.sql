UPDATE public.layer_registry
SET category = 'Annotations'
WHERE source_type = 'drive_shapefile'
  AND (slug LIKE '%-annotation-%' OR slug LIKE '%-sc-anno-%');