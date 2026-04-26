CREATE OR REPLACE FUNCTION public.auto_create_dno_layers(p_dno text, p_force boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_def text;
  v_new_ssen_block text;
BEGIN
  -- This migration only patches the SSEN branch. We rebuild the function
  -- in-place by string-replacing the SSEN block. To keep this migration
  -- idempotent and safe even if the source body changes, we always
  -- redefine the SSEN block to the canonical (Transmission + Distribution)
  -- ruleset below.
  NULL;
END;
$function$;

-- Now define the real function body with SSEN extended.
CREATE OR REPLACE FUNCTION public.auto_create_dno_layers(p_dno text, p_force boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rules jsonb;
  v_rule jsonb;
  v_dataset record;
  v_layer_id uuid;
  v_created int := 0;
  v_linked int := 0;
  v_skipped int := 0;
  v_matched boolean;
  v_excluded boolean;
  v_pattern text;
  v_is_gas boolean := false;
BEGIN
  IF p_dno IN ('CADENT','NGN','SGN','WWU') THEN
    v_is_gas := true;
  END IF;

  IF p_dno = 'SSEN' THEN
    v_rules := '[
      {"slug":"ssen-overhead-supergrid","display_name":"SSEN Overhead Lines (Supergrid 275/400kV)","category":"Electrical Assets","subcategory":"OHL Supergrid","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%overhead%line%supergrid%","%ohl%supergrid%"],"exclude_patterns":[]},
      {"slug":"ssen-overhead-grid","display_name":"SSEN Overhead Lines (Grid 132kV)","category":"Electrical Assets","subcategory":"OHL Grid","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%overhead%line%grid%","%ohl%grid%"],"exclude_patterns":["%supergrid%"]},
      {"slug":"ssen-towers-supergrid","display_name":"SSEN Towers (Supergrid)","category":"Electrical Assets","subcategory":"Towers","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%tower%supergrid%"],"exclude_patterns":[]},
      {"slug":"ssen-towers-grid","display_name":"SSEN Towers (Grid)","category":"Electrical Assets","subcategory":"Towers","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%tower%grid%"],"exclude_patterns":["%supergrid%"]},
      {"slug":"ssen-poles-grid","display_name":"SSEN Poles (Grid)","category":"Electrical Assets","subcategory":"Poles","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%pole%grid%","%pole-grid%"],"exclude_patterns":[]},
      {"slug":"ssen-substation-supergrid","display_name":"SSEN Substation Sites (Supergrid)","category":"Electrical Assets","subcategory":"Substations","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%substation%site%supergrid%"],"exclude_patterns":[]},
      {"slug":"ssen-substation-grid","display_name":"SSEN Substation Sites (Grid)","category":"Electrical Assets","subcategory":"Substations","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%substation%site%grid%"],"exclude_patterns":["%supergrid%"]},
      {"slug":"ssen-egl2-route","display_name":"SSEN Eastern Green Link 2 - Route","category":"Planning","subcategory":"Major Projects","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%eastern%green%link%2%linear%route%","%egl2%route%"],"exclude_patterns":[]},
      {"slug":"ssen-egl2-points","display_name":"SSEN Eastern Green Link 2 - Points","category":"Planning","subcategory":"Major Projects","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%eastern%green%link%2%points%","%egl2%points%"],"exclude_patterns":[]},
      {"slug":"ssen-gi-locations","display_name":"SSEN Ground Investigation Locations","category":"Planning","subcategory":"Surveys","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%ground%investigation%","%gi%location%"],"exclude_patterns":[]},
      {"slug":"ssen-planning-corridors","display_name":"SSEN Planning Application Notification Corridors","category":"Planning","subcategory":"Consultation Zones","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%planning%application%notification%","%third%party%planning%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-substations","display_name":"SSEN Distribution Substations","category":"Electrical Assets","subcategory":"Substations","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%substation%data%","%substation%location%","%distribution%substation%"],"exclude_patterns":["%site%grid%","%supergrid%"]},
      {"slug":"ssen-dx-primary-substations","display_name":"SSEN Primary Substations","category":"Electrical Assets","subcategory":"Primary Substations","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%primary%substation%","%bsp%","%grid%supply%point%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-distribution-transformers","display_name":"SSEN Distribution Transformers","category":"Electrical Assets","subcategory":"Transformers","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%distribution%transformer%","%secondary%transformer%","%lv%transformer%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-hv-overhead","display_name":"SSEN HV Overhead Lines (11/33kV)","category":"Electrical Assets","subcategory":"HV OHL","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hv%overhead%","%11kv%overhead%","%33kv%overhead%","%hv%ohl%"],"exclude_patterns":["%supergrid%","%132%"]},
      {"slug":"ssen-dx-lv-overhead","display_name":"SSEN LV Overhead Lines","category":"Electrical Assets","subcategory":"LV OHL","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lv%overhead%","%low%voltage%overhead%","%lv%ohl%"],"exclude_patterns":["%hv%","%ehv%"]},
      {"slug":"ssen-dx-hv-cables","display_name":"SSEN HV Underground Cables (11/33kV)","category":"Electrical Assets","subcategory":"HV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hv%cable%","%11kv%cable%","%33kv%cable%","%hv%underground%"],"exclude_patterns":["%lv%","%supergrid%","%132%"]},
      {"slug":"ssen-dx-lv-cables","display_name":"SSEN LV Underground Cables","category":"Electrical Assets","subcategory":"LV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lv%cable%","%low%voltage%cable%","%lv%underground%"],"exclude_patterns":["%hv%","%ehv%"]},
      {"slug":"ssen-dx-ehv-cables","display_name":"SSEN EHV Underground Cables (66/132kV)","category":"Electrical Assets","subcategory":"EHV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%ehv%cable%","%66kv%cable%","%132kv%cable%","%ehv%underground%"],"exclude_patterns":["%lv%","%hv%cable%"]},
      {"slug":"ssen-dx-lv-feeder-smart-meter","display_name":"SSEN LV Feeder Smart Meter Data","category":"Performance","subcategory":"Smart Meter","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%smart%meter%lv%feeder%","%lv%feeder%half%hour%","%smart_meter_prod_lv_feeder%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-licence-areas","display_name":"SSEN Licence Areas (SEPD/SHEPD)","category":"Boundaries","subcategory":"Licence Areas","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%licence%area%","%sepd%","%shepd%","%network%boundary%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-network-capacity","display_name":"SSEN Network Capacity Map","category":"Network","subcategory":"Capacity","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%network%capacity%","%capacity%map%","%headroom%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-faults-outages","display_name":"SSEN Faults & Outages","category":"Performance","subcategory":"Faults","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%fault%","%outage%","%interruption%","%cml%","%csi%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-connections","display_name":"SSEN Connection Activity","category":"Network","subcategory":"Connections","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%connection%activity%","%connection%offer%","%accepted%connection%"],"exclude_patterns":[]}
    ]'::jsonb;

  ELSIF p_dno = 'UKPN' THEN
    v_rules := '[
      {"slug":"ukpn-lv-cables","display_name":"UKPN LV Underground Cables","category":"Electrical Assets","subcategory":"LV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lv%cable%","%low%voltage%cable%","%lv-underground%"],"exclude_patterns":["%hv%","%ehv%"]},
      {"slug":"ukpn-hv-cables","display_name":"UKPN HV Underground Cables","category":"Electrical Assets","subcategory":"HV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hv%cable%","%11kv%cable%","%hv-underground%"],"exclude_patterns":["%lv%","%ehv%","%132%"]},
      {"slug":"ukpn-ehv-cables","display_name":"UKPN EHV Underground Cables","category":"Electrical Assets","subcategory":"EHV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%ehv%cable%","%33kv%cable%","%66kv%cable%","%ehv-underground%","%132kv%cable%"],"exclude_patterns":["%lv%","%hv%"]},
      {"slug":"ukpn-substations","display_name":"UKPN Substations","category":"Electrical Assets","subcategory":"Substations","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%substation%","%primary%","%bsp%","%grid%supply%"],"exclude_patterns":[]},
      {"slug":"ukpn-fault-data","display_name":"UKPN Fault Data","category":"Performance","subcategory":"Faults","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%fault%","%interruption%","%outage%"],"exclude_patterns":[]}
    ]'::jsonb;

  ELSE
    RETURN json_build_object('error', 'No rules defined for DNO: ' || p_dno);
  END IF;

  -- Iterate through each rule
  FOR v_rule IN SELECT * FROM jsonb_array_elements(v_rules)
  LOOP
    -- Find or create the layer
    SELECT id INTO v_layer_id
    FROM layer_registry
    WHERE slug = v_rule->>'slug';

    IF v_layer_id IS NULL THEN
      INSERT INTO layer_registry (
        slug, display_name, category, subcategory,
        geometry_type, storage_table, dno, source_type, active
      ) VALUES (
        v_rule->>'slug',
        v_rule->>'display_name',
        v_rule->>'category',
        v_rule->>'subcategory',
        v_rule->>'geometry_type',
        v_rule->>'storage_table',
        p_dno,
        'opendata',
        true
      ) RETURNING id INTO v_layer_id;

      v_created := v_created + 1;
    END IF;

    -- Match datasets
    FOR v_dataset IN
      SELECT id, dataset_id, title
      FROM dno_dataset_registry
      WHERE dno = p_dno
        AND active = true
        AND (linked_layer_id IS NULL OR p_force = true)
    LOOP
      v_matched := false;
      v_excluded := false;

      -- Check match patterns
      FOR v_pattern IN SELECT jsonb_array_elements_text(v_rule->'match_patterns')
      LOOP
        IF lower(v_dataset.dataset_id) LIKE v_pattern OR lower(v_dataset.title) LIKE v_pattern THEN
          v_matched := true;
          EXIT;
        END IF;
      END LOOP;

      -- Check exclude patterns
      IF v_matched THEN
        FOR v_pattern IN SELECT jsonb_array_elements_text(v_rule->'exclude_patterns')
        LOOP
          IF lower(v_dataset.dataset_id) LIKE v_pattern OR lower(v_dataset.title) LIKE v_pattern THEN
            v_excluded := true;
            EXIT;
          END IF;
        END LOOP;
      END IF;

      IF v_matched AND NOT v_excluded THEN
        UPDATE dno_dataset_registry
        SET linked_layer_id = v_layer_id
        WHERE id = v_dataset.id;
        v_linked := v_linked + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'success', true,
    'dno', p_dno,
    'layers_created', v_created,
    'datasets_linked', v_linked,
    'datasets_skipped', v_skipped
  );
END;
$function$;