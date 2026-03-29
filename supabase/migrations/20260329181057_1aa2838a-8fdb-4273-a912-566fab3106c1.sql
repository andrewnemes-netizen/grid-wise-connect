INSERT INTO public.layer_registry (slug, display_name, dno, category, geometry_type, storage_table, source_type, min_zoom, max_zoom, enabled, visible_by_default, attribution)
VALUES
  ('osm_crossings', 'Pedestrian Crossings', 'OSM', 'OSM', 'Point', 'none', 'overpass', 14, 18, true, false, '© OpenStreetMap contributors'),
  ('osm_traffic_signals', 'Traffic Signals', 'OSM', 'OSM', 'Point', 'none', 'overpass', 14, 18, true, false, '© OpenStreetMap contributors')
ON CONFLICT DO NOTHING;