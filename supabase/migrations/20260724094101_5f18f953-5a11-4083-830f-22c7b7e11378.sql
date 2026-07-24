CREATE OR REPLACE FUNCTION public.get_sites_for_poc(_site_ids uuid[])
RETURNS TABLE(id uuid, site_name text, postcode text, client_site_code text, socket_count integer, proposed_kw numeric, lat double precision, lng double precision, socket_groups jsonb)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    s.id,
    s.site_name,
    s.postcode,
    s.client_site_code,
    s.socket_count,
    s.proposed_kw,
    CASE WHEN s.geom IS NOT NULL
      THEN ST_Y(ST_Transform(s.geom::geometry, 4326))
    END AS lat,
    CASE WHEN s.geom IS NOT NULL
      THEN ST_X(ST_Transform(s.geom::geometry, 4326))
    END AS lng,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                 'id', g.id,
                 'quantity', g.quantity,
                 'power_rating_kw', g.power_rating_kw,
                 'phases', g.phases,
                 'sort_order', g.sort_order
              ) ORDER BY g.sort_order, g.power_rating_kw DESC)
         FROM public.site_socket_groups g WHERE g.site_id = s.id),
      '[]'::jsonb
    ) AS socket_groups
  FROM public.sites s
  WHERE s.id = ANY(_site_ids);
$function$;