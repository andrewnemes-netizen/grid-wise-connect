
CREATE OR REPLACE FUNCTION public.auto_create_dno_layers(
  p_dno text,
  p_force boolean DEFAULT false
)
RETURNS jsonb
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
  v_unmatched jsonb := '[]'::jsonb;
  v_matched_ids uuid[] := '{}';
  v_ds record;
  v_pattern text;
  v_excluded boolean;
  v_exclude text;
  v_matched boolean;
  v_existing_id uuid;
BEGIN
  IF p_dno = 'ENWL' THEN
    v_rules := '[
      {
        "priority": 1,
        "target_slug": "enwl_substations",
        "target_name": "ENWL Substations",
        "category": "Network",
        "subcategory": "substations",
        "geometry_type": "Point",
        "storage_table": "geo_substations",
        "match_patterns": ["enwl-boundary-flow-bsp-xy","enwl-boundary-flow-gsp-xy","enwl-substation","sp-enw-capital-projects-investment-map","dfes-2024-bsp-sites","dfes-2024-primary-sites","sp-enw-substation-hierarchy"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 2,
        "target_slug": "enwl_substation_catchments",
        "target_name": "ENWL Substation Catchments",
        "category": "Network",
        "subcategory": "boundaries",
        "geometry_type": "Polygon",
        "storage_table": "geo_polygons",
        "match_patterns": ["enwl-substation-bsp-polygons","enwl-substation-gsp-polygons","enwl-substation-primary-polygons","enwl-substation-dso-bsp-polygons","enwl-substation-dso-gsp-polygons","enwl-substation-dso-primary-polygons"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 3,
        "target_slug": "enwl_ecr",
        "target_name": "ENWL Embedded Capacity Register",
        "category": "Capacity",
        "subcategory": "embedded_capacity",
        "geometry_type": "Point",
        "storage_table": "geo_substations",
        "match_patterns": ["enwl-embedded-capacity-register-%"],
        "match_type": "ilike",
        "exclude_patterns": []
      },
      {
        "priority": 4,
        "target_slug": "enwl_capacity_heatmap",
        "target_name": "ENWL Capacity Heatmap",
        "category": "Capacity",
        "subcategory": "heatmap",
        "geometry_type": "Polygon",
        "storage_table": "geo_polygons",
        "match_patterns": ["enwl-bsp-heatmap","enwl-gsp-heatmap","enwl-pry-heatmap"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 5,
        "target_slug": "enwl_hv_capacity_11kv",
        "target_name": "ENWL HV Capacity (11kV)",
        "category": "Capacity",
        "subcategory": "hv_network",
        "geometry_type": "Polygon",
        "storage_table": "geo_polygons",
        "match_patterns": ["sp-enw-capacity-11kv-network"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 6,
        "target_slug": "enwl_hv_capacity_6_6kv",
        "target_name": "ENWL HV Capacity (6.6kV)",
        "category": "Capacity",
        "subcategory": "hv_network",
        "geometry_type": "Polygon",
        "storage_table": "geo_polygons",
        "match_patterns": ["sp-enw-capacity-6-6kv-network"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 7,
        "target_slug": "enwl_distribution_tx",
        "target_name": "ENWL Distribution TX Capacity",
        "category": "Capacity",
        "subcategory": "distribution",
        "geometry_type": "Polygon",
        "storage_table": "geo_polygons",
        "match_patterns": ["sp-enw-capacity-distribution-tx"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 8,
        "target_slug": "enwl_overhead_conductors",
        "target_name": "ENWL Overhead Conductors",
        "category": "Network",
        "subcategory": "cables",
        "geometry_type": "LineString",
        "geometry_override": true,
        "storage_table": "geo_cables",
        "match_patterns": ["enwl-11kv-overhead-conductors","enwl-33kv-overhead-conductors","enwl-132kv-overhead-conductors","enwl-6-6kv-overhead-conductors","enwl-lv-overhead-conductors"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 9,
        "target_slug": "enwl_ndp_headroom",
        "target_name": "ENWL NDP Headroom",
        "category": "Capacity",
        "subcategory": "ndp",
        "geometry_type": "Point",
        "storage_table": "geo_substations",
        "match_patterns": ["ndp-pry-bsp-generation","ndp-pry-bsp-headroom"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 10,
        "target_slug": "enwl_ndp_voronoi",
        "target_name": "ENWL NDP Voronoi Catchments",
        "category": "Capacity",
        "subcategory": "ndp",
        "geometry_type": "Polygon",
        "storage_table": "geo_polygons",
        "match_patterns": ["ndp-bsp-voronoi","ndp-pry-voronoi"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 11,
        "target_slug": "enwl_dfes_forecasts",
        "target_name": "ENWL DFES Forecasts",
        "category": "Capacity",
        "subcategory": "forecast",
        "geometry_type": "Point",
        "storage_table": "geo_substations",
        "match_patterns": ["dfes-2023-%","dfes-lv-headroom-%","dfes-lv-peak-demand-%","lv_load_duration"],
        "match_type": "ilike",
        "exclude_patterns": ["dfes-2024-bsp-sites","dfes-2024-primary-sites"]
      },
      {
        "priority": 12,
        "target_slug": "enwl_dfes_polygons",
        "target_name": "ENWL DFES Polygons",
        "category": "Capacity",
        "subcategory": "forecast",
        "geometry_type": "Polygon",
        "storage_table": "geo_polygons",
        "match_patterns": ["dfes-bsp-polygons","dfes-primary-polygons","enwl_dfes_county_polygons","enwl_dfes_local_authority_polygons"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 13,
        "target_slug": "enwl_connection_queue",
        "target_name": "ENWL Connection Queue",
        "category": "Planning",
        "subcategory": "queue",
        "geometry_type": "Polygon",
        "storage_table": "geo_polygons",
        "match_patterns": ["enwl-gsp-connection-queue"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 14,
        "target_slug": "enwl_service_areas",
        "target_name": "ENWL Service Areas",
        "category": "Network",
        "subcategory": "boundaries",
        "geometry_type": "Polygon",
        "storage_table": "geo_polygons",
        "match_patterns": ["enwl-control-areas","enwl_control_boundary","general-boundary","sp-enw-gis-idno-polygons","enwl-lsoa-polygons"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 15,
        "target_slug": "enwl_flexibility",
        "target_name": "ENWL Flexibility Sites",
        "category": "Planning",
        "subcategory": "flexibility",
        "geometry_type": "Polygon",
        "storage_table": "geo_polygons",
        "match_patterns": ["enwl-flexibility-tender-site-requirements","enwl-historical-flexibility-tender-site-requirements","sp-enw-flexibility-monthly-tender-site-requirements","enwl-flexibility-tender-postcode-data"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 16,
        "target_slug": "enwl_ev_registrations",
        "target_name": "ENWL EV Registrations",
        "category": "Environmental",
        "subcategory": "ev",
        "geometry_type": "Polygon",
        "storage_table": "geo_polygons",
        "match_patterns": ["enwl-area-dvla-ev-registration-data-per-lsoa"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 17,
        "target_slug": "enwl_lct_data",
        "target_name": "ENWL LCT Data",
        "category": "Environmental",
        "subcategory": "lct",
        "geometry_type": "Point",
        "storage_table": "geo_points",
        "match_patterns": ["sp-enw-lct-low-carbon-technology-readiness-checker","mcs-lct-per-enwl-substation","smart-meter-installation","enwl-lsoa-polygons-looped-service-count"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 18,
        "target_slug": "enwl_env_constraints",
        "target_name": "ENWL Environmental Constraints",
        "category": "Environmental",
        "subcategory": "constraints",
        "geometry_type": "Polygon",
        "storage_table": "geo_constraints",
        "match_patterns": ["sp-enw-external-data-areas-of-outstanding-natural-beauty-aonb","sp-enw-external-data-flood-risk","sp-enw-external-data-national-parks","sp-enw-external-data-sites-of-special-scientific-interest-sssi","enwl-lake-district-national-park-polygon"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 19,
        "target_slug": "enwl_biodiversity",
        "target_name": "ENWL Biodiversity",
        "category": "Environmental",
        "subcategory": "biodiversity",
        "geometry_type": "Polygon",
        "storage_table": "geo_polygons",
        "match_patterns": ["biodiversity-%"],
        "match_type": "ilike",
        "exclude_patterns": []
      },
      {
        "priority": 20,
        "target_slug": "enwl_operational",
        "target_name": "ENWL Operational Data",
        "category": "Network",
        "subcategory": "operational",
        "geometry_type": "Point",
        "storage_table": "geo_points",
        "match_patterns": ["live_incidents","psi","unplanned-outages"],
        "match_type": "exact",
        "exclude_patterns": []
      },
      {
        "priority": 21,
        "target_slug": "enwl_uva",
        "target_name": "ENWL Underground & Overhead Assets (UVA)",
        "category": "Network",
        "subcategory": "cables",
        "geometry_type": "Polygon",
        "storage_table": "geo_polygons",
        "match_patterns": ["uva_cable_installed","uva_conductor"],
        "match_type": "exact",
        "exclude_patterns": []
      }
    ]'::jsonb;
  ELSIF p_dno = 'NPG' THEN
    RETURN jsonb_build_object(
      'dno', p_dno,
      'error', 'NPG auto-link rules not yet configured. Use manual linking.',
      'layers_created', 0, 'layers_reused', 0,
      'datasets_linked', 0, 'datasets_skipped', 0,
      'unmatched', '[]'::jsonb
    );
  ELSE
    RETURN jsonb_build_object(
      'dno', p_dno,
      'error', format('No auto-link rules configured for DNO: %s', p_dno),
      'layers_created', 0, 'layers_reused', 0,
      'datasets_linked', 0, 'datasets_skipped', 0,
      'unmatched', '[]'::jsonb
    );
  END IF;

  FOR v_rule IN SELECT value FROM jsonb_array_elements(v_rules) ORDER BY (value->>'priority')::int
  LOOP
    v_rule := v_rule.value;
    SELECT id INTO v_existing_id FROM layer_registry WHERE slug = v_rule->>'target_slug';

    IF v_existing_id IS NOT NULL THEN
      v_layer_id := v_existing_id;
      UPDATE layer_registry SET updated_at = now() WHERE id = v_layer_id;
      v_layers_reused := v_layers_reused + 1;
    ELSE
      INSERT INTO layer_registry (
        slug, display_name, dno, category, subcategory,
        geometry_type, storage_table, style_json, legend_json,
        enabled, visible_by_default, attribution
      ) VALUES (
        v_rule->>'target_slug',
        v_rule->>'target_name',
        p_dno,
        v_rule->>'category',
        v_rule->>'subcategory',
        v_rule->>'geometry_type',
        v_rule->>'storage_table',
        '{}'::jsonb, '[]'::jsonb,
        true, false,
        format('Auto-created from %s registry', p_dno)
      )
      RETURNING id INTO v_layer_id;
      v_layers_created := v_layers_created + 1;
    END IF;

    IF (v_rule->>'match_type') = 'exact' THEN
      FOR v_ds IN
        SELECT id, dataset_id, title
        FROM dno_dataset_registry
        WHERE dno = p_dno AND is_geospatial = true
          AND (linked_layer_id IS NULL OR p_force)
          AND NOT (id = ANY(v_matched_ids))
          AND dataset_id = ANY(SELECT jsonb_array_elements_text(v_rule->'match_patterns'))
      LOOP
        v_excluded := false;
        IF jsonb_array_length(COALESCE(v_rule->'exclude_patterns', '[]'::jsonb)) > 0 THEN
          FOR v_exclude IN SELECT jsonb_array_elements_text(v_rule->'exclude_patterns')
          LOOP
            IF v_ds.dataset_id = v_exclude THEN v_excluded := true; EXIT; END IF;
          END LOOP;
        END IF;

        IF NOT v_excluded THEN
          UPDATE dno_dataset_registry
          SET linked_layer_id = v_layer_id,
              storage_table = v_rule->>'storage_table',
              geometry_type = CASE WHEN (v_rule->>'geometry_override')::boolean IS TRUE THEN v_rule->>'geometry_type' ELSE geometry_type END,
              updated_at = now()
          WHERE id = v_ds.id;
          v_matched_ids := v_matched_ids || v_ds.id;
          v_datasets_linked := v_datasets_linked + 1;
        END IF;
      END LOOP;

    ELSIF (v_rule->>'match_type') = 'ilike' THEN
      FOR v_ds IN
        SELECT id, dataset_id, title
        FROM dno_dataset_registry
        WHERE dno = p_dno AND is_geospatial = true
          AND (linked_layer_id IS NULL OR p_force)
          AND NOT (id = ANY(v_matched_ids))
      LOOP
        v_matched := false;
        v_excluded := false;

        IF jsonb_array_length(COALESCE(v_rule->'exclude_patterns', '[]'::jsonb)) > 0 THEN
          FOR v_exclude IN SELECT jsonb_array_elements_text(v_rule->'exclude_patterns')
          LOOP
            IF v_ds.dataset_id = v_exclude OR v_ds.dataset_id ILIKE v_exclude THEN v_excluded := true; EXIT; END IF;
          END LOOP;
        END IF;

        IF NOT v_excluded THEN
          FOR v_pattern IN SELECT jsonb_array_elements_text(v_rule->'match_patterns')
          LOOP
            IF v_ds.dataset_id ILIKE v_pattern THEN v_matched := true; EXIT; END IF;
          END LOOP;

          IF v_matched THEN
            UPDATE dno_dataset_registry
            SET linked_layer_id = v_layer_id,
                storage_table = v_rule->>'storage_table',
                geometry_type = CASE WHEN (v_rule->>'geometry_override')::boolean IS TRUE THEN v_rule->>'geometry_type' ELSE geometry_type END,
                updated_at = now()
            WHERE id = v_ds.id;
            v_matched_ids := v_matched_ids || v_ds.id;
            v_datasets_linked := v_datasets_linked + 1;
          END IF;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  FOR v_ds IN
    SELECT id, dataset_id, title
    FROM dno_dataset_registry
    WHERE dno = p_dno AND is_geospatial = true
      AND linked_layer_id IS NULL
      AND NOT (id = ANY(v_matched_ids))
    ORDER BY dataset_id
  LOOP
    v_unmatched := v_unmatched || jsonb_build_object('dataset_id', v_ds.dataset_id, 'title', v_ds.title);
  END LOOP;

  IF NOT p_force THEN
    SELECT count(*) INTO v_datasets_skipped
    FROM dno_dataset_registry
    WHERE dno = p_dno AND is_geospatial = true
      AND linked_layer_id IS NOT NULL
      AND NOT (id = ANY(v_matched_ids));
  END IF;

  RETURN jsonb_build_object(
    'dno', p_dno,
    'layers_created', v_layers_created,
    'layers_reused', v_layers_reused,
    'datasets_linked', v_datasets_linked,
    'datasets_skipped', v_datasets_skipped,
    'unmatched', v_unmatched
  );
END;
$$;
