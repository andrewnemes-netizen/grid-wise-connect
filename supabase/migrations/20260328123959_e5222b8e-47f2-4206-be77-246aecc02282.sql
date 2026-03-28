
CREATE OR REPLACE FUNCTION get_geo_layer_geojson(
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
SET statement_timeout = '120s'
AS $$
DECLARE
  _result jsonb;
  _bbox_geom geometry;
  _bbox_width float;
  _simplify_tolerance float;
  _data_srid integer;
  _geom_expr text;
BEGIN
  -- Parse bbox (always in 4326)
  IF _bbox IS NOT NULL AND _bbox != '' THEN
    DECLARE
      _parts text[];
    BEGIN
      _parts := string_to_array(_bbox, ',');
      _bbox_geom := ST_MakeEnvelope(
        _parts[1]::float, _parts[2]::float,
        _parts[3]::float, _parts[4]::float,
        4326
      );
      _bbox_width := _parts[3]::float - _parts[1]::float;
    END;
  END IF;

  -- Dynamic simplification based on viewport width
  IF _bbox_width IS NOT NULL AND _bbox_width > 6 THEN
    _simplify_tolerance := 0.005;
  ELSIF _bbox_width IS NOT NULL AND _bbox_width > 3 THEN
    _simplify_tolerance := 0.002;
  ELSIF _bbox_width IS NOT NULL AND _bbox_width > 1 THEN
    _simplify_tolerance := 0.0005;
  ELSIF _bbox_width IS NOT NULL AND _bbox_width > 0.1 THEN
    _simplify_tolerance := 0.00005;
  ELSIF _bbox_width IS NOT NULL THEN
    _simplify_tolerance := 0.00002;
  ELSE
    _simplify_tolerance := 0.0;
  END IF;

  IF _storage_table = 'geo_substations' THEN
    SELECT ST_SRID(geom) INTO _data_srid FROM geo_substations WHERE layer_id = _layer_id AND geom IS NOT NULL LIMIT 1;
    _data_srid := COALESCE(_data_srid, 4326);

    SELECT coalesce(json_agg(f)::jsonb, '[]'::jsonb) INTO _result
    FROM (
      SELECT json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(
          CASE WHEN _simplify_tolerance > 0
            THEN ST_Simplify(CASE WHEN _data_srid != 4326 THEN ST_Transform(geom, 4326) ELSE geom END, _simplify_tolerance)
            ELSE CASE WHEN _data_srid != 4326 THEN ST_Transform(geom, 4326) ELSE geom END
          END, 6
        )::json,
        'properties', json_build_object(
          'id', id, 'name', name, 'asset_id', asset_id,
          'voltage_kv', voltage_kv, 'capacity_kw', capacity_kw,
          'demand_kw', demand_kw, 'headroom_kw', headroom_kw,
          'utilisation_pct', utilisation_pct, 'status', status,
          'dno', dno, 'source_date', source_date
        )::jsonb || COALESCE(attrs_json, '{}'::jsonb)
      ) AS f
      FROM geo_substations
      WHERE layer_id = _layer_id
        AND geom IS NOT NULL
        AND (_bbox_geom IS NULL OR ST_Intersects(geom, CASE WHEN _data_srid != 4326 THEN ST_Transform(_bbox_geom, _data_srid) ELSE _bbox_geom END))
        AND (_dno_clip IS NULL OR dno = _dno_clip)
      LIMIT _limit
    ) sub;

  ELSIF _storage_table = 'site_utilisation' THEN
    SELECT ST_SRID(geom) INTO _data_srid FROM site_utilisation WHERE geom IS NOT NULL LIMIT 1;
    _data_srid := COALESCE(_data_srid, 4326);

    SELECT coalesce(json_agg(f)::jsonb, '[]'::jsonb) INTO _result
    FROM (
      SELECT json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(
          CASE WHEN _simplify_tolerance > 0
            THEN ST_Simplify(CASE WHEN _data_srid != 4326 THEN ST_Transform(geom, 4326) ELSE geom END, _simplify_tolerance)
            ELSE CASE WHEN _data_srid != 4326 THEN ST_Transform(geom, 4326) ELSE geom END
          END, 6
        )::json,
        'properties', json_build_object(
          'id', id, 'name', site_name, 'asset_id', site_id,
          'capacity_kw', firm_capacity_kw,
          'demand_kw', max_demand_kw,
          'headroom_kw', transformer_headroom_kw,
          'utilisation_pct', utilisation_pct,
          'utilisation_band', utilisation_band,
          'headroom_band', headroom_band,
          'substation_type', substation_type,
          'substation_class', substation_class,
          'connected_customers', connected_customers,
          'licence_area', licence_area,
          'dno', COALESCE(licence_area, 'NPG')
        )::jsonb || COALESCE(attrs_json, '{}'::jsonb)
      ) AS f
      FROM site_utilisation
      WHERE geom IS NOT NULL
        AND (_bbox_geom IS NULL OR ST_Intersects(geom, CASE WHEN _data_srid != 4326 THEN ST_Transform(_bbox_geom, _data_srid) ELSE _bbox_geom END))
      LIMIT _limit
    ) sub;

  ELSIF _storage_table = 'geo_cables' THEN
    SELECT ST_SRID(geom) INTO _data_srid FROM geo_cables WHERE layer_id = _layer_id AND geom IS NOT NULL LIMIT 1;
    _data_srid := COALESCE(_data_srid, 4326);

    SELECT coalesce(json_agg(f)::jsonb, '[]'::jsonb) INTO _result
    FROM (
      SELECT json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(
          CASE WHEN _simplify_tolerance > 0
            THEN ST_Simplify(CASE WHEN _data_srid != 4326 THEN ST_Transform(geom, 4326) ELSE geom END, _simplify_tolerance)
            ELSE CASE WHEN _data_srid != 4326 THEN ST_Transform(geom, 4326) ELSE geom END
          END, 6
        )::json,
        'properties', json_build_object(
          'id', id, 'name', name, 'asset_id', asset_id,
          'voltage_kv', voltage_kv, 'capacity_value', capacity_value,
          'capacity_flag', capacity_flag, 'capacity_unit', capacity_unit,
          'status', status, 'dno', dno, 'source_date', source_date
        )::jsonb || COALESCE(attrs_json, '{}'::jsonb)
      ) AS f
      FROM geo_cables
      WHERE layer_id = _layer_id
        AND geom IS NOT NULL
        AND (_bbox_geom IS NULL OR ST_Intersects(geom, CASE WHEN _data_srid != 4326 THEN ST_Transform(_bbox_geom, _data_srid) ELSE _bbox_geom END))
        AND (_dno_clip IS NULL OR dno = _dno_clip)
      LIMIT _limit
    ) sub;

  ELSIF _storage_table = 'geo_feeders' THEN
    SELECT ST_SRID(geom) INTO _data_srid FROM geo_feeders WHERE layer_id = _layer_id AND geom IS NOT NULL LIMIT 1;
    _data_srid := COALESCE(_data_srid, 4326);

    SELECT coalesce(json_agg(f)::jsonb, '[]'::jsonb) INTO _result
    FROM (
      SELECT json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(
          CASE WHEN _simplify_tolerance > 0
            THEN ST_Simplify(CASE WHEN _data_srid != 4326 THEN ST_Transform(geom, 4326) ELSE geom END, _simplify_tolerance)
            ELSE CASE WHEN _data_srid != 4326 THEN ST_Transform(geom, 4326) ELSE geom END
          END, 6
        )::json,
        'properties', json_build_object(
          'id', id, 'name', name, 'asset_id', asset_id,
          'voltage_kv', voltage_kv, 'feeder_ref', feeder_ref,
          'status', status, 'dno', dno, 'source_date', source_date
        )::jsonb || COALESCE(attrs_json, '{}'::jsonb)
      ) AS f
      FROM geo_feeders
      WHERE layer_id = _layer_id
        AND geom IS NOT NULL
        AND (_bbox_geom IS NULL OR ST_Intersects(geom, CASE WHEN _data_srid != 4326 THEN ST_Transform(_bbox_geom, _data_srid) ELSE _bbox_geom END))
        AND (_dno_clip IS NULL OR dno = _dno_clip)
      LIMIT _limit
    ) sub;

  ELSIF _storage_table = 'geo_points' THEN
    SELECT ST_SRID(geom) INTO _data_srid FROM geo_points WHERE layer_id = _layer_id AND geom IS NOT NULL LIMIT 1;
    _data_srid := COALESCE(_data_srid, 4326);

    SELECT coalesce(json_agg(f)::jsonb, '[]'::jsonb) INTO _result
    FROM (
      SELECT json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(
          CASE WHEN _data_srid != 4326 THEN ST_Transform(geom, 4326) ELSE geom END, 6
        )::json,
        'properties', json_build_object(
          'id', id, 'name', name, 'asset_id', asset_id,
          'dno', dno, 'source_date', source_date
        )::jsonb || COALESCE(attrs_json, '{}'::jsonb)
      ) AS f
      FROM geo_points
      WHERE layer_id = _layer_id
        AND geom IS NOT NULL
        AND (_bbox_geom IS NULL OR ST_Intersects(geom, CASE WHEN _data_srid != 4326 THEN ST_Transform(_bbox_geom, _data_srid) ELSE _bbox_geom END))
        AND (_dno_clip IS NULL OR dno = _dno_clip)
      LIMIT _limit
    ) sub;

  ELSIF _storage_table = 'geo_polygons' THEN
    SELECT ST_SRID(geom) INTO _data_srid FROM geo_polygons WHERE layer_id = _layer_id AND geom IS NOT NULL LIMIT 1;
    _data_srid := COALESCE(_data_srid, 4326);

    SELECT coalesce(json_agg(f)::jsonb, '[]'::jsonb) INTO _result
    FROM (
      SELECT json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(
          CASE WHEN _simplify_tolerance > 0
            THEN ST_Simplify(CASE WHEN _data_srid != 4326 THEN ST_Transform(geom, 4326) ELSE geom END, _simplify_tolerance)
            ELSE CASE WHEN _data_srid != 4326 THEN ST_Transform(geom, 4326) ELSE geom END
          END, 6
        )::json,
        'properties', json_build_object(
          'id', id, 'name', name, 'asset_id', asset_id,
          'dno', dno, 'source_date', source_date
        )::jsonb || COALESCE(attrs_json, '{}'::jsonb)
      ) AS f
      FROM geo_polygons
      WHERE layer_id = _layer_id
        AND geom IS NOT NULL
        AND (_bbox_geom IS NULL OR ST_Intersects(geom, CASE WHEN _data_srid != 4326 THEN ST_Transform(_bbox_geom, _data_srid) ELSE _bbox_geom END))
        AND (_dno_clip IS NULL OR dno = _dno_clip)
      LIMIT _limit
    ) sub;

  ELSIF _storage_table = 'geo_constraints' THEN
    SELECT ST_SRID(geom) INTO _data_srid FROM geo_constraints WHERE layer_id = _layer_id AND geom IS NOT NULL LIMIT 1;
    _data_srid := COALESCE(_data_srid, 4326);

    SELECT coalesce(json_agg(f)::jsonb, '[]'::jsonb) INTO _result
    FROM (
      SELECT json_build_object(
        'type', 'Feature',
        'geometry', ST_AsGeoJSON(
          CASE WHEN _simplify_tolerance > 0
            THEN ST_Simplify(CASE WHEN _data_srid != 4326 THEN ST_Transform(geom, 4326) ELSE geom END, _simplify_tolerance)
            ELSE CASE WHEN _data_srid != 4326 THEN ST_Transform(geom, 4326) ELSE geom END
          END, 6
        )::json,
        'properties', json_build_object(
          'id', id, 'name', name, 'asset_id', asset_id,
          'constraint_type', constraint_type, 'status', status,
          'dno', dno, 'source_date', source_date
        )::jsonb || COALESCE(attrs_json, '{}'::jsonb)
      ) AS f
      FROM geo_constraints
      WHERE layer_id = _layer_id
        AND geom IS NOT NULL
        AND (_bbox_geom IS NULL OR ST_Intersects(geom, CASE WHEN _data_srid != 4326 THEN ST_Transform(_bbox_geom, _data_srid) ELSE _bbox_geom END))
        AND (_dno_clip IS NULL OR dno = _dno_clip)
      LIMIT _limit
    ) sub;

  ELSE
    _result := '[]'::jsonb;
  END IF;

  RETURN _result;
END;
$$;
