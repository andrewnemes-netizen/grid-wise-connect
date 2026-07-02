
ALTER TABLE public.dno_dataset_registry
  ADD COLUMN IF NOT EXISTS sync_cursor jsonb;

-- Retire genuinely tabular (no-geometry) datasets so they stop appearing as errors.
UPDATE public.dno_dataset_registry
   SET is_geospatial   = false,
       active          = false,
       last_sync_status = 'skipped',
       last_sync_error  = 'Tabular dataset — no geometry columns; hidden from GIS layers',
       last_sync_at     = now(),
       updated_at       = now()
 WHERE last_sync_status = 'error'
   AND last_sync_error ILIKE 'Read % source rows but could not map any geometry%';

-- Also retire datasets that only expose PDF/zip attachments (no ingestible API).
UPDATE public.dno_dataset_registry
   SET active          = false,
       last_sync_status = 'skipped',
       last_sync_error  = 'No ingestible API resource — source only exposes PDF/zip files',
       updated_at       = now()
 WHERE last_sync_status = 'error'
   AND last_sync_error ILIKE 'No ingestible API resource%';
