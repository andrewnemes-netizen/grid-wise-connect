CREATE OR REPLACE FUNCTION public.wp_sites_ensure_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.site_stage_status (work_package_id, site_id, stage)
  SELECT NEW.work_package_id, NEW.site_id, s
  FROM unnest(enum_range(NULL::site_stage_key)) AS s
  ON CONFLICT (site_id, stage) DO NOTHING;
  RETURN NEW;
END $function$;