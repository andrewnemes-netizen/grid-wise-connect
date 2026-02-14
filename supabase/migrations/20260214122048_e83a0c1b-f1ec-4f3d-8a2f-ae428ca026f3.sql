
-- Wrapper function that accepts WGS84 lng/lat and transforms to BNG before scoring
CREATE OR REPLACE FUNCTION public.score_site_from_lnglat(
  _lng DOUBLE PRECISION,
  _lat DOUBLE PRECISION,
  _proposed_kw NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  site_geom geometry;
BEGIN
  site_geom := ST_Transform(ST_SetSRID(ST_MakePoint(_lng, _lat), 4326), 27700);
  RETURN public.score_site(site_geom, _proposed_kw);
END;
$$;
