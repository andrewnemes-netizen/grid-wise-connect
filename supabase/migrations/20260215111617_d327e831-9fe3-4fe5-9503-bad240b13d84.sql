
-- Add computed scoring columns to sites table for portfolio ranking/filtering
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS viability_index integer,
  ADD COLUMN IF NOT EXISTS grid_readiness text,
  ADD COLUMN IF NOT EXISTS deployment_class text,
  ADD COLUMN IF NOT EXISTS cost_band text,
  ADD COLUMN IF NOT EXISTS reinforcement_probability integer,
  ADD COLUMN IF NOT EXISTS raw_score_data jsonb;

-- Index for common portfolio filters
CREATE INDEX IF NOT EXISTS idx_sites_viability ON public.sites (viability_index);
CREATE INDEX IF NOT EXISTS idx_sites_grid_readiness ON public.sites (grid_readiness);
CREATE INDEX IF NOT EXISTS idx_sites_cost_band ON public.sites (cost_band);
