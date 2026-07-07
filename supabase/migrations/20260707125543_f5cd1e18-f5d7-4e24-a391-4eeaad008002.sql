INSERT INTO public.dno_rulesets (dno_code, version, is_active, rules_json)
VALUES (
  'NIE', 'v1', true,
  jsonb_build_object(
    'compliance_flags', jsonb_build_array('NIE_G81','ENA_TS_09-2','NJUG_guidelines'),
    'cover_depths_mm', jsonb_build_object(
      'tarmac',   jsonb_build_object('LV',450,'HV',600,'EHV',900),
      'concrete', jsonb_build_object('LV',450,'HV',600,'EHV',900),
      'paving',   jsonb_build_object('LV',450,'HV',600,'EHV',900),
      'grass',    jsonb_build_object('LV',600,'HV',750,'EHV',1050)
    ),
    'duct_sizes', jsonb_build_object(
      'LV',  jsonb_build_object('single_cable',100,'two_cables',125,'three_cables',150),
      'HV',  jsonb_build_object('single_cable',125,'two_cables',150),
      'EHV', jsonb_build_object('single_cable',150,'two_cables',200)
    ),
    'joint_spacing_m', jsonb_build_object('LV',500,'HV',500,'EHV',400),
    'service_length_cap_m', 30,
    'warnings', jsonb_build_array('NIE Networks operates under Northern Ireland ESQCR — verify local wayleave and DfI Roads consent requirements')
  )
)
ON CONFLICT DO NOTHING;