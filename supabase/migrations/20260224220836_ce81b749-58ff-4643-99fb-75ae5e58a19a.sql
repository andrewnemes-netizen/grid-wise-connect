
DROP FUNCTION IF EXISTS public.search_substations_in_polygon(text, integer);

CREATE OR REPLACE FUNCTION public.search_substations_in_polygon(_geojson text, _limit integer DEFAULT 500)
RETURNS TABLE(
  id text,
  site_name text,
  site_id text,
  utilisation_pct double precision,
  utilisation_band text,
  firm_capacity_kw double precision,
  max_demand_kw double precision,
  transformer_headroom_kw double precision,
  headroom_band text,
  connected_customers integer,
  upstream_site text
)
LANGUAGE sql STABLE
AS $$
  WITH search_geom AS (
    SELECT ST_SetSRID(ST_GeomFromGeoJSON(_geojson), 4326) AS geom4326
  ),
  -- site_utilisation (SRID 27700)
  su_results AS (
    SELECT
      su.id::text,
      su.site_name,
      su.site_id,
      su.utilisation_pct::double precision,
      su.utilisation_band,
      su.firm_capacity_kw::double precision,
      su.max_demand_kw::double precision,
      su.transformer_headroom_kw::double precision,
      su.headroom_band,
      su.connected_customers::integer,
      su.upstream_site
    FROM site_utilisation su, search_geom sg
    WHERE su.geom IS NOT NULL
      AND ST_Within(su.geom, ST_Transform(sg.geom4326, 27700))
  ),
  -- geo_substations (SRID 4326) — includes GSP, BSP, primary etc.
  gs_results AS (
    SELECT
      gs.id::text,
      COALESCE(gs.name, (gs.attrs_json->>'psp_name')::text, 'Substation') AS site_name,
      COALESCE(gs.asset_id, '') AS site_id,
      COALESCE(gs.utilisation_pct, (gs.attrs_json->>'utilisation_pct')::numeric)::double precision AS utilisation_pct,
      (gs.attrs_json->>'utilisation_band')::text AS utilisation_band,
      COALESCE(gs.capacity_kw, (gs.attrs_json->>'firm_cap')::numeric)::double precision AS firm_capacity_kw,
      COALESCE(gs.demand_kw, (gs.attrs_json->>'maxdemand')::numeric)::double precision AS max_demand_kw,
      COALESCE(gs.headroom_kw, (gs.attrs_json->>'demhr')::numeric)::double precision AS transformer_headroom_kw,
      (gs.attrs_json->>'headroom_band')::text AS headroom_band,
      (gs.attrs_json->>'connected_customers')::integer AS connected_customers,
      (gs.attrs_json->>'upstream_site')::text AS upstream_site
    FROM geo_substations gs, search_geom sg
    WHERE gs.geom IS NOT NULL
      AND ST_Within(gs.geom, sg.geom4326)
  ),
  combined AS (
    SELECT * FROM su_results
    UNION ALL
    SELECT * FROM gs_results
  )
  SELECT * FROM combined LIMIT _limit;
$$;
