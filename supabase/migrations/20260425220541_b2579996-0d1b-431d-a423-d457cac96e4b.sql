CREATE OR REPLACE FUNCTION public.auto_create_dno_layers(p_dno text, p_force boolean DEFAULT false)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF p_dno = 'UKPN' THEN
    v_rules := '[
      {"slug":"ukpn-lv-cables","display_name":"UKPN LV Underground Cables","category":"Electrical Assets","subcategory":"LV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lv%cable%","%low%voltage%cable%","%lv-underground%"],"exclude_patterns":["%hv%","%ehv%"]},
      {"slug":"ukpn-hv-cables","display_name":"UKPN HV Underground Cables","category":"Electrical Assets","subcategory":"HV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hv%cable%","%11kv%cable%","%hv-underground%"],"exclude_patterns":["%lv%","%ehv%","%132%"]},
      {"slug":"ukpn-ehv-cables","display_name":"UKPN EHV Underground Cables","category":"Electrical Assets","subcategory":"EHV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%ehv%cable%","%33kv%cable%","%66kv%cable%","%ehv-underground%","%132kv%cable%"],"exclude_patterns":["%lv%","%hv%"]},
      {"slug":"ukpn-substations","display_name":"UKPN Substations","category":"Electrical Assets","subcategory":"Substations","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%substation%","%primary%","%bsp%","%grid%supply%"],"exclude_patterns":[]},
      {"slug":"ukpn-fault-data","display_name":"UKPN Fault Data","category":"Performance","subcategory":"Faults","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%fault%","%interruption%","%outage%"],"exclude_patterns":[]}
    ]'::jsonb;

  ELSIF p_dno = 'CADENT' THEN
    v_rules := '[
      {"slug":"cadent-la-pipes","display_name":"Cadent LA Pipe Infrastructure","category":"Gas Assets","subcategory":"LA Pipes","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%la_pipe_infrastructure%","%la-pipe-infrastructure%"],"exclude_patterns":[]},
      {"slug":"cadent-lp-pipes","display_name":"Cadent LP Gas Pipes","category":"Gas Assets","subcategory":"LP Mains","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lp%pipe%","%low%pressure%pipe%","%lp%main%","%low-pressure%main%","%gpi%lp%"],"exclude_patterns":["%shared%","%la_pipe%"]},
      {"slug":"cadent-mp-pipes","display_name":"Cadent MP Gas Pipes","category":"Gas Assets","subcategory":"MP Mains","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%mp%pipe%","%medium%pressure%pipe%","%mp%main%","%medium-pressure%main%","%gpi%mp%"],"exclude_patterns":["%shared%","%la_pipe%"]},
      {"slug":"cadent-ip-pipes","display_name":"Cadent IP Gas Pipes","category":"Gas Assets","subcategory":"IP Mains","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%ip%pipe%","%intermediate%pressure%","%ip%main%","%gpi%ip%"],"exclude_patterns":["%shared%","%la_pipe%"]},
      {"slug":"cadent-hp-pipes","display_name":"Cadent HP Gas Pipes","category":"Gas Assets","subcategory":"HP Mains","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hp%pipe%","%high%pressure%","%hp%main%"],"exclude_patterns":["%shared%","%la_pipe%"]},
      {"slug":"cadent-open-pipes","display_name":"Cadent Gas Pipes (Open)","category":"Gas Assets","subcategory":"All Mains","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%gas-pipe-infrastructure-gpi%open%","%gpi_open%"],"exclude_patterns":["%shared%","%la_pipe%"]},
      {"slug":"cadent-regional-pipes","display_name":"Cadent Regional Gas Pipes","category":"Gas Assets","subcategory":"Regional Mains","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%gas-pipe-infrastructure%","%gas_pipe_infrastructure%"],"exclude_patterns":["%la_pipe%","%gpi_open%"]},
      {"slug":"cadent-network-zones","display_name":"Cadent Network Zones","category":"Gas Boundaries","subcategory":"Zones","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%network%zone%","%supply%zone%","%network_zone%","%cna%network%area%"],"exclude_patterns":[]},
      {"slug":"cadent-governors","display_name":"Cadent Governors","category":"Gas Assets","subcategory":"Governors","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%governor%"],"exclude_patterns":[]},
      {"slug":"cadent-above-ground","display_name":"Cadent Above Ground Assets","category":"Gas Assets","subcategory":"Above Ground","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%agio%","%agis%","%agp%","%above%ground%"],"exclude_patterns":[]},
      {"slug":"cadent-forecast-zones","display_name":"Cadent Local Forecast Zones","category":"Gas Boundaries","subcategory":"Forecast Zones","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%lfz%","%forecast%zone%","%local%forecast%"],"exclude_patterns":[]},
      {"slug":"cadent-capacity","display_name":"Cadent Capacity Data","category":"Gas Capacity","subcategory":"Capacity","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%capacity%","%demand%","%flow%","%below%7%bar%","%lts%"],"exclude_patterns":["%zone%","%la_pipe%"]},
      {"slug":"cadent-hydrogen","display_name":"Cadent Hydrogen Network","category":"Gas Planning","subcategory":"Hydrogen","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hydrogen%","%h2%","%hynet%"],"exclude_patterns":[]},
      {"slug":"cadent-reports","display_name":"Cadent Reports & Data","category":"Gas Data","subcategory":"Reports","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%ger%","%gpl%","%lld%","%dds%","%planned%data%"],"exclude_patterns":[]}
    ]'::jsonb;

  ELSIF p_dno = 'SSEN' THEN
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
      {"slug":"ssen-planning-corridors","display_name":"SSEN Planning Application Notification Corridors","category":"Planning","subcategory":"Consultation Zones","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%planning%application%notification%","%third%party%planning%"],"exclude_patterns":[]}
    ]'::jsonb;

  ELSE
    RETURN json_build_object('error', 'No rules defined for DNO: ' || p_dno);
  END IF;

  IF v_is_gas THEN
    FOR v_dataset IN
      SELECT id, dataset_id, title, is_geospatial, geometry_type, storage_table
      FROM gas_dataset_registry
      WHERE dno = p_dno
        AND is_geospatial = true
        AND (linked_layer_id IS NULL OR p_force)
      ORDER BY title
    LOOP
      v_matched := false;
      FOR v_rule IN SELECT * FROM jsonb_array_elements(v_rules)
      LOOP
        v_excluded := false;
        FOR v_pattern IN SELECT jsonb_array_elements_text(v_rule->'exclude_patterns')
        LOOP
          IF lower(v_dataset.dataset_id) LIKE v_pattern OR lower(v_dataset.title) LIKE v_pattern THEN
            v_excluded := true;
            EXIT;
          END IF;
        END LOOP;
        IF v_excluded THEN CONTINUE; END IF;

        FOR v_pattern IN SELECT jsonb_array_elements_text(v_rule->'match_patterns')
        LOOP
          IF lower(v_dataset.dataset_id) LIKE v_pattern OR lower(v_dataset.title) LIKE v_pattern THEN
            v_matched := true;
            EXIT;
          END IF;
        END LOOP;

        IF v_matched THEN
          SELECT id INTO v_layer_id FROM layer_registry WHERE slug = (v_rule->>'slug');
          IF v_layer_id IS NULL THEN
            INSERT INTO layer_registry (slug, display_name, category, subcategory, geometry_type, storage_table, source_type, is_active)
            VALUES (v_rule->>'slug', v_rule->>'display_name', v_rule->>'category', v_rule->>'subcategory', v_rule->>'geometry_type', v_rule->>'storage_table', 'dno_api', true)
            RETURNING id INTO v_layer_id;
            v_created := v_created + 1;
          END IF;
          UPDATE gas_dataset_registry SET linked_layer_id = v_layer_id WHERE id = v_dataset.id;
          v_linked := v_linked + 1;
          EXIT;
        END IF;
      END LOOP;
      IF NOT v_matched THEN v_skipped := v_skipped + 1; END IF;
    END LOOP;
  ELSE
    FOR v_dataset IN
      SELECT id, dataset_id, title, is_geospatial, geometry_type, storage_table
      FROM dno_dataset_registry
      WHERE dno = p_dno
        AND is_geospatial = true
        AND (linked_layer_id IS NULL OR p_force)
      ORDER BY title
    LOOP
      v_matched := false;
      FOR v_rule IN SELECT * FROM jsonb_array_elements(v_rules)
      LOOP
        v_excluded := false;
        FOR v_pattern IN SELECT jsonb_array_elements_text(v_rule->'exclude_patterns')
        LOOP
          IF lower(v_dataset.dataset_id) LIKE v_pattern OR lower(v_dataset.title) LIKE v_pattern THEN
            v_excluded := true;
            EXIT;
          END IF;
        END LOOP;
        IF v_excluded THEN CONTINUE; END IF;

        FOR v_pattern IN SELECT jsonb_array_elements_text(v_rule->'match_patterns')
        LOOP
          IF lower(v_dataset.dataset_id) LIKE v_pattern OR lower(v_dataset.title) LIKE v_pattern THEN
            v_matched := true;
            EXIT;
          END IF;
        END LOOP;

        IF v_matched THEN
          SELECT id INTO v_layer_id FROM layer_registry WHERE slug = (v_rule->>'slug');
          IF v_layer_id IS NULL THEN
            INSERT INTO layer_registry (slug, display_name, category, subcategory, geometry_type, storage_table, source_type, is_active)
            VALUES (v_rule->>'slug', v_rule->>'display_name', v_rule->>'category', v_rule->>'subcategory', v_rule->>'geometry_type', v_rule->>'storage_table', 'dno_api', true)
            RETURNING id INTO v_layer_id;
            v_created := v_created + 1;
          END IF;
          UPDATE dno_dataset_registry SET linked_layer_id = v_layer_id WHERE id = v_dataset.id;
          v_linked := v_linked + 1;
          EXIT;
        END IF;
      END LOOP;
      IF NOT v_matched THEN v_skipped := v_skipped + 1; END IF;
    END LOOP;
  END IF;

  RETURN json_build_object(
    'success', true,
    'dno', p_dno,
    'layers_created', v_created,
    'datasets_linked', v_linked,
    'datasets_skipped', v_skipped
  );
END;
$$;