
CREATE OR REPLACE FUNCTION public.search_substations_in_polygon(_geojson text, _limit integer DEFAULT 500)
RETURNS SETOF site_utilisation
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT su.*
  FROM site_utilisation su
  WHERE su.geom IS NOT NULL
    AND ST_Within(
      su.geom,
      ST_SetSRID(ST_GeomFromGeoJSON(_geojson), 4326)
    )
  LIMIT _limit;
$$;
