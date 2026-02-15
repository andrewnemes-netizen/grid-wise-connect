-- Drop the separate dno_licence_areas table (use geo_polygons instead)
DROP TABLE IF EXISTS public.dno_licence_areas;

-- Create layer_registry entry for DNO licence areas
INSERT INTO public.layer_registry (
  slug, display_name, dno, category, subcategory, geometry_type,
  storage_table, enabled, visible_by_default, min_zoom, max_zoom,
  legend_json, style_json
) VALUES (
  'gb_dno_licence_areas',
  'DNO Licence Areas (GB)',
  'GB',
  'Network Context',
  'DNO Regions',
  'Polygon',
  'geo_polygons',
  true,
  true,
  4,
  18,
  '[{"label":"DNO Licence Area","color":"#6366f1"}]'::jsonb,
  '{"color":"#6366f1","paint":{"fill-opacity":0.15}}'::jsonb
);

-- Update get_geo_layer_geojson to use geo_polygons for DNO spatial clip
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

  -- Optional DNO spatial clip: find the DNO polygon from geo_polygons via the gb_dno_licence_areas layer
  IF _dno_clip IS NOT NULL AND _dno_clip != '' THEN
    SELECT lr.id INTO _clip_layer_id
    FROM layer_registry lr
    WHERE lr.slug = 'gb_dno_licence_areas'
    LIMIT 1;

    IF _clip_layer_id IS NOT NULL THEN
      _dno_clause := format(
        'AND ST_Intersects(geom, (SELECT ST_Union(gp.geom) FROM geo_polygons gp WHERE gp.layer_id = %L AND gp.name = %L))',
        _clip_layer_id, _dno_clip
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
