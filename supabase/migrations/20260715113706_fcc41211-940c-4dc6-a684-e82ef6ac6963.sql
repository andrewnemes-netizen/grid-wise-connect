
ALTER TABLE public.rate_items
  ADD COLUMN IF NOT EXISTS productivity_qty_per_day numeric,
  ADD COLUMN IF NOT EXISTS default_crew_size integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS default_stage text;

ALTER TABLE public.estimate_groups
  ADD COLUMN IF NOT EXISTS stage_code text,
  ADD COLUMN IF NOT EXISTS stage_color text,
  ADD COLUMN IF NOT EXISTS stage_order integer,
  ADD COLUMN IF NOT EXISTS default_predecessor_stage_code text;

DO $$ BEGIN
  CREATE TYPE public.wp_task_kind AS ENUM ('site_summary','stage_summary','work');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.wp_tasks
  ADD COLUMN IF NOT EXISTS site_id uuid,
  ADD COLUMN IF NOT EXISTS stage_code text,
  ADD COLUMN IF NOT EXISTS task_kind public.wp_task_kind NOT NULL DEFAULT 'work',
  ADD COLUMN IF NOT EXISTS estimate_line_id uuid,
  ADD COLUMN IF NOT EXISTS generated_from_estimate_id uuid,
  ADD COLUMN IF NOT EXISTS qty numeric,
  ADD COLUMN IF NOT EXISTS uom text,
  ADD COLUMN IF NOT EXISTS crew_size integer,
  ADD COLUMN IF NOT EXISTS productivity_qty_per_day numeric;

-- Idempotent unique key: one work-row per (wp, site, stage, estimate_line)
CREATE UNIQUE INDEX IF NOT EXISTS wp_tasks_generation_uniq
  ON public.wp_tasks (work_package_id, site_id, stage_code, estimate_line_id)
  WHERE estimate_line_id IS NOT NULL;

-- Summary rows: one summary per (wp, site, stage, kind)
CREATE UNIQUE INDEX IF NOT EXISTS wp_tasks_summary_uniq
  ON public.wp_tasks (work_package_id, coalesce(site_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(stage_code,''), task_kind)
  WHERE task_kind IN ('site_summary','stage_summary');

CREATE INDEX IF NOT EXISTS wp_tasks_site_stage_idx ON public.wp_tasks (work_package_id, site_id, stage_code);
CREATE INDEX IF NOT EXISTS wp_tasks_generated_idx ON public.wp_tasks (generated_from_estimate_id);
