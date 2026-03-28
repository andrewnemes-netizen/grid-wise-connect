CREATE OR REPLACE FUNCTION public.auto_create_dno_layers(p_dno text, p_force boolean DEFAULT false)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules jsonb;
  v_rule jsonb;
  v_layer_id uuid;
  v_layers_created int := 0;
  v_layers_reused int := 0;
  v_datasets_linked int := 0;
  v_datasets_skipped int := 0;
  v_unmatched text[] := '{}';
  v_dataset record;
  v_matched boolean;
  v_match_pattern text;
  v_exclude_pattern text;
  v_excluded boolean;
BEGIN
  IF p_dno = 'ENWL' THEN
    v_rules := '[
      {"slug":"enwl-substations","display_name":"ENWL Substations","category":"Network Assets","subcategory":"Substations","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%substation%capacity%","%substation%location%","%substation-location%"],"exclude_patterns":["%catchment%","%polygon%","%dfes%","%overhead%"]},
      {"slug":"enwl-ecr","display_name":"ENWL ECR Headroom","category":"Capacity","subcategory":"Headroom","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%ecr%","%embedded-capacity%"],"exclude_patterns":[]},
      {"slug":"enwl-capacity-heatmap","display_name":"ENWL Capacity Heatmap","category":"Capacity","subcategory":"Heatmap","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%capacity-heatmap%","%heatmap%"],"exclude_patterns":[]},
      {"slug":"enwl-hv-11kv","display_name":"ENWL HV 11kV Network","category":"Network Assets","subcategory":"HV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%11kv-underground%","%11kv-ug%"],"exclude_patterns":["%overhead%"]},
      {"slug":"enwl-hv-6kv","display_name":"ENWL HV 6.6kV Network","category":"Network Assets","subcategory":"HV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%6-6kv%","%6.6kv%","%6kv-underground%"],"exclude_patterns":["%overhead%"]},
      {"slug":"enwl-distribution-tx","display_name":"ENWL Distribution Transformers","category":"Network Assets","subcategory":"Transformers","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%distribution-transformer%","%dist-transformer%","%distribution_transformer%"],"exclude_patterns":[]},
      {"slug":"enwl-overhead-conductors","display_name":"ENWL Overhead Conductors","category":"Network Assets","subcategory":"Overhead Lines","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%overhead%conductor%","%oh-conductor%","%overhead-line%","%overhead_conductor%"],"exclude_patterns":[]},
      {"slug":"enwl-ndp-headroom","display_name":"ENWL NDP Headroom","category":"Capacity","subcategory":"NDP","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%ndp%headroom%","%network-development%"],"exclude_patterns":[]},
      {"slug":"enwl-dfes-forecasts","display_name":"ENWL DFES Forecasts","category":"Forecasting","subcategory":"DFES","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%dfes%"],"exclude_patterns":["%sites%"]},
      {"slug":"enwl-connection-queue","display_name":"ENWL Connection Queue","category":"Connections","subcategory":"Queue","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%connection%queue%","%accepted-connection%","%connection-offers%"],"exclude_patterns":[]},
      {"slug":"enwl-service-areas","display_name":"ENWL Service Areas","category":"Boundaries","subcategory":"Service Areas","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%control-area%","%control-boundary%","%general-boundary%","%idno-polygon%","%licence-area%","%service-area%"],"exclude_patterns":[]},
      {"slug":"enwl-flexibility","display_name":"ENWL Flexibility","category":"Flexibility","subcategory":"Services","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%flexibility%","%flex-zone%"],"exclude_patterns":[]},
      {"slug":"enwl-ev-registrations","display_name":"ENWL EV Registrations","category":"Low Carbon","subcategory":"EV","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%ev-registration%","%electric-vehicle%","%ev_%"],"exclude_patterns":[]},
      {"slug":"enwl-lct-data","display_name":"ENWL LCT Data","category":"Low Carbon","subcategory":"LCT","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%lct%","%low-carbon%","%heat-pump%","%solar-pv%","%generation%"],"exclude_patterns":["%dfes%"]},
      {"slug":"enwl-environmental","display_name":"ENWL Environmental Constraints","category":"Constraints","subcategory":"Environmental","geometry_type":"Polygon","storage_table":"geo_constraints","match_patterns":["%environmental%","%conservation%","%sssi%","%flood%"],"exclude_patterns":[]},
      {"slug":"enwl-biodiversity","display_name":"ENWL Biodiversity","category":"Constraints","subcategory":"Biodiversity","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%biodiversity%","%bng%","%habitat%"],"exclude_patterns":[]},
      {"slug":"enwl-substation-catchments","display_name":"ENWL Substation Catchments","category":"Boundaries","subcategory":"Catchments","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%catchment%","%supply-area%"],"exclude_patterns":[]},
      {"slug":"enwl-lv-network","display_name":"ENWL LV Network","category":"Network Assets","subcategory":"LV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lv-underground%","%lv-cable%","%lv_underground%"],"exclude_patterns":["%overhead%"]},
      {"slug":"enwl-lv-overhead","display_name":"ENWL LV Overhead","category":"Network Assets","subcategory":"Overhead Lines","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lv-overhead%","%lv_overhead%"],"exclude_patterns":[]},
      {"slug":"enwl-dso-primary","display_name":"ENWL DSO Primary Polygons","category":"Boundaries","subcategory":"DSO","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%dso%primary%","%dso-primary%"],"exclude_patterns":[]},
      {"slug":"enwl-ehv-network","display_name":"ENWL EHV Network","category":"Network Assets","subcategory":"EHV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%ehv%","%33kv%","%132kv%"],"exclude_patterns":["%substation%","%overhead%"]}
    ]'::jsonb;

  ELSIF p_dno = 'SPEN' THEN
    v_rules := '[
      {"slug":"spen-line-assets","display_name":"SPEN Line Assets","category":"Network Assets","subcategory":"All Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%gis%line%asset%"],"exclude_patterns":[]},
      {"slug":"spen-point-assets","display_name":"SPEN Point Assets","category":"Network Assets","subcategory":"All Points","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%gis%point%asset%"],"exclude_patterns":[]},
      {"slug":"spen-secondary-substations","display_name":"SPEN Secondary Substations","category":"Network Assets","subcategory":"Substations","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%secondary%substation%polygon%"],"exclude_patterns":[]},
      {"slug":"spen-lv-monitoring","display_name":"SPEN LV Monitoring","category":"Capacity","subcategory":"Monitoring","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%lv%monitor%"],"exclude_patterns":[]},
      {"slug":"spen-smart-meter-tx","display_name":"SPEN Smart Meter (Transformer)","category":"Low Carbon","subcategory":"Smart Meter","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%smart%meter%transformer%"],"exclude_patterns":[]},
      {"slug":"spen-smart-meter-census","display_name":"SPEN Smart Meter (Census)","category":"Low Carbon","subcategory":"Smart Meter","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%smart%meter%census%"],"exclude_patterns":[]},
      {"slug":"spen-dfes-polygons","display_name":"SPEN DFES Substation Polygons","category":"Forecasting","subcategory":"DFES","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%dfes%substation%polygon%","%dfes%site%forecast%polygon%"],"exclude_patterns":[]},
      {"slug":"spen-primary-substations","display_name":"SPEN Primary Substation Polygons","category":"Network Assets","subcategory":"Substations","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%primary%substation%polygon%","%primary%group%polygon%"],"exclude_patterns":["%ndp%","%dfes%","%flexibility%"]},
      {"slug":"spen-ndp-polygons","display_name":"SPEN NDP Polygons","category":"Capacity","subcategory":"NDP","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%ndp%polygon%","%ndp-%primary%","%ndp-%grid%"],"exclude_patterns":[]},
      {"slug":"spen-flexibility","display_name":"SPEN Flexibility Assets","category":"Flexibility","subcategory":"Services","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%flexibility%asset%","%flexibility%substation%","%deferred%reinforcement%","%operational%flexibility%"],"exclude_patterns":[]},
      {"slug":"spen-dnoa","display_name":"SPEN DNOA Polygons","category":"Capacity","subcategory":"DNOA","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%dnoa%","%distribution%network%option%"],"exclude_patterns":[]},
      {"slug":"spen-smart-meter-agg","display_name":"SPEN Smart Meter Aggregated","category":"Low Carbon","subcategory":"Smart Meter","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%aggregated%smart%meter%"],"exclude_patterns":[]},
      {"slug":"spen-dfes-local-auth","display_name":"SPEN DFES Local Authorities","category":"Forecasting","subcategory":"DFES","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%dfes%local%authorit%"],"exclude_patterns":[]},
      {"slug":"spen-boundary","display_name":"SPEN Boundary","category":"Boundaries","subcategory":"Service Areas","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%boundary%information%"],"exclude_patterns":[]}
    ]'::jsonb;

  ELSIF p_dno = 'NPG' THEN
    v_rules := '[
      {"slug":"npg-substations","display_name":"NPG Substations","category":"Network Assets","subcategory":"Substations","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%substation%"],"exclude_patterns":["%polygon%","%catchment%"]},
      {"slug":"npg-cables","display_name":"NPG Underground Cables","category":"Network Assets","subcategory":"HV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%cable%","%underground%"],"exclude_patterns":["%overhead%"]},
      {"slug":"npg-overhead","display_name":"NPG Overhead Lines","category":"Network Assets","subcategory":"Overhead Lines","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%overhead%"],"exclude_patterns":[]}
    ]'::jsonb;

  ELSIF p_dno = 'NGED' THEN
    v_rules := '[
      {"slug":"nged-11kv-ohl","display_name":"NGED 11kV Overhead Lines","category":"Network Assets","subcategory":"Overhead Lines","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%11kv_ohl%","%11kv%ohl%"],"exclude_patterns":[]},
      {"slug":"nged-11kv-ug","display_name":"NGED 11kV Underground Cables","category":"Network Assets","subcategory":"HV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%11kv_ug%","%11kv%ug%"],"exclude_patterns":["%ohl%","%pole%","%tower%"]},
      {"slug":"nged-11kv-poles","display_name":"NGED 11kV Poles","category":"Network Assets","subcategory":"Poles","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%11kv_pole%","%11kv%pole%"],"exclude_patterns":[]},
      {"slug":"nged-11kv-towers","display_name":"NGED 11kV Towers","category":"Network Assets","subcategory":"Towers","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%11kv_tower%","%11kv%tower%"],"exclude_patterns":[]},
      {"slug":"nged-11kv-transformers","display_name":"NGED 11kV Transformers","category":"Network Assets","subcategory":"Transformers","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%11kv-transformer%","%11kv%transformer%"],"exclude_patterns":[]},
      {"slug":"nged-33kv-ohl","display_name":"NGED 33kV Overhead Lines","category":"Network Assets","subcategory":"Overhead Lines","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%33kv_ohl%","%33kv%ohl%"],"exclude_patterns":[]},
      {"slug":"nged-33kv-ug","display_name":"NGED 33kV Underground Cables","category":"Network Assets","subcategory":"HV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%33kv_ug%","%33kv%ug%"],"exclude_patterns":["%ohl%","%pole%","%tower%"]},
      {"slug":"nged-33kv-poles","display_name":"NGED 33kV Poles","category":"Network Assets","subcategory":"Poles","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%33kv_pole%","%33kv%pole%"],"exclude_patterns":[]},
      {"slug":"nged-33kv-towers","display_name":"NGED 33kV Towers","category":"Network Assets","subcategory":"Towers","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%33kv_tower%","%33kv%tower%"],"exclude_patterns":[]},
      {"slug":"nged-33kv-transformers","display_name":"NGED 33kV Transformers","category":"Network Assets","subcategory":"Transformers","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%33kv-transformer%","%33kv%transformer%"],"exclude_patterns":[]},
      {"slug":"nged-66kv-ohl","display_name":"NGED 66kV Overhead Lines","category":"Network Assets","subcategory":"Overhead Lines","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%66kv_ohl%","%66kv%ohl%"],"exclude_patterns":[]},
      {"slug":"nged-66kv-ug","display_name":"NGED 66kV Underground Cables","category":"Network Assets","subcategory":"EHV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%66kv_ug%","%66kv%ug%"],"exclude_patterns":["%ohl%","%pole%","%tower%"]},
      {"slug":"nged-66kv-poles","display_name":"NGED 66kV Poles","category":"Network Assets","subcategory":"Poles","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%66kv_pole%","%66kv%pole%"],"exclude_patterns":[]},
      {"slug":"nged-66kv-towers","display_name":"NGED 66kV Towers","category":"Network Assets","subcategory":"Towers","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%66kv_tower%","%66kv%tower%"],"exclude_patterns":[]},
      {"slug":"nged-66kv-gm","display_name":"NGED 66kV Ground Mounted","category":"Network Assets","subcategory":"Switchgear","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%66kv_gm%","%66kv%gm%"],"exclude_patterns":[]},
      {"slug":"nged-132kv-ohl","display_name":"NGED 132kV Overhead Lines","category":"Network Assets","subcategory":"Overhead Lines","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%132kv_ohl%","%132kv%ohl%"],"exclude_patterns":[]},
      {"slug":"nged-132kv-ug","display_name":"NGED 132kV Underground Cables","category":"Network Assets","subcategory":"EHV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%132kv_ug%","%132kv%ug%"],"exclude_patterns":["%ohl%","%pole%","%tower%"]},
      {"slug":"nged-132kv-poles","display_name":"NGED 132kV Poles","category":"Network Assets","subcategory":"Poles","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%132kv_pole%","%132kv%pole%"],"exclude_patterns":[]},
      {"slug":"nged-132kv-towers","display_name":"NGED 132kV Towers","category":"Network Assets","subcategory":"Towers","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%132kv_tower%","%132kv%tower%"],"exclude_patterns":[]},
      {"slug":"nged-132kv-gm","display_name":"NGED 132kV Ground Mounted","category":"Network Assets","subcategory":"Switchgear","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%132kv_gm%","%132kv%gm%"],"exclude_patterns":[]},
      {"slug":"nged-distribution-substations","display_name":"NGED Distribution Substations","category":"Network Assets","subcategory":"Substations","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%distribution-substation%","%distribution_substation%"],"exclude_patterns":["%location%easting%"]},
      {"slug":"nged-substation-locations","display_name":"NGED Substation Locations","category":"Network Assets","subcategory":"Substations","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%substation%location%easting%","%primary-substation-location%"],"exclude_patterns":[]},
      {"slug":"nged-substation-loading","display_name":"NGED Substation Loading","category":"Capacity","subcategory":"Loading","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%substation-loading%","%substation_loading%"],"exclude_patterns":[]},
      {"slug":"nged-network-capacity","display_name":"NGED Network Capacity","category":"Capacity","subcategory":"Headroom","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%network-capacity%","%nged-network-capacity%"],"exclude_patterns":[]},
      {"slug":"nged-ev-capacity","display_name":"NGED EV Capacity","category":"Capacity","subcategory":"EV","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%ev-capacity%"],"exclude_patterns":[]},
      {"slug":"nged-ecr","display_name":"NGED Embedded Capacity Register","category":"Capacity","subcategory":"ECR","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%embedded-capacity%"],"exclude_patterns":[]},
      {"slug":"nged-gcr","display_name":"NGED Generation Capacity Register","category":"Capacity","subcategory":"GCR","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%generation-capacity%"],"exclude_patterns":[]},
      {"slug":"nged-connection-queue","display_name":"NGED Connection Queue","category":"Connections","subcategory":"Queue","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%connection-queue%","%clearview-connect%"],"exclude_patterns":[]},
      {"slug":"nged-dfes","display_name":"NGED DFES Forecasts","category":"Forecasting","subcategory":"DFES","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%dfes%"],"exclude_patterns":[]},
      {"slug":"nged-flexibility","display_name":"NGED Flexibility","category":"Flexibility","subcategory":"Services","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%flexibility%"],"exclude_patterns":[]},
      {"slug":"nged-smart-meter","display_name":"NGED Smart Meter Data","category":"Low Carbon","subcategory":"Smart Meter","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%smart-meter%","%smart_meter%"],"exclude_patterns":[]},
      {"slug":"nged-lct","display_name":"NGED LCT Data","category":"Low Carbon","subcategory":"LCT","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%lct-connection%","%lct-enquir%"],"exclude_patterns":[]},
      {"slug":"nged-ndp","display_name":"NGED Network Development Plan","category":"Capacity","subcategory":"NDP","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%network-development-plan%","%system-planning%ndp%"],"exclude_patterns":[]},
      {"slug":"nged-dnoa","display_name":"NGED DNOA","category":"Capacity","subcategory":"DNOA","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%dnoa%","%distribution-network-option%"],"exclude_patterns":[]},
      {"slug":"nged-spatial-datasets","display_name":"NGED Spatial Datasets","category":"Boundaries","subcategory":"Service Areas","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%spatial-dataset%"],"exclude_patterns":[]},
      {"slug":"nged-live-data","display_name":"NGED Live Data","category":"Capacity","subcategory":"Live","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%live-data%","%live-bsp%","%live-gsp%","%live-primary%"],"exclude_patterns":["%power-cut%"]},
      {"slug":"nged-transformer-flows","display_name":"NGED Transformer Flows","category":"Capacity","subcategory":"Flows","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%transformer-flow%","%bsp-transformer%","%primary-transformer%","%super-grid-transformer%"],"exclude_patterns":[]}
    ]'::jsonb;

  ELSE
    RETURN json_build_object('error', 'No rules defined for DNO: ' || p_dno);
  END IF;

  FOR v_dataset IN
    SELECT id, dataset_id, title, geometry_type, geometry_field
    FROM dno_dataset_registry
    WHERE dno = p_dno
      AND is_geospatial = true
      AND (p_force OR linked_layer_id IS NULL)
    ORDER BY record_count DESC
  LOOP
    v_matched := false;

    FOR v_rule IN SELECT * FROM jsonb_array_elements(v_rules)
    LOOP
      v_excluded := false;
      IF v_rule->'exclude_patterns' IS NOT NULL AND jsonb_array_length(v_rule->'exclude_patterns') > 0 THEN
        FOR v_exclude_pattern IN SELECT jsonb_array_elements_text(v_rule->'exclude_patterns')
        LOOP
          IF lower(v_dataset.dataset_id) LIKE v_exclude_pattern OR lower(COALESCE(v_dataset.title, '')) LIKE v_exclude_pattern THEN
            v_excluded := true;
            EXIT;
          END IF;
        END LOOP;
      END IF;

      IF v_excluded THEN
        CONTINUE;
      END IF;

      FOR v_match_pattern IN SELECT jsonb_array_elements_text(v_rule->'match_patterns')
      LOOP
        IF lower(v_dataset.dataset_id) LIKE v_match_pattern OR lower(COALESCE(v_dataset.title, '')) LIKE v_match_pattern THEN
          v_matched := true;
          EXIT;
        END IF;
      END LOOP;

      IF v_matched THEN
        INSERT INTO layer_registry (slug, display_name, dno, category, subcategory, geometry_type, storage_table, style_json, legend_json)
        VALUES (
          v_rule->>'slug',
          v_rule->>'display_name',
          p_dno,
          v_rule->>'category',
          v_rule->>'subcategory',
          v_rule->>'geometry_type',
          v_rule->>'storage_table',
          '{}'::jsonb,
          '[]'::jsonb
        )
        ON CONFLICT (slug) DO UPDATE SET updated_at = now()
        RETURNING id INTO v_layer_id;

        IF FOUND AND v_layer_id IS NOT NULL THEN
          IF (SELECT created_at FROM layer_registry WHERE id = v_layer_id) >= now() - interval '2 seconds' THEN
            v_layers_created := v_layers_created + 1;
          ELSE
            v_layers_reused := v_layers_reused + 1;
          END IF;

          UPDATE dno_dataset_registry
          SET linked_layer_id = v_layer_id,
              geometry_type = COALESCE(v_rule->>'geometry_type', dno_dataset_registry.geometry_type),
              storage_table = COALESCE(v_rule->>'storage_table', dno_dataset_registry.storage_table),
              active = true,
              updated_at = now()
          WHERE id = v_dataset.id;

          v_datasets_linked := v_datasets_linked + 1;
        END IF;

        EXIT;
      END IF;
    END LOOP;

    IF NOT v_matched THEN
      v_unmatched := array_append(v_unmatched, COALESCE(v_dataset.title, v_dataset.dataset_id));
      v_datasets_skipped := v_datasets_skipped + 1;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'layers_created', v_layers_created,
    'layers_reused', v_layers_reused,
    'datasets_linked', v_datasets_linked,
    'datasets_skipped', v_datasets_skipped,
    'unmatched', v_unmatched
  );
END;
$$;