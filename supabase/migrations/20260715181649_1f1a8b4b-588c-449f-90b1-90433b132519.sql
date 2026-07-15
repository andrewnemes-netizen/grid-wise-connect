
CREATE OR REPLACE FUNCTION public.set_site_geom_wgs84(_site_id uuid, _lng numeric, _lat numeric)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  UPDATE public.sites
     SET geom = ST_Transform(ST_SetSRID(ST_MakePoint(_lng, _lat), 4326), 27700)
   WHERE id = _site_id;
$$;

GRANT EXECUTE ON FUNCTION public.set_site_geom_wgs84(uuid, numeric, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_site_geom_wgs84(uuid, numeric, numeric) TO authenticated;
