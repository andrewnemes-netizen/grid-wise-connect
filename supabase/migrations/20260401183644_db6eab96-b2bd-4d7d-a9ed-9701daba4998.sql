CREATE OR REPLACE FUNCTION public.find_nearest_compatible_lv_main(
  p_lon double precision,
  p_lat double precision,
  p_search_m double precision DEFAULT 100
)
RETURNS TABLE(
  cable_id uuid,
  asset_id text,
  conducting_section_type text,
  feeder_name text,
  source_site_name text,
  distance_m double precision,
  snap_distance_m double precision,
  score double precision,
  snap_lon double precision,
  snap_lat double precision,
  direct_kva numeric,
  ducted_kva numeric,
  green_compatible boolean,
  ev_compatible boolean,
  parsed_family text,
  parsed_size_value numeric,
  parsed_size_unit text,
  parsed_material text,
  parsed_construction text,
  is_unknown boolean,
  is_service_like boolean,
  is_main_like boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH fp AS (
  SELECT ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326) AS geom
),
nearby AS (
  SELECT
    c.id AS cable_id,
    c.asset_id,
    COALESCE(c.attrs_json->>'conducting_section_type', c.attrs_json->>'CONDUCTING_SECTION_TYPE', '') AS cst,
    COALESCE(c.attrs_json->>'feeder_name', c.attrs_json->>'FEEDER_NAME', '') AS feeder_name,
    COALESCE(c.attrs_json->>'source_site_name', c.attrs_json->>'SOURCE_SITE_NAME', '') AS source_site_name,
    c.geom AS cable_geom,
    ST_Distance(
      ST_Transform(c.geom, 27700),
      ST_Transform(fp.geom, 27700)
    ) AS distance_m,
    ST_ClosestPoint(c.geom, fp.geom) AS snap_pt,
    ST_Distance(
      ST_Transform(ST_ClosestPoint(c.geom, fp.geom), 27700),
      ST_Transform(fp.geom, 27700)
    ) AS snap_distance_m
  FROM geo_cables c
  CROSS JOIN fp
  WHERE ST_DWithin(
    ST_Transform(c.geom, 27700),
    ST_Transform(fp.geom, 27700),
    p_search_m
  )
  AND UPPER(COALESCE(c.attrs_json->>'conducting_section_type', c.attrs_json->>'CONDUCTING_SECTION_TYPE', '')) LIKE 'LV%'
),
parsed AS (
  SELECT
    n.*,
    CASE
      WHEN UPPER(n.cst) ~ '(\d+\.?\d*)\s*SQ\.?\s*IN' THEN
        (regexp_match(UPPER(n.cst), '(\d+\.?\d*)\s*SQ\.?\s*IN'))[1]::numeric
      WHEN UPPER(n.cst) ~ '(\d+\.?\d*)\s*SQ\.?\s*MM' THEN
        (regexp_match(UPPER(n.cst), '(\d+\.?\d*)\s*SQ\.?\s*MM'))[1]::numeric
      ELSE NULL
    END AS size_val,
    CASE
      WHEN UPPER(n.cst) ~ 'SQ\.?\s*IN' THEN 'sq_in'
      WHEN UPPER(n.cst) ~ 'SQ\.?\s*MM' THEN 'sq_mm'
      ELSE NULL
    END AS size_u,
    CASE
      WHEN UPPER(n.cst) LIKE '%COPPER%' THEN 'copper'
      WHEN UPPER(n.cst) LIKE '%ALUMINIUM%' THEN 'aluminium'
      WHEN UPPER(n.cst) LIKE '%WAVEFORM%' THEN 'aluminium'
      ELSE 'unknown'
    END AS mat,
    CASE
      WHEN UPPER(n.cst) LIKE '%PILC%' THEN 'pilc'
      WHEN UPPER(n.cst) LIKE '%WAVEFORM%' THEN 'waveform'
      WHEN UPPER(n.cst) LIKE '%CONSAC%' THEN 'consac'
      WHEN UPPER(n.cst) LIKE '%CNE%' OR UPPER(n.cst) LIKE '%CONCENTRIC%' THEN 'cne'
      ELSE 'unknown'
    END AS constr,
    UPPER(n.cst) LIKE '%UNKNOWN%' AS _is_unknown,
    (UPPER(n.cst) LIKE '%SINGLE PHASE%' OR UPPER(n.cst) LIKE '%SERVICE%' OR UPPER(n.cst) LIKE '%CNE%' OR UPPER(n.cst) LIKE '%CONCENTRIC%'
     OR (UPPER(n.cst) ~ '(\d+\.?\d*)\s*SQ\.?\s*MM' AND (regexp_match(UPPER(n.cst), '(\d+\.?\d*)\s*SQ\.?\s*MM'))[1]::numeric <= 35)
    ) AS _is_service_like,
    (NOT (UPPER(n.cst) LIKE '%UNKNOWN%')
     AND NOT (UPPER(n.cst) LIKE '%SINGLE PHASE%' OR UPPER(n.cst) LIKE '%SERVICE%' OR UPPER(n.cst) LIKE '%CNE%' OR UPPER(n.cst) LIKE '%CONCENTRIC%')
     AND (UPPER(n.cst) LIKE '%WAVEFORM%' OR UPPER(n.cst) LIKE '%PILC%' OR UPPER(n.cst) LIKE '%CONSAC%')
    ) AS _is_main_like
  FROM nearby n
  WHERE n.snap_distance_m <= CASE
    WHEN p_search_m <= 25 THEN 15
    WHEN p_search_m <= 50 THEN 30
    ELSE 50
  END
),
family_mapped AS (
  SELECT
    p.*,
    CASE
      WHEN p.constr = 'pilc' AND p.mat = 'copper' THEN 'copper_pilc'
      WHEN p.constr = 'pilc' AND p.mat = 'aluminium' THEN 'aluminium_pilc'
      WHEN p.constr = 'waveform' THEN 'waveform'
      WHEN p.constr = 'consac' THEN 'consac'
      WHEN p.constr = 'cne' THEN 'hybrid'
      ELSE 'unknown'
    END AS fam
  FROM parsed p
),
scored AS (
  SELECT
    f.cable_id,
    f.asset_id,
    f.cst AS conducting_section_type,
    f.feeder_name,
    f.source_site_name,
    f.distance_m,
    f.snap_distance_m,
    f.snap_pt,
    f.size_val AS parsed_size_value,
    f.size_u AS parsed_size_unit,
    f.mat AS parsed_material,
    f.constr AS parsed_construction,
    f.fam AS parsed_family,
    f._is_unknown AS is_unknown,
    f._is_service_like AS is_service_like,
    f._is_main_like AS is_main_like,
    l.direct_kva,
    l.ducted_kva,
    l.green_compatible,
    l.ev_compatible_55kva_80a AS ev_compatible,
    (
      CASE WHEN COALESCE(l.ev_compatible_55kva_80a, false) THEN 1000 ELSE 0 END +
      CASE WHEN f._is_main_like THEN 250 ELSE 0 END +
      CASE WHEN COALESCE(l.ducted_kva, 0) >= 190 THEN 150
           WHEN COALESCE(l.ducted_kva, 0) >= 130 THEN 75
           ELSE 0 END -
      CASE WHEN f._is_service_like THEN 500 ELSE 0 END -
      CASE WHEN f._is_unknown THEN 1000 ELSE 0 END -
      (f.snap_distance_m * 5)
    ) AS calc_score
  FROM family_mapped f
  LEFT JOIN lv_capacity_lookup l
    ON l.family = f.fam
    AND l.size_value = f.size_val
    AND l.size_unit = f.size_u
)
SELECT
  s.cable_id,
  s.asset_id,
  s.conducting_section_type,
  s.feeder_name,
  s.source_site_name,
  s.distance_m,
  s.snap_distance_m,
  s.calc_score AS score,
  ST_X(s.snap_pt) AS snap_lon,
  ST_Y(s.snap_pt) AS snap_lat,
  COALESCE(s.direct_kva, 0) AS direct_kva,
  COALESCE(s.ducted_kva, 0) AS ducted_kva,
  COALESCE(s.green_compatible, false) AS green_compatible,
  COALESCE(s.ev_compatible, false) AS ev_compatible,
  s.parsed_family,
  s.parsed_size_value,
  s.parsed_size_unit,
  s.parsed_material,
  s.parsed_construction,
  s.is_unknown,
  s.is_service_like,
  s.is_main_like
FROM scored s
WHERE COALESCE(s.ev_compatible, false) = true
ORDER BY s.calc_score DESC
LIMIT 1;
$$;