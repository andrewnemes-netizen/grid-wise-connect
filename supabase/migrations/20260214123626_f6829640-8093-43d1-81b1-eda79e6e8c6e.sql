
-- Function to update geom from eastings/northings for site_utilisation rows without geom
CREATE OR REPLACE FUNCTION public.update_site_utilisation_geom()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.site_utilisation
  SET geom = ST_SetSRID(ST_MakePoint(site_easting, site_northing), 27700)
  WHERE geom IS NULL
    AND site_easting IS NOT NULL
    AND site_northing IS NOT NULL;
END;
$$;
