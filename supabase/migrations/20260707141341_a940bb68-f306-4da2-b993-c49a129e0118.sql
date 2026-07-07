DO $$
DECLARE
  fn text;
BEGIN
  fn := pg_get_functiondef('public.auto_create_dno_layers(text, boolean)'::regprocedure);

  fn := replace(
    fn,
    'v_has_ingest_endpoint := COALESCE(v_dataset.endpoint_export_geojson, v_dataset.endpoint_export_csv, v_dataset.endpoint_records) IS NOT NULL;',
    'v_has_ingest_endpoint := COALESCE(v_dataset.endpoint_export_geojson, v_dataset.endpoint_export_csv, v_dataset.endpoint_records) IS NOT NULL AND (p_dno <> ''NIE'' OR v_dataset.endpoint_export_geojson IS NOT NULL);'
  );

  fn := replace(
    fn,
    'is_geospatial = true,',
    'is_geospatial = CASE WHEN p_dno = ''NIE'' AND v_dataset.endpoint_export_geojson IS NULL THEN false ELSE true END,'
  );

  EXECUTE fn;
END $$;

UPDATE public.dno_dataset_registry
SET is_geospatial = false,
    active = false,
    last_sync_status = 'skipped',
    last_sync_error = 'No geometry in source dataset; postcode-only faults cannot be ingested as a map layer yet',
    last_sync_rows = 0,
    sync_cursor = NULL,
    updated_at = now()
WHERE dno = 'NIE'
  AND dataset_id = 'nie-networks-network-faults';

UPDATE public.dno_dataset_registry
SET last_sync_rows = 0,
    sync_cursor = NULL,
    updated_at = now()
WHERE dno = 'NIE'
  AND dataset_id IN (
    'nie-networks-assets-sites-11kv-conductor',
    'nie-networks-assets-sites-33kv-conductor',
    'nie-networks-assets-sites-110kv-conductor',
    'nie-networks-assets-sites-275kv-conductor'
  );