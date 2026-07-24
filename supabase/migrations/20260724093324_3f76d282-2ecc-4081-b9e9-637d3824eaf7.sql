CREATE OR REPLACE VIEW public.v_sites_latlng
WITH (security_invoker=true) AS
SELECT
  s.id,
  ST_Y(ST_Transform(s.geom, 4326))::double precision AS lat,
  ST_X(ST_Transform(s.geom, 4326))::double precision AS lng
FROM public.sites s
WHERE s.geom IS NOT NULL;

GRANT SELECT ON public.v_sites_latlng TO authenticated;