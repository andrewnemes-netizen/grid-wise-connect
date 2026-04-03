INSERT INTO public.layer_registry (
  id, slug, display_name, dno, category, subcategory,
  geometry_type, storage_table, source_type,
  style_json, legend_json, enabled, visible_by_default
) VALUES (
  gen_random_uuid(),
  'ngn-distribution-mains',
  'NGN Distribution Mains & Transmission Pipelines',
  'NGN',
  'gas',
  'mains',
  'MultiLineString',
  'geo_feeders',
  'file_upload',
  '{"line-color": "#FF8C00", "line-width": 2, "line-opacity": 0.8}'::jsonb,
  '[{"label": "Gas Main", "color": "#FF8C00", "type": "line"}]'::jsonb,
  true,
  false
) ON CONFLICT DO NOTHING;