UPDATE public.dno_dataset_registry
SET active = false,
    last_sync_status = 'skipped',
    last_sync_error = 'Dataset not ingestable: 404 on UKPN portal or no tabular ingester defined',
    updated_at = now()
WHERE dataset_id IN (
  'ltds-table-5-generation',
  'ltds-table-8-gt-95-perc-fault-data',
  'ltds-table-3a-load-data-observed-transposed',
  'ltds-table-1-circuit-data',
  'ltds-table-6-interest-connections'
);