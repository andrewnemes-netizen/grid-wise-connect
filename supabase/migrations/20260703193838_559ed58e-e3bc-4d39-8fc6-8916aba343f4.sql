-- Deactivate stale old-prefix rows for the 4 headroom-critical tables (they 404 now)
UPDATE public.dno_dataset_registry
SET active = false,
    last_sync_status = 'skipped',
    last_sync_error = 'Superseded by ukpn-ltds-table-* dataset id (old id returns 404)',
    updated_at = now()
WHERE dataset_id IN (
  'ltds-table-2a-transformer-2w',
  'ltds-table-2b-transformer-data-3w',
  'ltds-table-3a-load-data-observed',
  'ltds-table-3b-load-data-true'
);

-- Activate the new-prefix rows and clear any prior state
UPDATE public.dno_dataset_registry
SET active = true,
    last_sync_status = 'never',
    last_sync_error = NULL,
    last_sync_rows = 0,
    updated_at = now()
WHERE dataset_id IN (
  'ukpn-ltds-table-2a-transformer-2w',
  'ukpn-ltds-table-2b-transformer-data-3w',
  'ukpn-ltds-table-3a-load-data-observed',
  'ukpn-ltds-table-3b-load-data-true'
);

-- Also skip the new-prefix rows that mirror the retired 404 datasets
UPDATE public.dno_dataset_registry
SET active = false,
    last_sync_status = 'skipped',
    last_sync_error = 'Dataset returns 404 on UKPN portal',
    updated_at = now()
WHERE dataset_id IN (
  'ukpn-ltds-table-5-generation',
  'ukpn-ltds-table-8-gt-95-perc-fault-data',
  'ukpn-ltds-table-1-circuit-data'
);