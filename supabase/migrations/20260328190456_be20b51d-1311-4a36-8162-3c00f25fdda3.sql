
UPDATE public.dno_dataset_registry
SET last_sync_status = 'never', last_sync_error = NULL, last_sync_at = NULL
WHERE dno = 'UKPN' AND last_sync_status = 'error' AND last_sync_error LIKE '%401%';

UPDATE public.dno_dataset_registry
SET last_sync_status = 'skipped', last_sync_error = '403 Forbidden — restricted dataset, elevated portal permissions required'
WHERE last_sync_status = 'error' AND last_sync_error LIKE '%403%';

UPDATE public.dno_dataset_registry
SET last_sync_status = 'never', last_sync_error = NULL, last_sync_at = NULL
WHERE dno = 'CADENT' AND dataset_id = 'network_zones_test' AND last_sync_status = 'error';

UPDATE public.dno_dataset_registry
SET last_sync_status = 'never', last_sync_error = NULL
WHERE dno = 'NGED' AND last_sync_status = 'processing';
