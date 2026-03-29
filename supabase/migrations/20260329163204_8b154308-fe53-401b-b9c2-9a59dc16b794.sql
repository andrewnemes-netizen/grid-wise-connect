
-- Add source_type column to layer_registry
ALTER TABLE public.layer_registry ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'database';

-- Insert OSM Major Roads layer
INSERT INTO public.layer_registry (slug, display_name, dno, category, storage_table, geometry_type, style_json, legend_json, enabled, visible_by_default, min_zoom, max_zoom, source_type, feature_count)
VALUES ('osm_major_roads', 'Major Roads (OSM)', 'OSM', 'Roads', 'live', 'LineString', '{"line-color":"#E74C3C","line-width":3}', '{"items":[{"label":"Motorway / Trunk / Primary","color":"#E74C3C"}]}', true, false, 8, 18, 'overpass', 0);

-- Insert OSM Minor Roads layer
INSERT INTO public.layer_registry (slug, display_name, dno, category, storage_table, geometry_type, style_json, legend_json, enabled, visible_by_default, min_zoom, max_zoom, source_type, feature_count)
VALUES ('osm_minor_roads', 'Minor Roads (OSM)', 'OSM', 'Roads', 'live', 'LineString', '{"line-color":"#3498DB","line-width":2}', '{"items":[{"label":"Secondary / Tertiary / Residential","color":"#3498DB"}]}', true, false, 10, 18, 'overpass', 0);

-- Insert OSM Footways layer
INSERT INTO public.layer_registry (slug, display_name, dno, category, storage_table, geometry_type, style_json, legend_json, enabled, visible_by_default, min_zoom, max_zoom, source_type, feature_count)
VALUES ('osm_footways', 'Footways & Cycleways (OSM)', 'OSM', 'Roads', 'live', 'LineString', '{"line-color":"#2ECC71","line-width":1.5}', '{"items":[{"label":"Footway / Path / Cycleway","color":"#2ECC71"}]}', true, false, 12, 18, 'overpass', 0);
