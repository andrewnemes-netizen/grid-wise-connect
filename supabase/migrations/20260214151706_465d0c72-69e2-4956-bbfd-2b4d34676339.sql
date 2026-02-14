
CREATE OR REPLACE FUNCTION public.score_site(_site_geom geometry, _proposed_kw numeric DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  dist_primary NUMERIC;
  dist_feeder NUMERIC;
  dist_capacity NUMERIC;
  cap_flag TEXT;
  ndp_intersect BOOLEAN;
  ndp_within_1000 BOOLEAN;
  wayleave_hit BOOLEAN;
  min_footway NUMERIC;
  min_carriageway NUMERIC;
  score TEXT;
  reasons JSONB := '[]'::jsonb;
  steps JSONB := '[]'::jsonb;
  site_buf geometry;
  corridor_buf geometry;
  site_4326 geometry;
  nearest_primary_pt geometry;
  nearest_feeder_pt geometry;
  nearest_cable_pt geometry;
  nearest_primary_pt_4326 geometry;
  nearest_feeder_pt_4326 geometry;
  nearest_cable_pt_4326 geometry;
  tmp_dist NUMERIC;
  tmp_geom geometry;
BEGIN
  -- _site_geom is in BNG (27700)
  site_buf := ST_Buffer(_site_geom, 50);
  corridor_buf := ST_Buffer(_site_geom, 100);
  site_4326 := ST_Transform(_site_geom, 4326);

  -- ========================================
  -- Nearest substation from geo_substations (SRID 4326)
  -- Use ST_Distance on geography for metre accuracy
  -- ========================================
  SELECT ST_Distance(site_4326::geography, gs.geom::geography), gs.geom
    INTO dist_primary, nearest_primary_pt_4326
    FROM geo_substations gs
    ORDER BY site_4326::geography <-> gs.geom::geography
    LIMIT 1;
  dist_primary := COALESCE(dist_primary, 999999);

  -- Also check site_utilisation (SRID 27700) for closer substations
  SELECT ST_Distance(_site_geom, su.geom), ST_Transform(su.geom, 4326)
    INTO tmp_dist, tmp_geom
    FROM site_utilisation su
    WHERE su.geom IS NOT NULL
    ORDER BY _site_geom <-> su.geom
    LIMIT 1;
  IF tmp_dist IS NOT NULL AND tmp_dist < dist_primary THEN
    dist_primary := tmp_dist;
    nearest_primary_pt_4326 := tmp_geom;
  END IF;

  -- ========================================
  -- Nearest feeder from geo_feeders (SRID 4326)
  -- ========================================
  SELECT ST_Distance(site_4326::geography, gf.geom::geography), gf.geom
    INTO dist_feeder, nearest_feeder_pt_4326
    FROM geo_feeders gf
    ORDER BY site_4326::geography <-> gf.geom::geography
    LIMIT 1;
  dist_feeder := COALESCE(dist_feeder, 999999);

  -- ========================================
  -- Nearest cable from geo_cables (SRID 4326)
  -- ========================================
  SELECT ST_Distance(site_4326::geography, gc.geom::geography), gc.geom
    INTO dist_capacity, nearest_cable_pt_4326
    FROM geo_cables gc
    ORDER BY site_4326::geography <-> gc.geom::geography
    LIMIT 1;
  dist_capacity := COALESCE(dist_capacity, 999999);

  -- Capacity flag from nearest cable
  SELECT gc.capacity_flag INTO cap_flag
    FROM geo_cables gc
    ORDER BY site_4326::geography <-> gc.geom::geography
    LIMIT 1;
  cap_flag := COALESCE(cap_flag, 'unknown');

  -- NDP intersect / within 1km (BNG)
  SELECT EXISTS(SELECT 1 FROM ndp_projects WHERE ST_Intersects(geom, site_buf)) INTO ndp_intersect;
  SELECT EXISTS(SELECT 1 FROM ndp_projects WHERE ST_DWithin(geom, _site_geom, 1000)) INTO ndp_within_1000;

  -- Wayleave intersect (BNG)
  SELECT EXISTS(SELECT 1 FROM wayleaves WHERE ST_Intersects(geom, corridor_buf)) INTO wayleave_hit;

  -- Highway widths within corridor (BNG)
  SELECT MIN(footway_m), MIN(carriageway_m)
    INTO min_footway, min_carriageway
    FROM highway_widths WHERE ST_Intersects(geom, corridor_buf);

  -- Build reasons
  IF dist_primary < 250 THEN reasons := reasons || '"Nearest substation within 250m"'::jsonb;
  ELSIF dist_primary <= 750 THEN reasons := reasons || '"Nearest substation between 250–750m"'::jsonb;
  ELSE reasons := reasons || '"Nearest substation >750m"'::jsonb;
  END IF;

  IF dist_feeder < 250 THEN reasons := reasons || '"Nearest feeder within 250m"'::jsonb;
  ELSIF dist_feeder <= 750 THEN reasons := reasons || '"Nearest feeder between 250–750m"'::jsonb;
  ELSIF dist_feeder < 999999 THEN reasons := reasons || '"Nearest feeder >750m"'::jsonb;
  ELSE reasons := reasons || '"No feeder data available"'::jsonb;
  END IF;

  IF cap_flag = 'unknown' THEN reasons := reasons || '"Capacity data unknown on nearest segment"'::jsonb;
  ELSIF cap_flag = 'constrained' THEN reasons := reasons || '"Nearest capacity segment is constrained"'::jsonb;
  ELSE reasons := reasons || '"Nearest capacity segment is favourable"'::jsonb;
  END IF;

  IF ndp_intersect THEN reasons := reasons || '"NDP intersects site area"'::jsonb;
  ELSIF ndp_within_1000 THEN reasons := reasons || '"NDP within 1km"'::jsonb;
  END IF;

  IF wayleave_hit THEN reasons := reasons || '"Wayleave intersects likely route corridor"'::jsonb; END IF;
  IF min_footway IS NOT NULL AND min_footway < 1.5 THEN reasons := reasons || '"Footway width constraint identified"'::jsonb; END IF;
  IF min_carriageway IS NOT NULL AND min_carriageway < 5.5 THEN reasons := reasons || '"Carriageway width constraint identified"'::jsonb; END IF;

  -- === SCORING RULES ===
  IF (dist_primary > 750 AND dist_feeder > 750 AND dist_capacity > 750)
     OR (wayleave_hit AND (COALESCE(min_carriageway, 999) < 5.5 OR COALESCE(min_footway, 999) < 1.5))
     OR (cap_flag = 'constrained' AND COALESCE(_proposed_kw, 0) >= 500)
  THEN
    score := 'RED';
  ELSIF (dist_primary < 250 OR dist_feeder < 250 OR dist_capacity < 250)
    AND NOT wayleave_hit
    AND (min_footway IS NULL OR min_footway >= 1.5)
    AND (min_carriageway IS NULL OR min_carriageway >= 5.5)
    AND cap_flag != 'constrained'
  THEN
    score := 'GREEN';
  ELSE
    score := 'AMBER';
  END IF;

  -- Next steps
  steps := steps || '"Desktop route review + topographical survey"'::jsonb;
  IF wayleave_hit THEN steps := steps || '"Confirm land rights/wayleave position"'::jsonb; END IF;
  steps := steps || '"Request DNO budget estimate / formal capacity check"'::jsonb;
  IF min_carriageway IS NOT NULL AND min_carriageway < 5.5 THEN
    steps := steps || '"Traffic management review due to carriageway width"'::jsonb;
  END IF;
  steps := steps || '"Site survey to confirm cable route and constructability"'::jsonb;

  RETURN jsonb_build_object(
    'score', score,
    'reasons', reasons,
    'next_steps', steps,
    'data_timestamp', now(),
    'distances', jsonb_build_object(
      'primary_m', round(dist_primary::numeric, 1),
      'feeder_m', round(dist_feeder::numeric, 1),
      'capacity_segment_m', round(dist_capacity::numeric, 1)
    ),
    'constraints', jsonb_build_object(
      'ndp_intersect', ndp_intersect,
      'ndp_within_1000m', ndp_within_1000,
      'wayleave_intersect', wayleave_hit,
      'capacity_flag', cap_flag,
      'min_footway_m', min_footway,
      'min_carriageway_m', min_carriageway
    ),
    'nearest_points', jsonb_build_object(
      'primary', CASE WHEN nearest_primary_pt_4326 IS NOT NULL
        THEN jsonb_build_array(ST_X(ST_Centroid(nearest_primary_pt_4326)), ST_Y(ST_Centroid(nearest_primary_pt_4326)))
        ELSE NULL END,
      'feeder', CASE WHEN nearest_feeder_pt_4326 IS NOT NULL
        THEN jsonb_build_array(ST_X(ST_ClosestPoint(nearest_feeder_pt_4326, site_4326)), ST_Y(ST_ClosestPoint(nearest_feeder_pt_4326, site_4326)))
        ELSE NULL END,
      'cable', CASE WHEN nearest_cable_pt_4326 IS NOT NULL
        THEN jsonb_build_array(ST_X(ST_ClosestPoint(nearest_cable_pt_4326, site_4326)), ST_Y(ST_ClosestPoint(nearest_cable_pt_4326, site_4326)))
        ELSE NULL END
    )
  );
END;
$$;
