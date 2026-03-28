UPDATE dno_dataset_registry
SET last_sync_status = 'never',
    last_sync_error = NULL,
    updated_at = now()
WHERE active = true
  AND last_sync_status IN ('error', 'processing', 'never');