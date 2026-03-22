
-- Add unique constraint on geo_points for upsert support (layer_id + asset_id)
CREATE UNIQUE INDEX IF NOT EXISTS geo_points_layer_asset_unique ON public.geo_points (layer_id, asset_id) WHERE asset_id IS NOT NULL;

-- Insert layer_registry entry for DfT Traffic Count Points
INSERT INTO public.layer_registry (
  slug, display_name, dno, category, subcategory,
  storage_table, geometry_type, style_json, legend_json,
  min_zoom, max_zoom, enabled, visible_by_default, attribution
) VALUES (
  'dft_traffic_count_points',
  'DfT Traffic Count Points',
  'National',
  'Transport',
  'Road Traffic',
  'geo_points',
  'Point',
  '{"color": "#E67E22", "circle_radius_field": "all_motor_vehicles", "circle_color_field": "all_motor_vehicles"}'::jsonb,
  '[{"label": "Low (<5k AADF)", "color": "#27AE60"}, {"label": "Medium (5k-20k)", "color": "#F39C12"}, {"label": "High (20k-50k)", "color": "#E74C3C"}, {"label": "Very High (>50k)", "color": "#8E44AD"}]'::jsonb,
  8,
  18,
  true,
  false,
  'Department for Transport'
) ON CONFLICT (slug) DO NOTHING;
