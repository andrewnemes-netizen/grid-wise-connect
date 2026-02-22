
ALTER TABLE public.unit_rates
  ADD COLUMN IF NOT EXISTS duct_per_m numeric NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS termination_each numeric NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS earthing_lot numeric NOT NULL DEFAULT 3500,
  ADD COLUMN IF NOT EXISTS transformer_plinth_each numeric NOT NULL DEFAULT 4200,
  ADD COLUMN IF NOT EXISTS cable_marker_tape_per_m numeric NOT NULL DEFAULT 2;
