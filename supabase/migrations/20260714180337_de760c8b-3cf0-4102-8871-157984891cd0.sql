
-- 1. sites.socket_count
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS socket_count integer;

-- 2. unit_rates socket build tiers
ALTER TABLE public.unit_rates
  ADD COLUMN IF NOT EXISTS socket_build_2 numeric(14,2) NOT NULL DEFAULT 3500,
  ADD COLUMN IF NOT EXISTS socket_build_4 numeric(14,2) NOT NULL DEFAULT 6000,
  ADD COLUMN IF NOT EXISTS socket_build_6 numeric(14,2) NOT NULL DEFAULT 8500,
  ADD COLUMN IF NOT EXISTS socket_build_8 numeric(14,2) NOT NULL DEFAULT 11000;

-- 3. site_estimate_lines source + lock
ALTER TABLE public.site_estimate_lines
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;
-- source values: MANUAL | ICP_STUDY | ICP_STUDY_DETAIL | SOCKET_BUILD

CREATE INDEX IF NOT EXISTS idx_site_estimate_lines_source
  ON public.site_estimate_lines (site_estimate_id, source);

-- 4. site_estimates.study_id
ALTER TABLE public.site_estimates
  ADD COLUMN IF NOT EXISTS study_id uuid REFERENCES public.studies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_site_estimates_study ON public.site_estimates (study_id);
