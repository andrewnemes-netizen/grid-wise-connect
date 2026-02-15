
-- Drop the existing 5-arg overload and recreate with geometry simplification
DROP FUNCTION IF EXISTS public.get_geo_layer_geojson(uuid, text, text, integer, text);

CREATE OR REPLACE FUNCTION public.get_geo_layer_geojson(
  _layer_id uuid,
  _storage_table text,
  _bbox text DEFAULT NULL,
  _limit integer DEFAULT 20000,
  _dno_clip text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '30s'
AS $$
DECLARE
  _result jsonb;
  _bbox_clause text := '';
  _dno_clause text := '';
  _clip_layer_id uuid;
  _simplify_tolerance float := 0;
  _geom_expr text;
  _bbox_parts text[];
  _bbox_width float;
  _bbox_height float;
BEGIN
  IF _storage_table NOT IN ('geo_substations','geo_feeders','geo_cables','geo_constraints','geo_points','geo_polygons') THEN
    RAISE EXCEPTION 'Invalid table: %', _storage_table;
  END IF;

  -- Calculate bbox dimensions for adaptive simplification
  IF _bbox IS NOT NULL AND _bbox != '' THEN
    _bbox_parts := string_to_array(_bbox, ',');
    IF array_length(_bbox_parts, 1) = 4 THEN
      _bbox_width := _bbox_parts[3]::float - _bbox_parts[1]::float;
      _bbox_height := _bbox_parts[4]::float - _bbox_parts[2]::float;
      
      -- Simplify geometry based on viewport size
      IF _bbox_width > 3 OR _bbox_height > 3 THEN
        _simplify_tolerance := 0.002;
      ELSIF _bbox_width > 1 OR _bbox_height > 1 THEN
        _simplify_tolerance := 0.0005;
      END IF;
    END IF;

    _bbox_clause := format(
      'AND ST_Intersects(geom, ST_MakeEnvelope(%s, 4326))',
      _bbox
    );
  END IF;

  -- Build geometry expression with optional simplification
  IF _simplify_tolerance > 0 THEN
    _geom_expr := format('ST_Simplify(geom, %s, true)', _simplify_tolerance);
  ELSE
    _geom_expr := 'geom';
  END IF;

  IF _dno_clip IS NOT NULL AND _dno_clip != '' THEN
    SELECT lr.id INTO _clip_layer_id
    FROM layer_registry lr
    WHERE lr.slug = 'gb_dno_licence_areas'
    LIMIT 1;

    IF _clip_layer_id IS NOT NULL THEN
      _dno_clause := format(
        'AND ST_Intersects(geom, (SELECT ST_Union(gp.geom) FROM geo_polygons gp WHERE gp.layer_id = %L AND (UPPER(gp.name) = UPPER(%L) OR UPPER(gp.attrs_json->>''dno'') = UPPER(%L) OR UPPER(gp.attrs_json->>''operator'') = UPPER(%L) OR UPPER(gp.attrs_json->>''company'') = UPPER(%L))))',
        _clip_layer_id, _dno_clip, _dno_clip, _dno_clip, _dno_clip
      );
    END IF;
  END IF;

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        ''type'', ''Feature'',
        ''geometry'', ST_AsGeoJSON(%s, 6)::jsonb,
        ''properties'', to_jsonb(t.*) - ''geom''
      )
    ), ''[]''::jsonb)
    FROM (
      SELECT * FROM %I
      WHERE layer_id = %L
        AND geom IS NOT NULL
        %s
        %s
      LIMIT %s
    ) t',
    _geom_expr, _storage_table, _layer_id, _bbox_clause, _dno_clause, _limit
  ) INTO _result;

  RETURN _result;
END;
$$;
