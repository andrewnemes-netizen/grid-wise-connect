CREATE OR REPLACE FUNCTION public.get_sites_for_poc(_site_ids uuid[])
RETURNS TABLE (
  id uuid,
  site_name text,
  postcode text,
  client_site_code text,
  socket_count integer,
  proposed_kw numeric,
  lat double precision,
  lng double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT s.id, s.site_name, s.postcode, s.client_site_code, s.socket_count, s.proposed_kw,
         CASE WHEN s.geom IS NOT NULL THEN ST_Y(s.geom::geometry) END AS lat,
         CASE WHEN s.geom IS NOT NULL THEN ST_X(s.geom::geometry) END AS lng
  FROM public.sites s
  WHERE s.id = ANY(_site_ids);
$$;

REVOKE EXECUTE ON FUNCTION public.get_sites_for_poc(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sites_for_poc(uuid[]) TO authenticated, service_role;