INSERT INTO public.layer_registry (
  slug, display_name, dno, category, subcategory,
  geometry_type, storage_table,
  style_json, legend_json,
  min_zoom, max_zoom,
  visible_by_default, enabled,
  source_type, attribution
) VALUES (
  'leeds-street-lighting-unmetered',
  'Leeds Street Lighting (Unmetered)',
  'Local Authority',
  'Street Lighting',
  'Unmetered Supply',
  'Point',
  'geo_points',
  '{"type":"circle","paint":{"circle-radius":2.5,"circle-color":"#f59e0b","circle-opacity":0.85,"circle-stroke-width":0.5,"circle-stroke-color":"#78350f"}}'::jsonb,
  '{"label":"Street light (unmetered)","color":"#f59e0b"}'::jsonb,
  12,
  22,
  false,
  true,
  'manual_upload',
  'Leeds City Council, April 2026'
)
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  dno = EXCLUDED.dno,
  category = EXCLUDED.category,
  subcategory = EXCLUDED.subcategory,
  geometry_type = EXCLUDED.geometry_type,
  storage_table = EXCLUDED.storage_table,
  style_json = EXCLUDED.style_json,
  legend_json = EXCLUDED.legend_json,
  min_zoom = EXCLUDED.min_zoom,
  visible_by_default = EXCLUDED.visible_by_default,
  enabled = EXCLUDED.enabled,
  source_type = EXCLUDED.source_type,
  attribution = EXCLUDED.attribution,
  updated_at = now();