
-- Create a function to batch insert geo features with GeoJSON geometry
CREATE OR REPLACE FUNCTION public.batch_insert_geo_features(
  _table_name text,
  _features_json text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _feature jsonb;
  _features jsonb;
  _count integer := 0;
  _geom_geojson text;
  _name text;
  _asset_id text;
  _dno text;
  _layer_id uuid;
  _attrs_json jsonb;
  _source_date date;
  _status text;
  -- substation fields
  _capacity_kw numeric;
  _demand_kw numeric;
  _headroom_kw numeric;
  _utilisation_pct numeric;
  _voltage_kv numeric;
  -- feeder fields
  _feeder_ref text;
  -- cable fields
  _capacity_value numeric;
  _capacity_unit text;
  _capacity_flag text;
  -- constraint fields
  _constraint_type text;
BEGIN
  -- Validate table name
  IF _table_name NOT IN ('geo_substations','geo_feeders','geo_cables','geo_constraints','geo_points','geo_polygons') THEN
    RAISE EXCEPTION 'Invalid table: %', _table_name;
  END IF;

  _features := _features_json::jsonb;

  FOR _feature IN SELECT jsonb_array_elements(_features)
  LOOP
    _geom_geojson := _feature->>'geom_geojson';
    _name := _feature->>'name';
    _asset_id := _feature->>'asset_id';
    _dno := _feature->>'dno';
    _layer_id := (_feature->>'layer_id')::uuid;
    _attrs_json := COALESCE(_feature->'attrs_json', '{}'::jsonb);
    _status := COALESCE(_feature->>'status', 'unknown');

    IF _table_name = 'geo_substations' THEN
      _capacity_kw := (_feature->>'capacity_kw')::numeric;
      _demand_kw := (_feature->>'demand_kw')::numeric;
      _headroom_kw := (_feature->>'headroom_kw')::numeric;
      _utilisation_pct := (_feature->>'utilisation_pct')::numeric;
      _voltage_kv := (_feature->>'voltage_kv')::numeric;

      INSERT INTO geo_substations (layer_id, dno, asset_id, name, attrs_json, geom, status, capacity_kw, demand_kw, headroom_kw, utilisation_pct, voltage_kv)
      VALUES (_layer_id, _dno, _asset_id, _name, _attrs_json,
              ST_SetSRID(ST_GeomFromGeoJSON(_geom_geojson), 4326),
              _status, _capacity_kw, _demand_kw, _headroom_kw, _utilisation_pct, _voltage_kv);

    ELSIF _table_name = 'geo_feeders' THEN
      _voltage_kv := (_feature->>'voltage_kv')::numeric;
      _feeder_ref := _feature->>'feeder_ref';

      INSERT INTO geo_feeders (layer_id, dno, asset_id, name, attrs_json, geom, status, voltage_kv, feeder_ref)
      VALUES (_layer_id, _dno, _asset_id, _name, _attrs_json,
              ST_SetSRID(ST_GeomFromGeoJSON(_geom_geojson), 4326),
              _status, _voltage_kv, _feeder_ref);

    ELSIF _table_name = 'geo_cables' THEN
      _voltage_kv := (_feature->>'voltage_kv')::numeric;
      _capacity_value := (_feature->>'capacity_value')::numeric;
      _capacity_unit := _feature->>'capacity_unit';
      _capacity_flag := COALESCE(_feature->>'capacity_flag', 'unknown');

      INSERT INTO geo_cables (layer_id, dno, asset_id, name, attrs_json, geom, status, voltage_kv, capacity_value, capacity_unit, capacity_flag)
      VALUES (_layer_id, _dno, _asset_id, _name, _attrs_json,
              ST_SetSRID(ST_GeomFromGeoJSON(_geom_geojson), 4326),
              _status, _voltage_kv, _capacity_value, _capacity_unit, _capacity_flag);

    ELSIF _table_name = 'geo_constraints' THEN
      _constraint_type := _feature->>'constraint_type';

      INSERT INTO geo_constraints (layer_id, dno, asset_id, name, attrs_json, geom, status, constraint_type)
      VALUES (_layer_id, _dno, _asset_id, _name, _attrs_json,
              ST_SetSRID(ST_GeomFromGeoJSON(_geom_geojson), 4326),
              _status, _constraint_type);

    ELSIF _table_name = 'geo_points' THEN
      INSERT INTO geo_points (layer_id, dno, asset_id, name, attrs_json, geom)
      VALUES (_layer_id, _dno, _asset_id, _name, _attrs_json,
              ST_SetSRID(ST_GeomFromGeoJSON(_geom_geojson), 4326));

    ELSIF _table_name = 'geo_polygons' THEN
      INSERT INTO geo_polygons (layer_id, dno, asset_id, name, attrs_json, geom)
      VALUES (_layer_id, _dno, _asset_id, _name, _attrs_json,
              ST_SetSRID(ST_GeomFromGeoJSON(_geom_geojson), 4326));
    END IF;

    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;
