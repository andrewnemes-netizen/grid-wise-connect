-- Make DNO clip lookup tolerant: match name OR attrs_json fields (case-insensitive)
CREATE OR REPLACE FUNCTION public.get_geo_layer_geojson(
  _layer_id uuid,
  _storage_table text,
  _bbox text DEFAULT NULL,
  _limit integer DEFAULT 5000,
  _dno_clip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
  _bbox_clause text := '';
  _dno_clause text := '';
  _clip_layer_id uuid;
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
        ''geometry'', ST_AsGeoJSON(geom, 6)::jsonb,
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
    _storage_table, _layer_id, _bbox_clause, _dno_clause, _limit
  ) INTO _result;

  RETURN _result;
END;
$$;
