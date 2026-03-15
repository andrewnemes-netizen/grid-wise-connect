
-- ── 1. route_nearby_cables: find cables within radius of a route ──
CREATE OR REPLACE FUNCTION public.route_nearby_cables(
  route_wkt text,
  radius_m double precision DEFAULT 200
)
RETURNS TABLE(
  id uuid,
  asset_id text,
  name text,
  voltage_kv numeric,
  capacity_flag text,
  distance_m double precision,
  layer_name text,
  dno text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.asset_id,
    c.name,
    c.voltage_kv,
    c.capacity_flag,
    ST_Distance(
      c.geom::geography,
      ST_GeomFromEWKT(route_wkt)::geography
    ) AS distance_m,
    lr.display_name AS layer_name,
    c.dno
  FROM geo_cables c
  LEFT JOIN layer_registry lr ON lr.id = c.layer_id
  WHERE ST_DWithin(
    c.geom::geography,
    ST_GeomFromEWKT(route_wkt)::geography,
    radius_m
  )
  ORDER BY distance_m
  LIMIT 50;
$$;

-- ── 2. route_surface_classify: classify route segments by highway surface ──
CREATE OR REPLACE FUNCTION public.route_surface_classify(
  route_wkt text,
  buffer_m double precision DEFAULT 25
)
RETURNS TABLE(
  segment_id text,
  surface_type text,
  length_m double precision,
  footway_width_m numeric,
  carriageway_width_m numeric,
  restriction_flag text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    hw.segment_id,
    CASE
      WHEN hw.footway_m IS NOT NULL AND hw.footway_m > 0 AND (hw.carriageway_m IS NULL OR hw.footway_m >= hw.carriageway_m) THEN 'FOOTWAY'
      WHEN hw.carriageway_m IS NOT NULL AND hw.carriageway_m > 0 THEN 'CARRIAGEWAY'
      ELSE 'VERGE'
    END AS surface_type,
    ST_Length(
      ST_Intersection(
        hw.geom::geography,
        ST_Buffer(ST_GeomFromEWKT(route_wkt)::geography, buffer_m)
      )::geography
    ) AS length_m,
    hw.footway_m AS footway_width_m,
    hw.carriageway_m AS carriageway_width_m,
    hw.restriction_flag
  FROM highway_widths hw
  WHERE ST_DWithin(
    hw.geom::geography,
    ST_GeomFromEWKT(route_wkt)::geography,
    buffer_m
  )
  ORDER BY length_m DESC;
$$;

-- ── 3. route_crossing_detect: detect where route crosses cables/feeders ──
CREATE OR REPLACE FUNCTION public.route_crossing_detect(
  route_wkt text
)
RETURNS TABLE(
  crossing_type text,
  asset_name text,
  voltage_kv numeric,
  dno text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Cables crossing the route
  SELECT
    'CABLE'::text AS crossing_type,
    c.name AS asset_name,
    c.voltage_kv,
    c.dno
  FROM geo_cables c
  WHERE c.geom IS NOT NULL
    AND ST_Intersects(c.geom, ST_GeomFromEWKT(route_wkt))
  
  UNION ALL
  
  -- Feeders crossing the route
  SELECT
    'FEEDER'::text AS crossing_type,
    f.asset_id AS asset_name,
    f.voltage_kv,
    f.dno
  FROM geo_feeders f
  WHERE f.geom IS NOT NULL
    AND ST_Intersects(f.geom, ST_GeomFromEWKT(route_wkt))
  
  LIMIT 50;
$$;
