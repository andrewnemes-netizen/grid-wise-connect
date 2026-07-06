CREATE OR REPLACE FUNCTION public.advisor_search_site_utilisation(center_lng double precision, center_lat double precision, radius_m double precision, min_headroom double precision DEFAULT NULL, max_util double precision DEFAULT NULL, la text DEFAULT NULL, max_rows integer DEFAULT 50)
RETURNS TABLE(id text, name text, dno text, headroom_kw numeric, utilisation_pct integer, local_authority text, distance_m double precision, lat double precision, lng double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with g as (
    select su.id, su.site_name, su.licence_area, su.transformer_headroom_kw, su.utilisation_pct, su.local_authority,
           ST_Transform(su.geom, 4326) as g4326
    from public.site_utilisation su
    where su.geom is not null
      and (min_headroom is null or su.transformer_headroom_kw >= min_headroom)
      and (max_util is null or su.utilisation_pct <= max_util)
      and (la is null or su.local_authority ilike '%' || la || '%')
  )
  select g.id::text, g.site_name, g.licence_area, g.transformer_headroom_kw, g.utilisation_pct, g.local_authority,
         ST_Distance(g.g4326::geography, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography),
         ST_Y(g.g4326), ST_X(g.g4326)
  from g
  where ST_DWithin(g.g4326::geography, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography, radius_m)
  order by ST_Distance(g.g4326::geography, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography)
  limit max_rows;
$function$;