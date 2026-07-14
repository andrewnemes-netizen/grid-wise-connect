
ALTER TABLE public.unit_rates
  ADD COLUMN IF NOT EXISTS build_buildout_4  numeric NOT NULL DEFAULT 38798,
  ADD COLUMN IF NOT EXISTS build_horizontal_4 numeric NOT NULL DEFAULT 28237,
  ADD COLUMN IF NOT EXISTS build_horizontal_6 numeric NOT NULL DEFAULT 39818,
  ADD COLUMN IF NOT EXISTS build_vertical_4  numeric NOT NULL DEFAULT 29576,
  ADD COLUMN IF NOT EXISTS build_vertical_6  numeric NOT NULL DEFAULT 37091;

UPDATE public.unit_rates SET
  build_buildout_4   = COALESCE(NULLIF(build_buildout_4,0), 38798),
  build_horizontal_4 = COALESCE(NULLIF(build_horizontal_4,0), 28237),
  build_horizontal_6 = COALESCE(NULLIF(build_horizontal_6,0), 39818),
  build_vertical_4   = COALESCE(NULLIF(build_vertical_4,0), 29576),
  build_vertical_6   = COALESCE(NULLIF(build_vertical_6,0), 37091);

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS build_type text;
