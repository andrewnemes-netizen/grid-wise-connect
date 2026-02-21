ALTER TABLE public.unit_rates
  ADD COLUMN feeder_pillar_each numeric NOT NULL DEFAULT 3200,
  ADD COLUMN cutout_100a_3ph numeric NOT NULL DEFAULT 850,
  ADD COLUMN jointing_lv_each numeric NOT NULL DEFAULT 1800;