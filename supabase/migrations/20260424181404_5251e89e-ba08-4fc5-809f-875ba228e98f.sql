-- Route-aware nearest compatible LV main lookup.
-- Accepts a GeoJSON LineString for the drawn cable route and returns the nearest
-- compatible LV main measured from ANY point on that route (not just the destination pin).
-- This eliminates double-counting when the drawn route already runs alongside the existing main.

CREATE OR REPLACE FUNCTION public.find_nearest_compatible_lv_main_route(
  p_route_geojson jsonb,
  p_search_m double precision DEFAULT 100
)
RETURNS TABLE(
  cable_id uuid, asset_id text, conducting_section_type text, feeder_name text,
  source_site_name text, distance_m double precision, score double precision,
  snap_lon double precision, snap_lat double precision,
  route_snap_lon double precision, route_snap_lat double precision,
  direct_kva numeric, ducted_kva numeric,
  green_compatible boolean, ev_compatible boolean, parsed_family text,
  parsed_size_value numeric, parsed_size_unit text, parsed_material text,
  parsed_construction text, is_unknown boolean, is_service_like boolean, is_main_like boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
WITH route AS (
  SELECT
    ST_SetSRID(ST_GeomFromGeoJSON(p_route_geojson::text), 4326) AS geom_4326,
    -- Convert metres to degree buffer for index-friendly bbox prefilter (~111km per degree of latitude).
    (p_search_m / 111000.0) * 1.5 AS deg_buf
),
route_metric AS (
  SELECT geom_4326, ST_Transform(geom_4326, 27700) AS geom_27700, deg_buf FROM route
),
nearby AS (
  -- Bbox-first prefilter so the GIST index on geo_cables.geom does the heavy lifting.
  SELECT
    c.id AS cable_id, c.asset_id,
    COALESCE(c.attrs_json->>'conducting_section_type', c.attrs_json->>'CONDUCTING_SECTION_TYPE', '') AS cst,
    COALESCE(c.attrs_json->>'feeder_name', c.attrs_json->>'FEEDER_NAME', '') AS feeder_name,
    COALESCE(c.attrs_json->>'source_site_name', c.attrs_json->>'SOURCE_SITE_NAME', '') AS source_site_name,
    c.geom AS cable_geom_4326,
    ST_Transform(c.geom, 27700) AS cable_geom_27700,
    r.geom_4326 AS route_geom_4326,
    r.geom_27700 AS route_geom_27700
  FROM geo_cables c CROSS JOIN route_metric r
  WHERE c.geom && ST_Expand(r.geom_4326, r.deg_buf)
    AND ST_DWithin(c.geom, r.geom_4326, r.deg_buf)
    AND UPPER(COALESCE(c.attrs_json->>'conducting_section_type', c.attrs_json->>'CONDUCTING_SECTION_TYPE', '')) LIKE 'LV%'
),
metric AS (
  SELECT n.*,
    ST_Distance(n.cable_geom_27700, n.route_geom_27700) AS distance_m,
    -- Closest point on the cable to the route, expressed in 4326 for the UI map.
    ST_ClosestPoint(n.cable_geom_4326, n.route_geom_4326) AS snap_pt_cable,
    -- Closest point on the route to the cable — the spot where we'd actually break in.
    ST_ClosestPoint(n.route_geom_4326, n.cable_geom_4326) AS snap_pt_route
  FROM nearby n
),
filtered AS (
  SELECT * FROM metric WHERE distance_m <= p_search_m
),
parsed AS (
  SELECT n.*,
    CASE
      WHEN UPPER(n.cst) ~ '(\d+\.?\d*)\s*SQ\.?\s*IN' THEN (regexp_match(UPPER(n.cst), '(\d+\.?\d*)\s*SQ\.?\s*IN'))[1]::numeric
      WHEN UPPER(n.cst) ~ '(\d+\.?\d*)\s*SQ\.?\s*MM' THEN (regexp_match(UPPER(n.cst), '(\d+\.?\d*)\s*SQ\.?\s*MM'))[1]::numeric
      ELSE NULL END AS size_val,
    CASE WHEN UPPER(n.cst) ~ 'SQ\.?\s*IN' THEN 'sq_in' WHEN UPPER(n.cst) ~ 'SQ\.?\s*MM' THEN 'sq_mm' ELSE NULL END AS size_u,
    CASE WHEN UPPER(n.cst) LIKE '%COPPER%' THEN 'copper'
         WHEN UPPER(n.cst) LIKE '%ALUMINIUM%' OR UPPER(n.cst) LIKE '%WAVEFORM%' THEN 'aluminium'
         ELSE 'unknown' END AS mat,
    CASE WHEN UPPER(n.cst) LIKE '%PILC%' THEN 'pilc'
         WHEN UPPER(n.cst) LIKE '%WAVEFORM%' THEN 'waveform'
         WHEN UPPER(n.cst) LIKE '%CONSAC%' THEN 'consac'
         WHEN UPPER(n.cst) LIKE '%CNE%' OR UPPER(n.cst) LIKE '%CONCENTRIC%' THEN 'cne'
         ELSE 'unknown' END AS constr,
    UPPER(n.cst) LIKE '%UNKNOWN%' AS _is_unknown,
    (UPPER(n.cst) LIKE '%SINGLE PHASE%' OR UPPER(n.cst) LIKE '%SERVICE%' OR UPPER(n.cst) LIKE '%CNE%' OR UPPER(n.cst) LIKE '%CONCENTRIC%'
     OR (UPPER(n.cst) ~ '(\d+\.?\d*)\s*SQ\.?\s*MM' AND (regexp_match(UPPER(n.cst), '(\d+\.?\d*)\s*SQ\.?\s*MM'))[1]::numeric <= 35)) AS _is_service_like,
    (NOT (UPPER(n.cst) LIKE '%UNKNOWN%')
     AND NOT (UPPER(n.cst) LIKE '%SINGLE PHASE%' OR UPPER(n.cst) LIKE '%SERVICE%' OR UPPER(n.cst) LIKE '%CNE%' OR UPPER(n.cst) LIKE '%CONCENTRIC%')
     AND (UPPER(n.cst) LIKE '%WAVEFORM%' OR UPPER(n.cst) LIKE '%PILC%' OR UPPER(n.cst) LIKE '%CONSAC%')) AS _is_main_like
  FROM filtered n
),
family_mapped AS (
  SELECT p.*,
    CASE WHEN p.constr = 'pilc' AND p.mat = 'copper' THEN 'copper_pilc'
         WHEN p.constr = 'pilc' AND p.mat = 'aluminium' THEN 'aluminium_pilc'
         WHEN p.constr = 'waveform' THEN 'waveform'
         WHEN p.constr = 'consac' THEN 'consac'
         WHEN p.constr = 'cne' THEN 'hybrid'
         ELSE 'unknown' END AS fam
  FROM parsed p
),
scored AS (
  SELECT f.cable_id, f.asset_id, f.cst AS conducting_section_type, f.feeder_name, f.source_site_name,
    f.distance_m, f.snap_pt_cable, f.snap_pt_route,
    f.size_val AS parsed_size_value, f.size_u AS parsed_size_unit,
    f.mat AS parsed_material, f.constr AS parsed_construction, f.fam AS parsed_family,
    f._is_unknown AS is_unknown, f._is_service_like AS is_service_like, f._is_main_like AS is_main_like,
    l.direct_kva, l.ducted_kva, l.green_compatible, l.ev_compatible_55kva_80a AS ev_compatible,
    (CASE WHEN COALESCE(l.ev_compatible_55kva_80a, false) THEN 1000 ELSE 0 END
     + CASE WHEN f._is_main_like THEN 250 ELSE 0 END
     + CASE WHEN COALESCE(l.ducted_kva, 0) >= 190 THEN 150 WHEN COALESCE(l.ducted_kva, 0) >= 130 THEN 75 ELSE 0 END
     - CASE WHEN f._is_service_like THEN 500 ELSE 0 END
     - CASE WHEN f._is_unknown THEN 1000 ELSE 0 END
     - (f.distance_m * 5)) AS calc_score
  FROM family_mapped f
  LEFT JOIN lv_capacity_lookup l ON l.family = f.fam AND l.size_value = f.size_val AND l.size_unit = f.size_u
)
SELECT s.cable_id, s.asset_id, s.conducting_section_type, s.feeder_name, s.source_site_name,
  s.distance_m, s.calc_score AS score,
  ST_X(s.snap_pt_cable) AS snap_lon, ST_Y(s.snap_pt_cable) AS snap_lat,
  ST_X(s.snap_pt_route) AS route_snap_lon, ST_Y(s.snap_pt_route) AS route_snap_lat,
  COALESCE(s.direct_kva, 0), COALESCE(s.ducted_kva, 0),
  COALESCE(s.green_compatible, false), COALESCE(s.ev_compatible, false),
  s.parsed_family, s.parsed_size_value, s.parsed_size_unit, s.parsed_material, s.parsed_construction,
  s.is_unknown, s.is_service_like, s.is_main_like
FROM scored s
WHERE COALESCE(s.ev_compatible, false) = true
ORDER BY s.calc_score DESC LIMIT 1;
$$;