
CREATE OR REPLACE FUNCTION public.find_nearest_hv_asset(
  p_lon double precision,
  p_lat double precision,
  p_search_m double precision DEFAULT 500,
  p_min_voltage_kv double precision DEFAULT 11,
  p_max_voltage_kv double precision DEFAULT 33
)
RETURNS TABLE(
  asset_id text,
  asset_type text,
  name text,
  voltage_kv numeric,
  capacity_value numeric,
  capacity_flag text,
  distance_m double precision,
  snap_distance_m double precision,
  snap_lon double precision,
  snap_lat double precision,
  source_table text,
  attrs_json jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH fp AS (
    SELECT ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326) AS geom
  ),
  -- Search HV/EHV cables in geo_cables (voltage stored as V, e.g. 33000)
  cable_candidates AS (
    SELECT
      COALESCE(c.asset_id, c.id::text) AS asset_id,
      'cable' AS asset_type,
      c.name,
      (c.voltage_kv / 1000.0)::numeric AS voltage_kv,  -- convert V to kV
      c.capacity_value,
      c.capacity_flag,
      ST_Distance(
        ST_Transform(c.geom, 27700),
        ST_Transform(fp.geom, 27700)
      ) AS distance_m,
      ST_Distance(
        ST_Transform(ST_ClosestPoint(c.geom, fp.geom), 27700),
        ST_Transform(fp.geom, 27700)
      ) AS snap_distance_m,
      ST_X(ST_ClosestPoint(c.geom, fp.geom)) AS snap_lon,
      ST_Y(ST_ClosestPoint(c.geom, fp.geom)) AS snap_lat,
      'geo_cables' AS source_table,
      c.attrs_json
    FROM geo_cables c
    CROSS JOIN fp
    WHERE c.voltage_kv IS NOT NULL
      AND (c.voltage_kv / 1000.0) >= p_min_voltage_kv
      AND (c.voltage_kv / 1000.0) <= p_max_voltage_kv
      AND ST_DWithin(
        ST_Transform(c.geom, 27700),
        ST_Transform(fp.geom, 27700),
        p_search_m
      )
  ),
  -- Search substations in geo_substations
  sub_candidates AS (
    SELECT
      COALESCE(s.asset_id, s.id::text) AS asset_id,
      'substation' AS asset_type,
      s.name,
      s.voltage_kv,
      s.capacity_kw AS capacity_value,
      CASE
        WHEN s.utilisation_pct IS NOT NULL AND s.utilisation_pct < 80 THEN 'green'
        WHEN s.utilisation_pct IS NOT NULL AND s.utilisation_pct < 95 THEN 'amber'
        WHEN s.utilisation_pct IS NOT NULL THEN 'red'
        ELSE 'unknown'
      END AS capacity_flag,
      ST_Distance(
        ST_Transform(s.geom, 27700),
        ST_Transform(fp.geom, 27700)
      ) AS distance_m,
      ST_Distance(
        ST_Transform(ST_ClosestPoint(s.geom, fp.geom), 27700),
        ST_Transform(fp.geom, 27700)
      ) AS snap_distance_m,
      ST_X(ST_ClosestPoint(s.geom, fp.geom)) AS snap_lon,
      ST_Y(ST_ClosestPoint(s.geom, fp.geom)) AS snap_lat,
      'geo_substations' AS source_table,
      s.attrs_json
    FROM geo_substations s
    CROSS JOIN fp
    WHERE s.voltage_kv IS NOT NULL
      AND s.voltage_kv >= p_min_voltage_kv
      AND s.voltage_kv <= p_max_voltage_kv
      AND ST_DWithin(
        ST_Transform(s.geom, 27700),
        ST_Transform(fp.geom, 27700),
        p_search_m
      )
  ),
  all_candidates AS (
    SELECT * FROM cable_candidates
    UNION ALL
    SELECT * FROM sub_candidates
  )
  SELECT
    a.asset_id,
    a.asset_type,
    a.name,
    a.voltage_kv,
    a.capacity_value,
    a.capacity_flag,
    a.distance_m,
    a.snap_distance_m,
    a.snap_lon,
    a.snap_lat,
    a.source_table,
    a.attrs_json
  FROM all_candidates a
  WHERE a.snap_distance_m <= p_search_m
  ORDER BY a.snap_distance_m ASC
  LIMIT 5;
$$;
