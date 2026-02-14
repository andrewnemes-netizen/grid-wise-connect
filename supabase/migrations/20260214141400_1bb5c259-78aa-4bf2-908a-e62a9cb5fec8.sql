
-- Replace the old get_layer_geojson function with a dynamic version
-- that queries from the new geo_* tables using layer_registry metadata
CREATE OR REPLACE FUNCTION public.get_layer_geojson(
  _table_name text,
  _bbox_filter text DEFAULT '',
  _limit integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
BEGIN
  -- Validate table name against allowed tables (both legacy and new)
  IF _table_name NOT IN (
    'geo_substations','geo_feeders','geo_cables','geo_constraints','geo_points','geo_polygons',
    'site_utilisation','primary_substations_33kv','primary_substations_66kv',
    'feeders_ehv','feeders_hv_33kv','feeders_hv_66kv',
    'cables_hv_ug_capacity','cables_ehv_ug_capacity',
    'ndp_projects','highway_widths','wayleaves'
  ) THEN
    RAISE EXCEPTION 'Invalid table: %', _table_name;
  END IF;

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        ''type'', ''Feature'',
        ''geometry'', ST_AsGeoJSON(geom)::jsonb,
        ''properties'', to_jsonb(t.*) - ''geom''
      )
    ), ''[]''::jsonb)
    FROM (SELECT * FROM %I WHERE geom IS NOT NULL %s LIMIT %s) t',
    _table_name, _bbox_filter, _limit
  ) INTO _result;

  RETURN _result;
END;
$$;

-- New function: query geo features by layer_id with bbox filtering (all in 4326)
CREATE OR REPLACE FUNCTION public.get_geo_layer_geojson(
  _layer_id uuid,
  _storage_table text,
  _bbox text DEFAULT NULL,
  _limit integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
  _bbox_clause text := '';
BEGIN
  IF _storage_table NOT IN ('geo_substations','geo_feeders','geo_cables','geo_constraints','geo_points','geo_polygons') THEN
    RAISE EXCEPTION 'Invalid table: %', _storage_table;
  END IF;

  IF _bbox IS NOT NULL AND _bbox != '' THEN
    _bbox_clause := format(
      'AND ST_Intersects(geom, ST_MakeEnvelope(%s, 4326))',
      _bbox
    );
  END IF;

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        ''type'', ''Feature'',
        ''geometry'', ST_AsGeoJSON(geom, 6)::jsonb,
        ''properties'', to_jsonb(t.*) - ''geom''
      )
    ), ''[]''::jsonb)
    FROM (
      SELECT * FROM %I
      WHERE layer_id = %L
        AND geom IS NOT NULL
        %s
      LIMIT %s
    ) t',
    _storage_table, _layer_id, _bbox_clause, _limit
  ) INTO _result;

  RETURN _result;
END;
$$;
