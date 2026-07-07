
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
  v_reused int := 0;
  v_linked int := 0;
  v_skipped int := 0;
  v_matched boolean;
  v_excluded boolean;
  v_pattern text;
  v_unmatched text[] := '{}';
  v_rule_slug text;
  v_is_dx boolean;
  v_has_ingest_endpoint boolean;
BEGIN
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
      {"slug":"ssen-dx-gis-network-lines","display_name":"SSEN DX - GIS Network Lines","category":"Electrical Assets","subcategory":"Network Lines","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%gis_network_line%","%gis network line%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-substation-data","display_name":"SSEN DX - Substation Data","category":"Electrical Assets","subcategory":"Substations","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%ssen-substation-data%","%ssen substation data%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-primary-supply-areas","display_name":"SSEN DX - Primary Substation Supply Areas","category":"Boundaries","subcategory":"Primary Supply Areas","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%primary-substation-boundaries%","%primary substation%supply area%","%primary substation electricity supply area%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-secondary-supply-areas","display_name":"SSEN DX - Secondary Substation Supply Areas","category":"Boundaries","subcategory":"Secondary Supply Areas","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%secondary-substation-esa%","%secondary substation%supply area%","%secondary substation electricity supply area%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-gsp-bsp-supply-areas","display_name":"SSEN DX - GSP & BSP Supply Areas","category":"Boundaries","subcategory":"GSP/BSP","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%grid-supply-point-gsp-bulk-supply-point%","%gsp%bsp%supply area%","%bulk supply point%","%grid supply point%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-licence-area","display_name":"SSEN DX - Distribution Licence Area Boundaries","category":"Boundaries","subcategory":"Licence Areas","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%distribution-licence-area%","%licence area boundaries%","%distribution licence area%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-smart-meter-lv-feeder","display_name":"SSEN DX - Smart Meter LV Feeder Usage","category":"Performance","subcategory":"Smart Meter","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%smart_meter_prod_lv_feeder%","%smart meter%lv feeder%","%lv feeder usage%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-embedded-capacity-register","display_name":"SSEN DX - Embedded Capacity Register","category":"Network","subcategory":"Connected Generation","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%embedded_capacity_register%","%embedded capacity register%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-nafirs-hv-faults","display_name":"SSEN DX - NaFIRS HV Faults","category":"Performance","subcategory":"HV Faults","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%nafirs-hv-faults%","%nafirs hv faults%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-nafirs-lv-faults","display_name":"SSEN DX - NaFIRS LV Faults","category":"Performance","subcategory":"LV Faults","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%nafirs-lv-faults%","%nafirs lv faults%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-low-carbon-connections","display_name":"SSEN DX - Low Carbon Technology Connections","category":"Network","subcategory":"LCT Connections","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%low-carbon-technology-connections%","%low carbon technolog%connection%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-generation-availability","display_name":"SSEN DX - Generation Availability & Network Capacity","category":"Network","subcategory":"Capacity","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%generation-availability-and-network-capacity%","%generation availability%network capacity%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-realtime-outages","display_name":"SSEN DX - Real Time Outages","category":"Performance","subcategory":"Outages","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%realtime_outage%","%real time outage%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-anm","display_name":"SSEN DX - Active Network Management Zones","category":"Network","subcategory":"ANM","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%active_network_management%","%active network management%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-gsp-technical-limits","display_name":"SSEN DX - GSP Technical Limits","category":"Network","subcategory":"GSP Limits","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%technicallimits%","%gsp technical limits%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-dfes","display_name":"SSEN DX - Distribution Future Energy Scenarios","category":"Network","subcategory":"DFES","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%low_carbon_technologies%","%distribution future energy scenarios%","%dfes%"],"exclude_patterns":[]},
      {"slug":"ssen-dx-ndp","display_name":"SSEN DX - Network Development Reports","category":"Planning","subcategory":"NDP","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%network_development_report%","%network development report%"],"exclude_patterns":[]}
    ]'::jsonb;
  ELSIF p_dno = 'UKPN' THEN
    v_rules := '[
      {"slug":"ukpn-lv-cables","display_name":"UKPN LV Underground Cables","category":"Electrical Assets","subcategory":"LV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lv%cable%","%low%voltage%cable%","%lv-underground%"],"exclude_patterns":["%hv%","%ehv%"]},
      {"slug":"ukpn-hv-cables","display_name":"UKPN HV Underground Cables","category":"Electrical Assets","subcategory":"HV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hv%cable%","%11kv%cable%","%hv-underground%"],"exclude_patterns":["%lv%","%ehv%","%132%"]},
      {"slug":"ukpn-ehv-cables","display_name":"UKPN EHV Underground Cables","category":"Electrical Assets","subcategory":"EHV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%ehv%cable%","%33kv%cable%","%66kv%cable%","%ehv-underground%","%132kv%cable%"],"exclude_patterns":["%lv%","%hv%"]},
      {"slug":"ukpn-substations","display_name":"UKPN Substations","category":"Electrical Assets","subcategory":"Substations","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%substation%","%primary%","%bsp%","%grid%supply%"],"exclude_patterns":[]},
      {"slug":"ukpn-fault-data","display_name":"UKPN Fault Data","category":"Performance","subcategory":"Faults","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%fault%","%interruption%","%outage%"],"exclude_patterns":[]}
    ]'::jsonb;
  ELSIF p_dno = 'NIE' THEN
    v_rules := '[
      {"slug":"nie-lv-cables","display_name":"NIE LV Underground Cables","category":"Electrical Assets","subcategory":"LV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lv%cable%","%lv-underground%","%low%voltage%cable%"],"exclude_patterns":["%hv%","%ehv%","%33kv%","%110kv%"]},
      {"slug":"nie-hv-cables","display_name":"NIE HV Underground Cables","category":"Electrical Assets","subcategory":"HV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hv%cable%","%11kv%cable%","%hv-underground%","%6.6kv%cable%"],"exclude_patterns":["%lv%","%ehv%","%33kv%","%110kv%"]},
      {"slug":"nie-ehv-cables","display_name":"NIE EHV Underground Cables","category":"Electrical Assets","subcategory":"EHV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%ehv%cable%","%33kv%cable%","%110kv%cable%","%ehv-underground%"],"exclude_patterns":["%lv%","%hv%"]},
      {"slug":"nie-overhead-lv","display_name":"NIE LV Overhead Lines","category":"Electrical Assets","subcategory":"OHL LV","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lv%overhead%","%lv%ohl%"],"exclude_patterns":["%hv%","%ehv%"]},
      {"slug":"nie-overhead-hv","display_name":"NIE HV Overhead Lines","category":"Electrical Assets","subcategory":"OHL HV","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hv%overhead%","%hv%ohl%","%11kv%overhead%"],"exclude_patterns":["%lv%","%ehv%","%33kv%","%110kv%"]},
      {"slug":"nie-overhead-ehv","display_name":"NIE EHV Overhead Lines","category":"Electrical Assets","subcategory":"OHL EHV","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%ehv%overhead%","%33kv%overhead%","%110kv%overhead%","%ehv%ohl%"],"exclude_patterns":["%lv%","%hv %"]},
      {"slug":"nie-poles","display_name":"NIE Poles","category":"Electrical Assets","subcategory":"Poles","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%pole%"],"exclude_patterns":["%tower%"]},
      {"slug":"nie-towers","display_name":"NIE Towers","category":"Electrical Assets","subcategory":"Towers","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%tower%","%pylon%"],"exclude_patterns":[]},
      {"slug":"nie-substations","display_name":"NIE Substations","category":"Electrical Assets","subcategory":"Substations","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%substation%","%primary%","%grid%supply%","%bulk%supply%"],"exclude_patterns":["%boundary%","%supply%area%"]},
      {"slug":"nie-transformers","display_name":"NIE Transformers","category":"Electrical Assets","subcategory":"Transformers","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%transformer%"],"exclude_patterns":["%earthing%transformer%"]},
      {"slug":"nie-earthing-transformers","display_name":"NIE Earthing Transformers","category":"Electrical Assets","subcategory":"Earthing","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%earthing%transformer%","%earthing-transformer%"],"exclude_patterns":[]},
      {"slug":"nie-switchgear-lv","display_name":"NIE LV Switchgear","category":"Electrical Assets","subcategory":"LV Switchgear","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%lv%switchgear%","%lv-switchgear%"],"exclude_patterns":["%hv%","%ehv%"]},
      {"slug":"nie-switchgear-hv","display_name":"NIE HV Switchgear","category":"Electrical Assets","subcategory":"HV Switchgear","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%hv%switchgear%","%hv-switchgear%","%11kv%switchgear%"],"exclude_patterns":["%lv%","%ehv%"]},
      {"slug":"nie-switchgear-ehv","display_name":"NIE EHV Switchgear","category":"Electrical Assets","subcategory":"EHV Switchgear","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%ehv%switchgear%","%33kv%switchgear%","%110kv%switchgear%"],"exclude_patterns":["%lv%","%hv %"]},
      {"slug":"nie-circuit-breakers","display_name":"NIE Circuit Breakers","category":"Electrical Assets","subcategory":"Circuit Breakers","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%circuit%breaker%","%circuit-breaker%"],"exclude_patterns":[]},
      {"slug":"nie-capacitor-banks","display_name":"NIE Capacitor Banks","category":"Electrical Assets","subcategory":"Capacitor Banks","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%capacitor%bank%","%capacitor-bank%"],"exclude_patterns":[]},
      {"slug":"nie-tap-changers","display_name":"NIE Distribution Tap Changers","category":"Electrical Assets","subcategory":"Tap Changers","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%tap%changer%","%tap-changer%"],"exclude_patterns":[]},
      {"slug":"nie-lners","display_name":"NIE Liquid Neutral Earthing Resistors (LNERs)","category":"Electrical Assets","subcategory":"LNERs","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%liquid%neutral%earthing%","%lners%","%-lners%"],"exclude_patterns":[]},
      {"slug":"nie-fuses","display_name":"NIE Fuses","category":"Electrical Assets","subcategory":"Fuses","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%fuse%"],"exclude_patterns":[]},
      {"slug":"nie-reclosers","display_name":"NIE Reclosers / Auto-reclosers","category":"Electrical Assets","subcategory":"Reclosers","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%recloser%","%auto%recloser%"],"exclude_patterns":[]},
      {"slug":"nie-connections","display_name":"NIE Connections & Generation","category":"Network","subcategory":"Connections","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%connection%","%generation%","%embedded%capacity%"],"exclude_patterns":[]},
      {"slug":"nie-faults","display_name":"NIE Faults & Outages","category":"Performance","subcategory":"Faults","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%fault%","%outage%","%interruption%"],"exclude_patterns":[]},
      {"slug":"nie-supply-areas","display_name":"NIE Substation Supply Areas","category":"Boundaries","subcategory":"Supply Areas","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%supply%area%","%boundary%","%boundaries%"],"exclude_patterns":[]},
      {"slug":"nie-assets-other","display_name":"NIE Other Network Assets","category":"Electrical Assets","subcategory":"Other","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%nie-networks-assets-%"],"exclude_patterns":[]}
    ]'::jsonb;
  ELSE
    RETURN json_build_object('error', 'No rules defined for DNO: ' || p_dno);
  END IF;

  FOR v_rule IN SELECT * FROM jsonb_array_elements(v_rules) LOOP
    SELECT id INTO v_layer_id FROM layer_registry WHERE slug = v_rule->>'slug';
    IF v_layer_id IS NULL THEN
      INSERT INTO layer_registry (slug, display_name, category, subcategory, geometry_type, storage_table, dno, source_type, enabled)
      VALUES (v_rule->>'slug', v_rule->>'display_name', v_rule->>'category', v_rule->>'subcategory', v_rule->>'geometry_type', v_rule->>'storage_table', p_dno, 'opendata', true)
      RETURNING id INTO v_layer_id;
      v_created := v_created + 1;
    ELSE
      UPDATE layer_registry
      SET geometry_type = v_rule->>'geometry_type', storage_table = v_rule->>'storage_table', updated_at = now()
      WHERE id = v_layer_id
        AND (geometry_type IS DISTINCT FROM v_rule->>'geometry_type' OR storage_table IS DISTINCT FROM v_rule->>'storage_table');
      v_reused := v_reused + 1;
    END IF;
  END LOOP;

  FOR v_dataset IN
    SELECT id, dataset_id, title, linked_layer_id, storage_table, geometry_type, endpoint_records, endpoint_export_csv, endpoint_export_geojson
    FROM dno_dataset_registry
    WHERE dno = p_dno
  LOOP
    v_is_dx := (lower(v_dataset.dataset_id) LIKE 'dx-%');
    v_matched := false;
    v_has_ingest_endpoint := COALESCE(v_dataset.endpoint_export_geojson, v_dataset.endpoint_export_csv, v_dataset.endpoint_records) IS NOT NULL;

    FOR v_rule IN SELECT * FROM jsonb_array_elements(v_rules) LOOP
      v_rule_slug := v_rule->>'slug';
      IF p_dno = 'SSEN' THEN
        IF v_is_dx AND v_rule_slug NOT LIKE 'ssen-dx-%' THEN CONTINUE; END IF;
        IF NOT v_is_dx AND v_rule_slug LIKE 'ssen-dx-%' THEN CONTINUE; END IF;
      END IF;

      v_excluded := false;
      FOR v_pattern IN SELECT jsonb_array_elements_text(v_rule->'exclude_patterns') LOOP
        IF lower(v_dataset.dataset_id) LIKE v_pattern OR lower(COALESCE(v_dataset.title,'')) LIKE v_pattern THEN
          v_excluded := true; EXIT;
        END IF;
      END LOOP;
      IF v_excluded THEN CONTINUE; END IF;

      FOR v_pattern IN SELECT jsonb_array_elements_text(v_rule->'match_patterns') LOOP
        IF lower(v_dataset.dataset_id) LIKE v_pattern OR lower(COALESCE(v_dataset.title,'')) LIKE v_pattern THEN
          v_matched := true; EXIT;
        END IF;
      END LOOP;

      IF v_matched THEN
        SELECT id INTO v_layer_id FROM layer_registry WHERE slug = v_rule_slug;
        IF p_force OR v_dataset.linked_layer_id IS DISTINCT FROM v_layer_id OR v_dataset.storage_table IS DISTINCT FROM (v_rule->>'storage_table') OR v_dataset.geometry_type IS DISTINCT FROM (v_rule->>'geometry_type') THEN
          UPDATE dno_dataset_registry
          SET linked_layer_id = v_layer_id,
              active = v_has_ingest_endpoint,
              geometry_type = v_rule->>'geometry_type',
              storage_table = v_rule->>'storage_table',
              is_geospatial = true,
              last_sync_status = CASE WHEN v_has_ingest_endpoint THEN last_sync_status ELSE 'skipped' END,
              last_sync_error = CASE WHEN v_has_ingest_endpoint THEN last_sync_error ELSE 'No ingestable source resource available for this catalogue entry' END,
              updated_at = now()
          WHERE id = v_dataset.id;
          v_linked := v_linked + 1;
        ELSE
          v_skipped := v_skipped + 1;
        END IF;
        EXIT;
      END IF;
    END LOOP;

    IF NOT v_matched THEN
      v_unmatched := array_append(v_unmatched, json_build_object('dataset_id', v_dataset.dataset_id, 'title', v_dataset.title)::text);
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RETURN json_build_object(
    'success', true, 'dno', p_dno,
    'layers_created', v_created, 'layers_reused', v_reused,
    'datasets_linked', v_linked, 'datasets_skipped', v_skipped,
    'unmatched', v_unmatched
  );
END;
$function$;
