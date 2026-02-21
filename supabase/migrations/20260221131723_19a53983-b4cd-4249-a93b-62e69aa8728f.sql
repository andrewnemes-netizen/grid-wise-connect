-- Add service_allowed and mains_allowed flags to cable_catalogue
ALTER TABLE public.cable_catalogue
  ADD COLUMN IF NOT EXISTS service_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mains_allowed boolean NOT NULL DEFAULT false;

-- Set sensible defaults based on existing cable types
-- LV cables: smaller cross-sections are service, larger are mains
UPDATE public.cable_catalogue SET mains_allowed = true WHERE voltage_class = 'LV';
UPDATE public.cable_catalogue SET service_allowed = true WHERE voltage_class = 'LV' AND diameter_mm <= 30;

-- HV/EHV cables are mains only (not relevant for V1 LV optimiser but correct metadata)
UPDATE public.cable_catalogue SET mains_allowed = true WHERE voltage_class IN ('HV', 'EHV');
UPDATE public.cable_catalogue SET service_allowed = false WHERE voltage_class IN ('HV', 'EHV');