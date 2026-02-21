-- Increase statement timeout for the heavy spatial scoring function
CREATE OR REPLACE FUNCTION public.score_site_from_lnglat(_lng double precision, _lat double precision, _proposed_kw numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '25s'
AS $function$
DECLARE
  site_geom geometry;
BEGIN
  site_geom := ST_Transform(ST_SetSRID(ST_MakePoint(_lng, _lat), 4326), 27700);
  RETURN public.score_site(site_geom, _proposed_kw);
END;
$function$;