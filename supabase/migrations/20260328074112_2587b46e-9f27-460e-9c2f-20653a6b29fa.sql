-- Layer registry entries for NaPTAN and STATS19
INSERT INTO public.layer_registry (slug, display_name, dno, category, subcategory, geometry_type, storage_table, min_zoom, max_zoom, attribution, enabled, visible_by_default, style_json, legend_json)
VALUES
  ('naptan_transport_nodes', 'Transport Nodes (NaPTAN)', 'National', 'Transport', 'Accessibility', 'Point', 'geo_points', 10, 18, 'Department for Transport NaPTAN', true, false, '{}', '[]'),
  ('stats19_accidents', 'Road Accidents (STATS19)', 'National', 'Transport', 'Safety', 'Point', 'geo_points', 10, 18, 'Department for Transport STATS19', true, false, '{}', '[]')
ON CONFLICT (slug) DO NOTHING;

-- RPC to find nearby geo_points by layer slug for the safety engine
CREATE OR REPLACE FUNCTION public.nearby_geo_points_by_slug(
  p_slug TEXT,
  p_lng DOUBLE PRECISION,
  p_lat DOUBLE PRECISION,
  p_radius_m DOUBLE PRECISION DEFAULT 500,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  asset_id TEXT,
  attrs_json JSONB,
  distance_m DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    gp.id,
    gp.name,
    gp.asset_id,
    gp.attrs_json,
    ST_Distance(gp.geom::geography, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography) AS distance_m
  FROM public.geo_points gp
  JOIN public.layer_registry lr ON lr.id = gp.layer_id
  WHERE lr.slug = p_slug
    AND ST_DWithin(gp.geom::geography, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  ORDER BY distance_m
  LIMIT p_limit;
$$;