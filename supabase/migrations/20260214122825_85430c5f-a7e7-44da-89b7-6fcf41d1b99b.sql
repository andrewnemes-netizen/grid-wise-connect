
-- Function to extract GeoJSON features from any spatial table
-- Returns array of GeoJSON Feature objects with geometry transformed to EPSG:4326
CREATE OR REPLACE FUNCTION public.get_layer_geojson(
  _table_name TEXT,
  _bbox_filter TEXT DEFAULT '',
  _limit INT DEFAULT 5000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  query TEXT;
BEGIN
  -- Validate table name against allowed tables to prevent SQL injection
  IF _table_name NOT IN (
    'feeders_ehv', 'feeders_hv_33kv', 'feeders_hv_66kv',
    'primary_substations_33kv', 'primary_substations_66kv',
    'cables_hv_ug_capacity', 'cables_ehv_ug_capacity',
    'ndp_projects', 'highway_widths', 'wayleaves'
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  query := format(
    'SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        ''type'', ''Feature'',
        ''geometry'', ST_AsGeoJSON(ST_Transform(geom, 4326))::jsonb,
        ''properties'', to_jsonb(t.*) - ''geom'' - ''attrs_json''
      )
    ), ''[]''::jsonb)
    FROM (
      SELECT * FROM %I
      WHERE geom IS NOT NULL %s
      LIMIT %s
    ) t',
    _table_name,
    _bbox_filter,
    _limit
  );

  EXECUTE query INTO result;
  RETURN result;
END;
$$;
