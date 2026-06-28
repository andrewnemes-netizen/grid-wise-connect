
CREATE OR REPLACE FUNCTION public.ssen_substation_capacity_lookup(_name text)
RETURNS TABLE(region text, site_name text, voltage_kv numeric, firm_capacity_mva numeric, recorded_demand_mva numeric, power_factor numeric, headroom_mva numeric, forecast_json jsonb, source_date date, fault_break_ka numeric, fault_make_ka numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH raw AS (
    SELECT upper(regexp_replace(coalesce(_name, ''), '\s+', ' ', 'g')) AS n0
  ),
  norm AS (
    SELECT
      trim(
        regexp_replace(
          regexp_replace(n0, '\m\d+(\.\d+)?\s*KV(\s*/\s*[A-Z]+)?\m', '', 'g'),
          '\s+', ' ', 'g'
        )
      ) AS n
    FROM raw
  ),
  best AS (
    SELECT d.*,
      CASE
        WHEN d.site_name_normalised = (SELECT n FROM norm) THEN 0
        WHEN d.site_name_normalised LIKE (SELECT n FROM norm) || ' %' THEN 1
        WHEN (SELECT n FROM norm) LIKE d.site_name_normalised || ' %' THEN 1
        WHEN d.site_name_normalised LIKE '%' || (SELECT n FROM norm) || '%' THEN 2
        WHEN (SELECT n FROM norm) LIKE '%' || d.site_name_normalised || '%' THEN 2
        ELSE 3
      END AS match_rank
    FROM public.ssen_ltds_demand d
    WHERE (SELECT length(n) FROM norm) >= 3
      AND (
        d.site_name_normalised = (SELECT n FROM norm)
        OR d.site_name_normalised LIKE '%' || (SELECT n FROM norm) || '%'
        OR (SELECT n FROM norm) LIKE '%' || d.site_name_normalised || '%'
      )
    ORDER BY match_rank ASC, d.voltage_kv DESC NULLS LAST
    LIMIT 1
  )
  SELECT b.region, b.site_name, b.voltage_kv, b.firm_capacity_mva, b.recorded_demand_mva, b.power_factor,
    CASE WHEN b.firm_capacity_mva IS NOT NULL AND b.recorded_demand_mva IS NOT NULL
         THEN b.firm_capacity_mva - b.recorded_demand_mva END AS headroom_mva,
    b.forecast_json, b.source_date, f.three_phase_break_ka, f.three_phase_peak_make_ka
  FROM best b
  LEFT JOIN public.ssen_ltds_fault f
    ON f.region = b.region AND f.site_name_normalised = b.site_name_normalised;
$function$;
