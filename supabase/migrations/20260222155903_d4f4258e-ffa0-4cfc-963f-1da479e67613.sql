
CREATE OR REPLACE FUNCTION public.lookup_dno_by_location(p_lat float8, p_lng float8)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_layer_id uuid;
  v_dno text;
BEGIN
  -- Find the gb_dno_licence_areas layer
  SELECT id INTO v_layer_id
  FROM layer_registry
  WHERE slug = 'gb_dno_licence_areas'
  LIMIT 1;

  IF v_layer_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Spatial lookup
  SELECT COALESCE(
    attrs_json->>'DNO',
    attrs_json->>'dno',
    attrs_json->>'operator',
    attrs_json->>'name',
    name
  ) INTO v_dno
  FROM geo_polygons
  WHERE layer_id = v_layer_id
    AND ST_Intersects(geom::geometry, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326))
  LIMIT 1;

  RETURN v_dno;
END;
$$;
