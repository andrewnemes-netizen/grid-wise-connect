INSERT INTO public.layer_registry (
  id, slug, display_name, dno, category, subcategory,
  storage_table, geometry_type, source_type, attribution,
  min_zoom, max_zoom, visible_by_default, enabled,
  style_json, legend_json, bbox
) VALUES (
  'b7c3f2e8-1a5d-4c9b-a2e7-cc4a1e9f3d21',
  'cambridgeshire-street-lighting',
  'Cambridgeshire Street Lighting',
  'Local Authority',
  'Street Lighting',
  'County Council Assets',
  'geo_points',
  'Point',
  'manual_upload',
  'Cambridgeshire County Council, Open Data',
  12, 22, false, true,
  '{"type":"circle","paint":{"circle-color":"#f59e0b","circle-opacity":0.85,"circle-radius":2.5,"circle-stroke-color":"#78350f","circle-stroke-width":0.5}}'::jsonb,
  '{"label":"Street light (Cambridgeshire)","color":"#f59e0b"}'::jsonb,
  '{"minLng":-0.46,"minLat":52.02,"maxLng":0.50,"maxLat":52.74}'::jsonb
) ON CONFLICT (id) DO NOTHING;