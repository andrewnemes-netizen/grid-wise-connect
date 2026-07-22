
ALTER TABLE public.site_stage_status
  ADD COLUMN IF NOT EXISTS wait_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS wait_target_date date,
  ADD COLUMN IF NOT EXISTS wait_delay_reason text,
  ADD COLUMN IF NOT EXISTS wait_delay_logged_at timestamptz;
