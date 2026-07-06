
create or replace function public.advisor_search_site_utilisation(
  center_lng double precision, center_lat double precision, radius_m double precision,
  min_headroom double precision default null,
  max_util double precision default null,
  la text default null,
  max_rows int default 50
) returns table (
  id text, name text, dno text, headroom_kw numeric, utilisation_pct integer,
  local_authority text, distance_m double precision, lat double precision, lng double precision
) language sql stable security definer set search_path = public as $$
  select su.id::text, su.site_name, su.licence_area,
         su.transformer_headroom_kw, su.utilisation_pct, su.local_authority,
         ST_Distance(su.geom::geography, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography),
         ST_Y(su.geom::geometry), ST_X(su.geom::geometry)
  from public.site_utilisation su
  where su.geom is not null
    and ST_DWithin(su.geom::geography, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography, radius_m)
    and (min_headroom is null or su.transformer_headroom_kw >= min_headroom)
    and (max_util is null or su.utilisation_pct <= max_util)
    and (la is null or su.local_authority ilike '%' || la || '%')
  order by ST_Distance(su.geom::geography, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography)
  limit max_rows;
$$;

create or replace function public.advisor_search_geo_substations(
  center_lng double precision, center_lat double precision, radius_m double precision,
  v_min double precision default null, v_max double precision default null,
  min_headroom double precision default null,
  max_util double precision default null,
  max_rows int default 50
) returns table (
  id text, name text, dno text, voltage_kv numeric,
  headroom_kw numeric, utilisation_pct numeric,
  distance_m double precision, lat double precision, lng double precision
) language sql stable security definer set search_path = public as $$
  select gs.id::text, gs.name, gs.dno, gs.voltage_kv, gs.headroom_kw, gs.utilisation_pct,
         ST_Distance(gs.geom::geography, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography),
         ST_Y(gs.geom::geometry), ST_X(gs.geom::geometry)
  from public.geo_substations gs
  where gs.geom is not null
    and ST_DWithin(gs.geom::geography, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography, radius_m)
    and (v_min is null or gs.voltage_kv >= v_min)
    and (v_max is null or gs.voltage_kv <= v_max)
    and (min_headroom is null or gs.headroom_kw >= min_headroom)
    and (max_util is null or gs.utilisation_pct <= max_util)
  order by ST_Distance(gs.geom::geography, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography)
  limit max_rows;
$$;

create or replace function public.advisor_search_geo_feeders(
  center_lng double precision, center_lat double precision, radius_m double precision,
  v_min double precision default null, v_max double precision default null,
  max_rows int default 50
) returns table (
  id text, name text, dno text, voltage_kv numeric,
  distance_m double precision, lat double precision, lng double precision
) language sql stable security definer set search_path = public as $$
  select gf.id::text, gf.name, gf.dno, gf.voltage_kv,
         ST_Distance(gf.geom::geography, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography),
         ST_Y(ST_Centroid(gf.geom::geometry)), ST_X(ST_Centroid(gf.geom::geometry))
  from public.geo_feeders gf
  where gf.geom is not null
    and ST_DWithin(gf.geom::geography, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography, radius_m)
    and (v_min is null or gf.voltage_kv >= v_min)
    and (v_max is null or gf.voltage_kv <= v_max)
  order by ST_Distance(gf.geom::geography, ST_SetSRID(ST_MakePoint(center_lng, center_lat), 4326)::geography)
  limit max_rows;
$$;

grant execute on function public.advisor_search_site_utilisation(double precision, double precision, double precision, double precision, double precision, text, int) to authenticated, service_role;
grant execute on function public.advisor_search_geo_substations(double precision, double precision, double precision, double precision, double precision, double precision, double precision, int) to authenticated, service_role;
grant execute on function public.advisor_search_geo_feeders(double precision, double precision, double precision, double precision, double precision, int) to authenticated, service_role;
