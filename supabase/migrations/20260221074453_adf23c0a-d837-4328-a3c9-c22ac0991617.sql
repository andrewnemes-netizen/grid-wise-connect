CREATE OR REPLACE FUNCTION public.score_site(_site_geom geometry, _proposed_kw numeric DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
  nearest_primary_pt_4326 geometry;
  nearest_feeder_pt_4326 geometry;
  nearest_cable_pt_4326 geometry;
  tmp_dist NUMERIC;
  tmp_geom geometry;
  search_radius NUMERIC;
  radii NUMERIC[] := ARRAY[2000, 5000, 15000]; -- metres in 4326 approx
  r NUMERIC;
BEGIN
  -- _site_geom is in BNG (27700)
  site_buf := ST_Buffer(_site_geom, 50);
  corridor_buf := ST_Buffer(_site_geom, 100);
  site_4326 := ST_Transform(_site_geom, 4326);

  -- ========================================
  -- Nearest substation from geo_substations (SRID 4326)
  -- Use expanding-radius ST_DWithin on geometry to leverage GiST index
  -- ========================================
  dist_primary := 999999;
  FOREACH r IN ARRAY ARRAY[0.02, 0.05, 0.15] -- ~2km, ~5km, ~15km in degrees
  LOOP
    SELECT ST_Distance(site_4326::geography, gs.geom::geography), gs.geom
      INTO tmp_dist, tmp_geom
      FROM geo_substations gs
      WHERE ST_DWithin(gs.geom, site_4326, r)
      ORDER BY gs.geom <-> site_4326
      LIMIT 1;
    IF tmp_dist IS NOT NULL THEN
      dist_primary := tmp_dist;
      nearest_primary_pt_4326 := tmp_geom;
      EXIT;
    END IF;
  END LOOP;

  -- Also check site_utilisation (SRID 27700) for closer substations
  FOREACH r IN ARRAY ARRAY[2000, 5000, 15000] -- metres in BNG
  LOOP
    SELECT ST_Distance(_site_geom, su.geom), ST_Transform(su.geom, 4326)
      INTO tmp_dist, tmp_geom
      FROM site_utilisation su
      WHERE su.geom IS NOT NULL
        AND ST_DWithin(su.geom, _site_geom, r)
      ORDER BY su.geom <-> _site_geom
      LIMIT 1;
    IF tmp_dist IS NOT NULL THEN
      IF tmp_dist < dist_primary THEN
        dist_primary := tmp_dist;
        nearest_primary_pt_4326 := tmp_geom;
      END IF;
      EXIT;
    END IF;
  END LOOP;

  -- ========================================
  -- Nearest feeder from geo_feeders (SRID 4326)
  -- ========================================
  dist_feeder := 999999;
  FOREACH r IN ARRAY ARRAY[0.02, 0.05, 0.15]
  LOOP
    SELECT ST_Distance(site_4326::geography, gf.geom::geography), gf.geom
      INTO tmp_dist, tmp_geom
      FROM geo_feeders gf
      WHERE ST_DWithin(gf.geom, site_4326, r)
      ORDER BY gf.geom <-> site_4326
      LIMIT 1;
    IF tmp_dist IS NOT NULL THEN
      dist_feeder := tmp_dist;
      nearest_feeder_pt_4326 := tmp_geom;
      EXIT;
    END IF;
  END LOOP;

  -- ========================================
  -- Nearest cable from geo_cables (SRID 4326)
  -- ========================================
  dist_capacity := 999999;
  cap_flag := 'unknown';
  FOREACH r IN ARRAY ARRAY[0.02, 0.05, 0.15]
  LOOP
    SELECT ST_Distance(site_4326::geography, gc.geom::geography), gc.geom, gc.capacity_flag
      INTO tmp_dist, tmp_geom, cap_flag
      FROM geo_cables gc
      WHERE ST_DWithin(gc.geom, site_4326, r)
      ORDER BY gc.geom <-> site_4326
      LIMIT 1;
    IF tmp_dist IS NOT NULL THEN
      dist_capacity := tmp_dist;
      nearest_cable_pt_4326 := tmp_geom;
      EXIT;
    END IF;
  END LOOP;
  cap_flag := COALESCE(cap_flag, 'unknown');

  -- NDP intersect / within 1km (BNG)
  SELECT EXISTS(SELECT 1 FROM ndp_projects WHERE ST_Intersects(geom, site_buf)) INTO ndp_intersect;
  SELECT EXISTS(SELECT 1 FROM ndp_projects WHERE ST_DWithin(geom, _site_geom, 1000)) INTO ndp_within_1000;

  -- Wayleave intersect (BNG)
  SELECT EXISTS(SELECT 1 FROM wayleaves WHERE ST_Intersects(geom, corridor_buf)) INTO wayleave_hit;

  -- Highway widths within corridor (BNG)
  SELECT MIN(footway_m), MIN(carriageway_m)
    INTO min_footway, min_carriageway
    FROM highway_widths WHERE ST_DWithin(geom, _site_geom, 100);

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

  IF wayleave_hit THEN reasons := reasons || '"Wayleave crosses corridor"'::jsonb; END IF;

  IF min_footway IS NOT NULL AND min_footway < 1.5 THEN
    reasons := reasons || '"Narrow footway on route (<1.5m)"'::jsonb;
  END IF;
  IF min_carriageway IS NOT NULL AND min_carriageway < 5.5 THEN
    reasons := reasons || '"Narrow carriageway on route (<5.5m)"'::jsonb;
  END IF;

  -- Score
  IF dist_primary < 250 AND dist_feeder < 500 AND cap_flag NOT IN ('constrained') AND NOT ndp_intersect THEN
    score := 'GREEN';
  ELSIF dist_primary > 1500 OR cap_flag = 'constrained' OR ndp_intersect THEN
    score := 'RED';
  ELSE
    score := 'AMBER';
  END IF;

  -- Next steps
  IF score = 'GREEN' THEN
    steps := steps || '"Submit G99 application"'::jsonb;
    steps := steps || '"Arrange point of connection meeting"'::jsonb;
  ELSIF score = 'AMBER' THEN
    steps := steps || '"Request budget estimate from DNO"'::jsonb;
    steps := steps || '"Commission feasibility study"'::jsonb;
  ELSE
    steps := steps || '"Consider alternative sites"'::jsonb;
    steps := steps || '"Explore reinforcement options"'::jsonb;
    steps := steps || '"Engage DNO early for pre-application discussions"'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'score', score,
    'reasons', reasons,
    'next_steps', steps,
    'distances', jsonb_build_object(
      'primary_m', ROUND(dist_primary),
      'feeder_m', ROUND(dist_feeder),
      'capacity_segment_m', ROUND(dist_capacity)
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
      'primary', CASE WHEN nearest_primary_pt_4326 IS NOT NULL THEN ST_AsGeoJSON(nearest_primary_pt_4326)::jsonb ELSE NULL END,
      'feeder', CASE WHEN nearest_feeder_pt_4326 IS NOT NULL THEN ST_AsGeoJSON(nearest_feeder_pt_4326)::jsonb ELSE NULL END,
      'capacity_segment', CASE WHEN nearest_cable_pt_4326 IS NOT NULL THEN ST_AsGeoJSON(nearest_cable_pt_4326)::jsonb ELSE NULL END
    ),
    'data_timestamp', NOW()
  );
END;
$$;