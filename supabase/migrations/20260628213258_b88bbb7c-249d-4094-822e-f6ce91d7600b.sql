
CREATE OR REPLACE FUNCTION public.ssen_substation_capacity_lookup(_name TEXT)
RETURNS TABLE (
  region TEXT,
  site_name TEXT,
  voltage_kv NUMERIC,
  firm_capacity_mva NUMERIC,
  recorded_demand_mva NUMERIC,
  power_factor NUMERIC,
  headroom_mva NUMERIC,
  forecast_json JSONB,
  source_date DATE,
  fault_break_ka NUMERIC,
  fault_make_ka NUMERIC
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH norm AS (SELECT upper(regexp_replace(coalesce(_name, ''), '\s+', ' ', 'g')) AS n),
  best AS (
    SELECT d.*,
           CASE
             WHEN d.site_name_normalised = (SELECT n FROM norm) THEN 0
             WHEN d.site_name_normalised LIKE (SELECT n FROM norm) || '%' THEN 1
             WHEN d.site_name_normalised LIKE '%' || (SELECT n FROM norm) || '%' THEN 2
             ELSE 3
           END AS match_rank
      FROM public.ssen_ltds_demand d
     WHERE (SELECT length(n) FROM norm) >= 3
       AND (d.site_name_normalised = (SELECT n FROM norm)
            OR d.site_name_normalised LIKE '%' || (SELECT n FROM norm) || '%')
     ORDER BY match_rank ASC, d.voltage_kv DESC NULLS LAST
     LIMIT 1
  )
  SELECT b.region,
         b.site_name,
         b.voltage_kv,
         b.firm_capacity_mva,
         b.recorded_demand_mva,
         b.power_factor,
         CASE WHEN b.firm_capacity_mva IS NOT NULL AND b.recorded_demand_mva IS NOT NULL
              THEN b.firm_capacity_mva - b.recorded_demand_mva END AS headroom_mva,
         b.forecast_json,
         b.source_date,
         f.three_phase_break_ka,
         f.three_phase_peak_make_ka
    FROM best b
    LEFT JOIN public.ssen_ltds_fault f
      ON f.region = b.region
     AND f.site_name_normalised = b.site_name_normalised
     AND f.voltage_kv = b.voltage_kv;
$$;

GRANT EXECUTE ON FUNCTION public.ssen_substation_capacity_lookup(TEXT) TO authenticated;

INSERT INTO public.dno_dataset_registry (dno, dataset_id, title, description, is_geospatial, active, portal_url, refresh_strategy, schedule)
VALUES
  ('SSEN', 'dx-sepd_long_term_development_statement',
   'SEPD Long Term Development Statement (LTDS)',
   'Capacity, demand and fault level tables for SEPD primary/grid substations. Parsed into ssen_ltds_demand and ssen_ltds_fault.',
   false, true,
   'https://data-api.ssen.co.uk/dataset/sepd_long_term_development_statement',
   'full', 'manual'),
  ('SSEN', 'dx-shepd_long_term_development_statement',
   'SHEPD Long Term Development Statement (LTDS)',
   'Capacity, demand and fault level tables for SHEPD primary/grid substations. Parsed into ssen_ltds_demand and ssen_ltds_fault.',
   false, true,
   'https://data-api.ssen.co.uk/dataset/shepd_long_term_development_statement',
   'full', 'manual')
ON CONFLICT (dno, dataset_id) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    is_geospatial = EXCLUDED.is_geospatial,
    portal_url = EXCLUDED.portal_url,
    active = true;
