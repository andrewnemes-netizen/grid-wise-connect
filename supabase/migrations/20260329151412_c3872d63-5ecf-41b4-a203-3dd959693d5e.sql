
CREATE OR REPLACE FUNCTION public.auto_create_dno_layers(p_dno text, p_force boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_is_gas boolean := false;
BEGIN
  -- Determine if this is a gas operator
  IF p_dno IN ('CADENT', 'NGN', 'SGN', 'WWU') THEN
    v_is_gas := true;
  END IF;

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
      {"slug":"enwl-service-areas","display_name":"ENWL Service Areas","category":"Boundaries","subcategory":"Service Areas","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%licence%area%","%service-area%","%supply%area%","%dso%primary%polygon%"],"exclude_patterns":[]},
      {"slug":"enwl-flexibility","display_name":"ENWL Flexibility Sites","category":"Flexibility","subcategory":"Services","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%flexibility%","%flex%"],"exclude_patterns":[]},
      {"slug":"enwl-lv-network","display_name":"ENWL LV Network","category":"Network Assets","subcategory":"LV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lv%underground%","%lv-ug%","%low-voltage%"],"exclude_patterns":["%overhead%"]},
      {"slug":"enwl-ehv-network","display_name":"ENWL EHV Network","category":"Network Assets","subcategory":"EHV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%33kv%","%ehv%","%extra-high%"],"exclude_patterns":["%overhead%"]},
      {"slug":"enwl-ev-data","display_name":"ENWL EV Data","category":"Low Carbon","subcategory":"EV","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%ev-%","%electric-vehicle%","%charge-point%"],"exclude_patterns":[]},
      {"slug":"enwl-smart-meter","display_name":"ENWL Smart Meter Data","category":"Low Carbon","subcategory":"Smart Meter","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%smart-meter%","%smart_meter%"],"exclude_patterns":[]},
      {"slug":"enwl-lct","display_name":"ENWL LCT Data","category":"Low Carbon","subcategory":"LCT","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%lct%","%low-carbon%","%heat-pump%","%solar%","%generation%"],"exclude_patterns":["%dfes%"]},
      {"slug":"enwl-connections","display_name":"ENWL Connection Data","category":"Connections","subcategory":"Queue","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%connection%queue%","%connection%offer%","%accepted-connection%"],"exclude_patterns":[]},
      {"slug":"enwl-network-capacity","display_name":"ENWL Network Capacity","category":"Capacity","subcategory":"Headroom","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%network%capacity%","%capacity%map%","%headroom%"],"exclude_patterns":["%embedded%","%heatmap%"]},
      {"slug":"enwl-fault-data","display_name":"ENWL Fault Data","category":"Performance","subcategory":"Faults","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%fault%","%interruption%","%outage%","%power-cut%"],"exclude_patterns":[]},
      {"slug":"enwl-catchment","display_name":"ENWL Substation Catchments","category":"Boundaries","subcategory":"Catchments","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%catchment%"],"exclude_patterns":[]},
      {"slug":"enwl-reinforcement","display_name":"ENWL Reinforcement Projects","category":"Capacity","subcategory":"Reinforcement","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%reinforcement%","%network-investment%"],"exclude_patterns":[]}
    ]'::jsonb;

  ELSIF p_dno = 'SPEN' THEN
    v_rules := '[
      {"slug":"spen-substations","display_name":"SPEN Substations","category":"Network Assets","subcategory":"Substations","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%substation%"],"exclude_patterns":["%polygon%","%catchment%","%loading%","%headroom%"]},
      {"slug":"spen-cables-hv","display_name":"SPEN HV Cables","category":"Network Assets","subcategory":"HV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hv%cable%","%11kv%cable%","%hv%underground%"],"exclude_patterns":["%overhead%"]},
      {"slug":"spen-cables-ehv","display_name":"SPEN EHV Cables","category":"Network Assets","subcategory":"EHV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%ehv%cable%","%33kv%cable%"],"exclude_patterns":["%overhead%"]},
      {"slug":"spen-overhead","display_name":"SPEN Overhead Lines","category":"Network Assets","subcategory":"Overhead Lines","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%overhead%"],"exclude_patterns":[]},
      {"slug":"spen-dfes","display_name":"SPEN DFES Forecasts","category":"Forecasting","subcategory":"DFES","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%dfes%"],"exclude_patterns":[]},
      {"slug":"spen-ecr","display_name":"SPEN Embedded Capacity","category":"Capacity","subcategory":"ECR","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%embedded%capacity%","%ecr%"],"exclude_patterns":[]},
      {"slug":"spen-service-areas","display_name":"SPEN Service Areas","category":"Boundaries","subcategory":"Service Areas","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%licence%area%","%service%area%","%boundary%","%supply%area%"],"exclude_patterns":[]},
      {"slug":"spen-smart-meter","display_name":"SPEN Smart Meter Data","category":"Low Carbon","subcategory":"Smart Meter","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%smart%meter%"],"exclude_patterns":[]},
      {"slug":"spen-lv-monitoring","display_name":"SPEN LV Monitoring","category":"Network Assets","subcategory":"Monitoring","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%lv%monitor%","%low%voltage%monitor%"],"exclude_patterns":[]},
      {"slug":"spen-secondary-substations","display_name":"SPEN Secondary Substations","category":"Network Assets","subcategory":"Substations","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%secondary%substation%"],"exclude_patterns":[]},
      {"slug":"spen-line-assets","display_name":"SPEN Line Assets","category":"Network Assets","subcategory":"Line Assets","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%line%asset%"],"exclude_patterns":[]},
      {"slug":"spen-point-assets","display_name":"SPEN Point Assets","category":"Network Assets","subcategory":"Point Assets","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%point%asset%"],"exclude_patterns":["%line%"]},
      {"slug":"spen-connections","display_name":"SPEN Connection Data","category":"Connections","subcategory":"Queue","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%connection%queue%","%connection%offer%","%accepted%connection%"],"exclude_patterns":[]},
      {"slug":"spen-flexibility","display_name":"SPEN Flexibility","category":"Flexibility","subcategory":"Services","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%flexibility%","%flex%"],"exclude_patterns":[]}
    ]'::jsonb;

  ELSIF p_dno = 'NPG' THEN
    v_rules := '[
      {"slug":"npg-substations","display_name":"NPG Substations","category":"Network Assets","subcategory":"Substations","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%substation%"],"exclude_patterns":["%polygon%","%catchment%"]},
      {"slug":"npg-hv-cables","display_name":"NPG HV Cables","category":"Network Assets","subcategory":"HV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hv%cable%","%11kv%"],"exclude_patterns":["%overhead%"]},
      {"slug":"npg-ehv-cables","display_name":"NPG EHV Cables","category":"Network Assets","subcategory":"EHV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%ehv%cable%","%33kv%","%66kv%"],"exclude_patterns":["%overhead%"]},
      {"slug":"npg-overhead","display_name":"NPG Overhead Lines","category":"Network Assets","subcategory":"Overhead Lines","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%overhead%"],"exclude_patterns":[]},
      {"slug":"npg-dfes","display_name":"NPG DFES Forecasts","category":"Forecasting","subcategory":"DFES","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%dfes%"],"exclude_patterns":[]},
      {"slug":"npg-service-areas","display_name":"NPG Service Areas","category":"Boundaries","subcategory":"Service Areas","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%licence%area%","%service%area%","%boundary%"],"exclude_patterns":[]},
      {"slug":"npg-flexibility","display_name":"NPG Flexibility","category":"Flexibility","subcategory":"Services","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%flexibility%","%flex%"],"exclude_patterns":[]}
    ]'::jsonb;

  ELSIF p_dno = 'NGED' THEN
    v_rules := '[
      {"slug":"nged-substations","display_name":"NGED Substations","category":"Network Assets","subcategory":"Substations","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%substation%"],"exclude_patterns":["%polygon%","%catchment%","%loading%","%headroom%","%capacity-register%"]},
      {"slug":"nged-substation-loading","display_name":"NGED Substation Loading","category":"Capacity","subcategory":"Loading","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%substation%loading%","%substation%headroom%","%load%index%"],"exclude_patterns":[]},
      {"slug":"nged-cables-hv","display_name":"NGED HV Cables","category":"Network Assets","subcategory":"HV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hv%cable%","%11kv%cable%","%hv%underground%"],"exclude_patterns":["%overhead%"]},
      {"slug":"nged-cables-ehv","display_name":"NGED EHV Cables","category":"Network Assets","subcategory":"EHV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%ehv%cable%","%33kv%cable%","%66kv%cable%","%132kv%cable%"],"exclude_patterns":["%overhead%"]},
      {"slug":"nged-cables-lv","display_name":"NGED LV Cables","category":"Network Assets","subcategory":"LV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lv%cable%","%lv%underground%"],"exclude_patterns":["%overhead%"]},
      {"slug":"nged-overhead","display_name":"NGED Overhead Lines","category":"Network Assets","subcategory":"Overhead Lines","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%overhead%"],"exclude_patterns":[]},
      {"slug":"nged-ecr","display_name":"NGED Embedded Capacity Register","category":"Capacity","subcategory":"ECR","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%embedded%capacity%","%capacity-register%","%ecr%"],"exclude_patterns":[]},
      {"slug":"nged-connection-queue","display_name":"NGED Connection Queue","category":"Connections","subcategory":"Queue","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%connection%queue%","%connection%offer%","%accepted%connection%"],"exclude_patterns":[]},
      {"slug":"nged-dfes","display_name":"NGED DFES Forecasts","category":"Forecasting","subcategory":"DFES","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%dfes%"],"exclude_patterns":[]},
      {"slug":"nged-flexibility","display_name":"NGED Flexibility","category":"Flexibility","subcategory":"Services","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%flexibility%","%flex%"],"exclude_patterns":[]},
      {"slug":"nged-ev-data","display_name":"NGED EV Data","category":"Low Carbon","subcategory":"EV","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%ev-%","%electric%vehicle%","%charge%point%"],"exclude_patterns":[]},
      {"slug":"nged-lct","display_name":"NGED LCT Data","category":"Low Carbon","subcategory":"LCT","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%lct%","%low%carbon%","%heat%pump%","%solar%","%generation%"],"exclude_patterns":["%dfes%"]},
      {"slug":"nged-smart-meter","display_name":"NGED Smart Meter Data","category":"Low Carbon","subcategory":"Smart Meter","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%smart%meter%"],"exclude_patterns":[]},
      {"slug":"nged-network-capacity","display_name":"NGED Network Capacity","category":"Capacity","subcategory":"Headroom","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%network%capacity%","%capacity%map%","%headroom%"],"exclude_patterns":["%embedded%"]},
      {"slug":"nged-service-areas","display_name":"NGED Service Areas","category":"Boundaries","subcategory":"Service Areas","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%licence%area%","%service%area%","%boundary%","%supply%area%"],"exclude_patterns":[]},
      {"slug":"nged-ndp","display_name":"NGED Network Development Plan","category":"Capacity","subcategory":"NDP","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%network%development%","%ndp%","%reinforcement%"],"exclude_patterns":[]},
      {"slug":"nged-fault-data","display_name":"NGED Fault & Interruption Data","category":"Performance","subcategory":"Faults","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%fault%","%interruption%","%outage%","%power%cut%"],"exclude_patterns":[]},
      {"slug":"nged-constraint-zones","display_name":"NGED Constraint Managed Zones","category":"Capacity","subcategory":"Constraints","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%constraint%managed%zone%","%cmz%"],"exclude_patterns":[]},
      {"slug":"nged-demand-scenarios","display_name":"NGED Demand Scenarios","category":"Forecasting","subcategory":"Demand","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%demand%scenario%","%peak%demand%","%future%demand%"],"exclude_patterns":[]},
      {"slug":"nged-generation","display_name":"NGED Generation Data","category":"Low Carbon","subcategory":"Generation","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%generation%","%distributed%energy%","%der%"],"exclude_patterns":["%dfes%","%capacity-register%"]},
      {"slug":"nged-constraint-boundary","display_name":"NGED Constraint Boundaries","category":"Boundaries","subcategory":"Constraints","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%constraint%boundary%","%network%constraint%"],"exclude_patterns":["%cmz%"]},
      {"slug":"nged-switchgear","display_name":"NGED Switchgear","category":"Network Assets","subcategory":"Switchgear","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%switchgear%","%circuit%breaker%","%ring%main%"],"exclude_patterns":[]},
      {"slug":"nged-lv-feeder","display_name":"NGED LV Feeder Data","category":"Network Assets","subcategory":"LV Feeders","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lv%feeder%"],"exclude_patterns":[]},
      {"slug":"nged-hv-feeder","display_name":"NGED HV Feeder Data","category":"Network Assets","subcategory":"HV Feeders","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hv%feeder%","%11kv%feeder%"],"exclude_patterns":[]},
      {"slug":"nged-network-map","display_name":"NGED Network Map","category":"Network Assets","subcategory":"Network Map","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%network%map%","%schematic%"],"exclude_patterns":[]},
      {"slug":"nged-losses","display_name":"NGED Losses Data","category":"Performance","subcategory":"Losses","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%losses%","%loss%"],"exclude_patterns":[]},
      {"slug":"nged-dnoa","display_name":"NGED DNOA","category":"Capacity","subcategory":"DNOA","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%dnoa%","%distribution%network%option%"],"exclude_patterns":[]},
      {"slug":"nged-transformer-flows","display_name":"NGED Transformer Flows","category":"Capacity","subcategory":"Flows","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%transformer-flow%","%bsp-transformer%","%primary-transformer%","%super-grid-transformer%"],"exclude_patterns":[]}
    ]'::jsonb;

  ELSIF p_dno = 'UKPN' THEN
    v_rules := '[
      {"slug":"ukpn-substations","display_name":"UKPN Substations","category":"Network Assets","subcategory":"Substations","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%substation%"],"exclude_patterns":["%polygon%","%catchment%","%loading%","%headroom%"]},
      {"slug":"ukpn-cables-hv","display_name":"UKPN HV Cables","category":"Network Assets","subcategory":"HV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hv%cable%","%11kv%cable%","%hv%underground%"],"exclude_patterns":["%overhead%"]},
      {"slug":"ukpn-cables-ehv","display_name":"UKPN EHV Cables","category":"Network Assets","subcategory":"EHV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%ehv%cable%","%33kv%cable%","%66kv%cable%","%132kv%cable%"],"exclude_patterns":["%overhead%"]},
      {"slug":"ukpn-cables-lv","display_name":"UKPN LV Cables","category":"Network Assets","subcategory":"LV Cables","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lv%cable%","%lv%underground%"],"exclude_patterns":["%overhead%"]},
      {"slug":"ukpn-overhead","display_name":"UKPN Overhead Lines","category":"Network Assets","subcategory":"Overhead Lines","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%overhead%"],"exclude_patterns":[]},
      {"slug":"ukpn-ecr","display_name":"UKPN Embedded Capacity Register","category":"Capacity","subcategory":"ECR","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%embedded%capacity%","%ecr%","%capacity%register%"],"exclude_patterns":[]},
      {"slug":"ukpn-dfes","display_name":"UKPN DFES Forecasts","category":"Forecasting","subcategory":"DFES","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%dfes%"],"exclude_patterns":[]},
      {"slug":"ukpn-service-areas","display_name":"UKPN Service Areas","category":"Boundaries","subcategory":"Service Areas","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%licence%area%","%service%area%","%boundary%","%supply%area%"],"exclude_patterns":[]},
      {"slug":"ukpn-flexibility","display_name":"UKPN Flexibility","category":"Flexibility","subcategory":"Services","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%flexibility%","%flex%"],"exclude_patterns":[]},
      {"slug":"ukpn-connections","display_name":"UKPN Connection Data","category":"Connections","subcategory":"Queue","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%connection%queue%","%connection%offer%","%accepted%connection%"],"exclude_patterns":[]},
      {"slug":"ukpn-ev-data","display_name":"UKPN EV Data","category":"Low Carbon","subcategory":"EV","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%ev-%","%electric%vehicle%","%charge%point%"],"exclude_patterns":[]},
      {"slug":"ukpn-smart-meter","display_name":"UKPN Smart Meter Data","category":"Low Carbon","subcategory":"Smart Meter","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%smart%meter%"],"exclude_patterns":[]},
      {"slug":"ukpn-lct","display_name":"UKPN LCT Data","category":"Low Carbon","subcategory":"LCT","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%lct%","%low%carbon%","%heat%pump%","%solar%","%generation%"],"exclude_patterns":["%dfes%"]},
      {"slug":"ukpn-network-capacity","display_name":"UKPN Network Capacity","category":"Capacity","subcategory":"Headroom","geometry_type":"Point","storage_table":"geo_substations","match_patterns":["%network%capacity%","%capacity%map%","%headroom%"],"exclude_patterns":["%embedded%"]},
      {"slug":"ukpn-fault-data","display_name":"UKPN Fault Data","category":"Performance","subcategory":"Faults","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%fault%","%interruption%","%outage%","%power%cut%"],"exclude_patterns":[]}
    ]'::jsonb;

  ELSIF p_dno = 'CADENT' THEN
    v_rules := '[
      {"slug":"cadent-lp-pipes","display_name":"Cadent LP Gas Pipes","category":"Gas Assets","subcategory":"LP Mains","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lp%pipe%","%low%pressure%pipe%","%lp%main%","%low-pressure%main%","%gpi%lp%"],"exclude_patterns":["%shared%"]},
      {"slug":"cadent-mp-pipes","display_name":"Cadent MP Gas Pipes","category":"Gas Assets","subcategory":"MP Mains","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%mp%pipe%","%medium%pressure%pipe%","%mp%main%","%medium-pressure%main%","%gpi%mp%"],"exclude_patterns":["%shared%"]},
      {"slug":"cadent-ip-pipes","display_name":"Cadent IP Gas Pipes","category":"Gas Assets","subcategory":"IP Mains","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%ip%pipe%","%intermediate%pressure%","%ip%main%","%gpi%ip%"],"exclude_patterns":["%shared%"]},
      {"slug":"cadent-hp-pipes","display_name":"Cadent HP Gas Pipes","category":"Gas Assets","subcategory":"HP Mains","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hp%pipe%","%high%pressure%","%hp%main%"],"exclude_patterns":["%shared%"]},
      {"slug":"cadent-open-pipes","display_name":"Cadent Gas Pipes (Open)","category":"Gas Assets","subcategory":"All Mains","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%gas-pipe-infrastructure-gpi%open%","%gpi_open%"],"exclude_patterns":["%shared%"]},
      {"slug":"cadent-network-zones","display_name":"Cadent Network Zones","category":"Gas Boundaries","subcategory":"Zones","geometry_type":"Polygon","storage_table":"geo_polygons","match_patterns":["%network%zone%","%supply%zone%","%network_zone%"],"exclude_patterns":[]},
      {"slug":"cadent-governors","display_name":"Cadent Governors","category":"Gas Assets","subcategory":"Governors","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%governor%"],"exclude_patterns":[]},
      {"slug":"cadent-capacity","display_name":"Cadent Capacity Data","category":"Gas Capacity","subcategory":"Capacity","geometry_type":"Point","storage_table":"geo_points","match_patterns":["%capacity%","%demand%","%flow%"],"exclude_patterns":["%zone%"]},
      {"slug":"cadent-hydrogen","display_name":"Cadent Hydrogen Network","category":"Gas Planning","subcategory":"Hydrogen","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hydrogen%","%h2%"],"exclude_patterns":[]}
    ]'::jsonb;

  ELSE
    RETURN json_build_object('error', 'No rules defined for DNO: ' || p_dno);
  END IF;

  -- Process each unlinked geospatial dataset (from appropriate registry table)
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
        IF v_rule->'exclude_patterns' IS NOT NULL AND jsonb_array_length(v_rule->'exclude_patterns') > 0 THEN
          FOR v_exclude_pattern IN SELECT jsonb_array_elements_text(v_rule->'exclude_patterns')
          LOOP
            IF lower(v_dataset.dataset_id) LIKE v_exclude_pattern OR lower(v_dataset.title) LIKE v_exclude_pattern THEN
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
          IF lower(v_dataset.dataset_id) LIKE v_match_pattern OR lower(v_dataset.title) LIKE v_match_pattern THEN
            v_matched := true;

            SELECT id INTO v_layer_id
            FROM layer_registry
            WHERE slug = v_rule->>'slug' AND dno = p_dno;

            IF v_layer_id IS NULL THEN
              INSERT INTO layer_registry (
                slug, display_name, dno, category, subcategory,
                geometry_type, storage_table, style_json, legend_json, enabled
              ) VALUES (
                v_rule->>'slug',
                v_rule->>'display_name',
                p_dno,
                v_rule->>'category',
                v_rule->>'subcategory',
                v_rule->>'geometry_type',
                v_rule->>'storage_table',
                '{}'::jsonb,
                '[]'::jsonb,
                true
              )
              RETURNING id INTO v_layer_id;
              v_layers_created := v_layers_created + 1;
            ELSE
              v_layers_reused := v_layers_reused + 1;
            END IF;

            UPDATE gas_dataset_registry
            SET linked_layer_id = v_layer_id,
                active = true,
                updated_at = now()
            WHERE id = v_dataset.id;

            v_datasets_linked := v_datasets_linked + 1;
            EXIT;
          END IF;
        END LOOP;

        IF v_matched THEN EXIT; END IF;
      END LOOP;

      IF NOT v_matched THEN
        v_unmatched := array_append(v_unmatched, v_dataset.dataset_id || '|' || COALESCE(v_dataset.title, ''));
        v_datasets_skipped := v_datasets_skipped + 1;
      END IF;
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
        IF v_rule->'exclude_patterns' IS NOT NULL AND jsonb_array_length(v_rule->'exclude_patterns') > 0 THEN
          FOR v_exclude_pattern IN SELECT jsonb_array_elements_text(v_rule->'exclude_patterns')
          LOOP
            IF lower(v_dataset.dataset_id) LIKE v_exclude_pattern OR lower(v_dataset.title) LIKE v_exclude_pattern THEN
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
          IF lower(v_dataset.dataset_id) LIKE v_match_pattern OR lower(v_dataset.title) LIKE v_match_pattern THEN
            v_matched := true;

            SELECT id INTO v_layer_id
            FROM layer_registry
            WHERE slug = v_rule->>'slug' AND dno = p_dno;

            IF v_layer_id IS NULL THEN
              INSERT INTO layer_registry (
                slug, display_name, dno, category, subcategory,
                geometry_type, storage_table, style_json, legend_json, enabled
              ) VALUES (
                v_rule->>'slug',
                v_rule->>'display_name',
                p_dno,
                v_rule->>'category',
                v_rule->>'subcategory',
                v_rule->>'geometry_type',
                v_rule->>'storage_table',
                '{}'::jsonb,
                '[]'::jsonb,
                true
              )
              RETURNING id INTO v_layer_id;
              v_layers_created := v_layers_created + 1;
            ELSE
              v_layers_reused := v_layers_reused + 1;
            END IF;

            UPDATE dno_dataset_registry
            SET linked_layer_id = v_layer_id,
                active = true,
                updated_at = now()
            WHERE id = v_dataset.id;

            v_datasets_linked := v_datasets_linked + 1;
            EXIT;
          END IF;
        END LOOP;

        IF v_matched THEN EXIT; END IF;
      END LOOP;

      IF NOT v_matched THEN
        v_unmatched := array_append(v_unmatched, v_dataset.dataset_id || '|' || COALESCE(v_dataset.title, ''));
        v_datasets_skipped := v_datasets_skipped + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN json_build_object(
    'dno', p_dno,
    'layers_created', v_layers_created,
    'layers_reused', v_layers_reused,
    'datasets_linked', v_datasets_linked,
    'datasets_skipped', v_datasets_skipped,
    'unmatched', (
      SELECT json_agg(json_build_object(
        'dataset_id', split_part(u, '|', 1),
        'title', split_part(u, '|', 2)
      ))
      FROM unnest(v_unmatched) AS u
    )
  );
END;
$function$;
