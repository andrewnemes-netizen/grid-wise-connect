DO $$
DECLARE
  fn text;
BEGIN
  fn := pg_get_functiondef('public.auto_create_dno_layers(text, boolean)'::regprocedure);

  fn := replace(
    fn,
    '{"slug":"nie-overhead-lv","display_name":"NIE LV Overhead Lines","category":"Electrical Assets","subcategory":"OHL LV","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lv%overhead%","%lv%ohl%"],"exclude_patterns":["%hv%","%ehv%"]}',
    '{"slug":"nie-overhead-lv","display_name":"NIE LV Overhead Lines","category":"Electrical Assets","subcategory":"OHL LV","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%lv%overhead%","%lv%ohl%","%lv%conductor%"],"exclude_patterns":["%hv%","%ehv%","%11kv%","%33kv%","%110kv%","%275kv%"]}'
  );

  fn := replace(
    fn,
    '{"slug":"nie-overhead-hv","display_name":"NIE HV Overhead Lines","category":"Electrical Assets","subcategory":"OHL HV","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hv%overhead%","%hv%ohl%","%11kv%overhead%"],"exclude_patterns":["%lv%","%ehv%","%33kv%","%110kv%"]}',
    '{"slug":"nie-overhead-hv","display_name":"NIE HV Overhead Lines","category":"Electrical Assets","subcategory":"OHL HV","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%hv%overhead%","%hv%ohl%","%11kv%overhead%","%11kv%conductor%"],"exclude_patterns":["%lv%","%ehv%","%33kv%","%110kv%","%275kv%"]}'
  );

  fn := replace(
    fn,
    '{"slug":"nie-overhead-ehv","display_name":"NIE EHV Overhead Lines","category":"Electrical Assets","subcategory":"OHL EHV","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%ehv%overhead%","%33kv%overhead%","%110kv%overhead%","%ehv%ohl%"],"exclude_patterns":["%lv%","%hv %"]}',
    '{"slug":"nie-overhead-ehv","display_name":"NIE EHV Overhead Lines","category":"Electrical Assets","subcategory":"OHL EHV","geometry_type":"LineString","storage_table":"geo_cables","match_patterns":["%ehv%overhead%","%33kv%overhead%","%110kv%overhead%","%275kv%overhead%","%33kv%conductor%","%110kv%conductor%","%275kv%conductor%","%ehv%ohl%"],"exclude_patterns":["%lv%"]}'
  );

  EXECUTE fn;
END $$;

UPDATE public.dno_dataset_registry d
SET linked_layer_id = l.id,
    storage_table = l.storage_table,
    geometry_type = l.geometry_type,
    last_sync_status = 'never',
    last_sync_error = NULL,
    sync_cursor = NULL,
    updated_at = now()
FROM public.layer_registry l
WHERE d.dno = 'NIE'
  AND l.dno = 'NIE'
  AND d.dataset_id = 'nie-networks-assets-sites-11kv-conductor'
  AND l.slug = 'nie-overhead-hv';

UPDATE public.dno_dataset_registry d
SET linked_layer_id = l.id,
    storage_table = l.storage_table,
    geometry_type = l.geometry_type,
    last_sync_status = 'never',
    last_sync_error = NULL,
    sync_cursor = NULL,
    updated_at = now()
FROM public.layer_registry l
WHERE d.dno = 'NIE'
  AND l.dno = 'NIE'
  AND d.dataset_id IN (
    'nie-networks-assets-sites-33kv-conductor',
    'nie-networks-assets-sites-110kv-conductor',
    'nie-networks-assets-sites-275kv-conductor'
  )
  AND l.slug = 'nie-overhead-ehv';

UPDATE public.dno_dataset_registry
SET storage_table = 'geo_points',
    updated_at = now()
WHERE dno = 'NIE'
  AND geometry_type = 'Point'
  AND storage_table = 'geo_substations'
  AND linked_layer_id IS NULL;

UPDATE public.dno_dataset_registry
SET last_sync_status = 'never',
    last_sync_error = NULL,
    sync_cursor = NULL,
    updated_at = now()
WHERE dno = 'NIE'
  AND last_sync_status = 'error'
  AND last_sync_error ILIKE '%Timed out%';

DELETE FROM public.geo_points
WHERE dno = 'NIE'
  AND layer_id = (SELECT id FROM public.layer_registry WHERE slug = 'nie-assets-other')
  AND attrs_json ? 'conductor';

UPDATE public.layer_registry l
SET feature_count = COALESCE(c.count_rows, 0),
    updated_at = now()
FROM (
  SELECT layer_id, count(*)::int AS count_rows
  FROM public.geo_points
  WHERE dno = 'NIE'
  GROUP BY layer_id
) c
WHERE l.id = c.layer_id
  AND l.dno = 'NIE'
  AND l.storage_table = 'geo_points';

UPDATE public.layer_registry l
SET feature_count = 0,
    updated_at = now()
WHERE l.dno = 'NIE'
  AND l.storage_table = 'geo_points'
  AND NOT EXISTS (
    SELECT 1 FROM public.geo_points p WHERE p.layer_id = l.id AND p.dno = 'NIE'
  );