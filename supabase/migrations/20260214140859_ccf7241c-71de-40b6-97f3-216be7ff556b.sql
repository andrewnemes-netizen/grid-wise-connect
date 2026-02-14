
-- ============================================================
-- Register NPG layers in the layer_registry
-- ============================================================
INSERT INTO public.layer_registry (slug, display_name, dno, category, subcategory, geometry_type, storage_table, style_json, legend_json, min_zoom, feature_count, visible_by_default)
VALUES (
  'npg_hv_substations_utilisation',
  'HV Substations (Utilisation)',
  'NPG', 'substations', 'hv', 'Point', 'geo_substations',
  '{"circle-radius": 5, "circle-color": ["match", ["get", "utilisation_band"], "Low", "#22c55e", "Medium", "#f59e0b", "High", "#ef4444", "#94a3b8"], "circle-stroke-width": 1, "circle-stroke-color": "#ffffff"}'::jsonb,
  '[{"label": "Low utilisation", "color": "#22c55e"}, {"label": "Medium utilisation", "color": "#f59e0b"}, {"label": "High utilisation", "color": "#ef4444"}]'::jsonb,
  8, 27402, false
);

INSERT INTO public.layer_registry (slug, display_name, dno, category, subcategory, geometry_type, storage_table, style_json, min_zoom) VALUES
  ('npg_primary_substations_33kv', 'Primary Substations (33kV)', 'NPG', 'substations', '33kv', 'Point', 'geo_substations', '{"circle-radius": 7, "circle-color": "#ef4444", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff"}'::jsonb, 6),
  ('npg_primary_substations_66kv', 'Primary Substations (66kV)', 'NPG', 'substations', '66kv', 'Point', 'geo_substations', '{"circle-radius": 7, "circle-color": "#dc2626", "circle-stroke-width": 2, "circle-stroke-color": "#ffffff"}'::jsonb, 6),
  ('npg_feeders_hv_33kv', 'HV Feeders (33kV)', 'NPG', 'feeders', '33kv', 'MultiLineString', 'geo_feeders', '{"line-color": "#3b82f6", "line-width": 2}'::jsonb, 10),
  ('npg_feeders_hv_66kv', 'HV Feeders (66kV)', 'NPG', 'feeders', '66kv', 'MultiLineString', 'geo_feeders', '{"line-color": "#2563eb", "line-width": 2.5}'::jsonb, 10),
  ('npg_feeders_ehv', 'EHV Feeders', 'NPG', 'feeders', 'ehv', 'MultiLineString', 'geo_feeders', '{"line-color": "#7c3aed", "line-width": 2}'::jsonb, 8),
  ('npg_cables_hv', 'HV Underground Cables', 'NPG', 'cables', 'hv', 'MultiLineString', 'geo_cables', '{"line-color": "#f97316", "line-width": 2}'::jsonb, 12),
  ('npg_cables_ehv', 'EHV Underground Cables', 'NPG', 'cables', 'ehv', 'MultiLineString', 'geo_cables', '{"line-color": "#ea580c", "line-width": 2.5}'::jsonb, 10),
  ('npg_wayleaves', 'Wayleaves', 'NPG', 'constraints', 'wayleave', 'Geometry', 'geo_constraints', '{"fill-color": "#fbbf24", "fill-opacity": 0.3, "line-color": "#f59e0b"}'::jsonb, 12),
  ('npg_ndp_projects', 'NDP Projects', 'NPG', 'constraints', 'ndp', 'Geometry', 'geo_constraints', '{"fill-color": "#a855f7", "fill-opacity": 0.3, "line-color": "#9333ea"}'::jsonb, 10),
  ('npg_highway_widths', 'Highway Widths', 'NPG', 'constraints', 'highway', 'Geometry', 'geo_constraints', '{"line-color": "#64748b", "line-width": 3, "line-opacity": 0.6}'::jsonb, 14);

-- ============================================================
-- Migrate site_utilisation → geo_substations (transform SRID 27700 → 4326)
-- ============================================================
INSERT INTO public.geo_substations (layer_id, dno, asset_id, name, voltage_kv, capacity_kw, demand_kw, headroom_kw, utilisation_pct, attrs_json, geom, source_date)
SELECT
  (SELECT id FROM public.layer_registry WHERE slug = 'npg_hv_substations_utilisation'),
  'NPG',
  su.site_id,
  su.site_name,
  NULL,
  su.firm_capacity_kw,
  su.max_demand_kw,
  su.transformer_headroom_kw,
  su.utilisation_pct,
  jsonb_build_object(
    'substation_class', su.substation_class,
    'substation_type', su.substation_type,
    'three_phase', su.three_phase,
    'headroom_band', su.headroom_band,
    'utilisation_band', su.utilisation_band,
    'site_band', su.site_band,
    'upstream_site', su.upstream_site,
    'transformer_id', su.transformer_id,
    'connected_customers', su.connected_customers,
    'licence_area', su.licence_area,
    'local_authority', su.local_authority,
    'ward_name', su.ward_name,
    'lsoa_name', su.lsoa_name,
    'msoa_name', su.msoa_name,
    'loadings_data_source', su.loadings_data_source
  ),
  ST_Transform(su.geom, 4326)::geometry(Point, 4326),
  NULL
FROM public.site_utilisation su
WHERE su.geom IS NOT NULL;

-- Update feature count + bbox
UPDATE public.layer_registry
SET feature_count = (SELECT count(*) FROM public.geo_substations WHERE layer_id = layer_registry.id)
WHERE slug = 'npg_hv_substations_utilisation';

UPDATE public.layer_registry
SET bbox = (
  SELECT jsonb_build_array(
    ST_XMin(ext), ST_YMin(ext), ST_XMax(ext), ST_YMax(ext)
  )
  FROM (
    SELECT ST_Extent(geom) as ext FROM public.geo_substations
    WHERE layer_id = (SELECT id FROM public.layer_registry WHERE slug = 'npg_hv_substations_utilisation')
  ) sub
)
WHERE slug = 'npg_hv_substations_utilisation';
