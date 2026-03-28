
ALTER TABLE public.unit_rates
  ADD COLUMN IF NOT EXISTS lv_joint_team_day numeric NOT NULL DEFAULT 1620,
  ADD COLUMN IF NOT EXISTS joint_bay_soft numeric NOT NULL DEFAULT 850,
  ADD COLUMN IF NOT EXISTS joint_bay_footway numeric NOT NULL DEFAULT 1330,
  ADD COLUMN IF NOT EXISTS joint_bay_carriageway numeric NOT NULL DEFAULT 2360,
  ADD COLUMN IF NOT EXISTS cable_joint_kit_185mm numeric NOT NULL DEFAULT 366.23,
  ADD COLUMN IF NOT EXISTS cable_joint_kit_pot_end numeric NOT NULL DEFAULT 182.53,
  ADD COLUMN IF NOT EXISTS service_cable_35mm_per_m numeric NOT NULL DEFAULT 8.50,
  ADD COLUMN IF NOT EXISTS mains_extension_threshold_m numeric NOT NULL DEFAULT 25;
