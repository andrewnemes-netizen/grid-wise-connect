
ALTER TABLE public.npg_circuit_monthly RENAME TO ukpn_circuit_monthly;

DROP VIEW IF EXISTS public.npg_circuit_latest_utilisation;
CREATE OR REPLACE VIEW public.ukpn_circuit_latest_utilisation AS
WITH ranked AS (
  SELECT *, row_number() OVER (PARTITION BY circuit_id, voltage_kv ORDER BY year DESC, month DESC) AS rn,
         max(peak_mw) OVER (PARTITION BY circuit_id, voltage_kv) AS peak_12mo_mw
  FROM public.ukpn_circuit_monthly
)
SELECT circuit_id, voltage_kv, licence_area, year, month, peak_mw, peak_amps, rating_mva, utilisation_pct, peak_12mo_mw
FROM ranked WHERE rn = 1;

GRANT SELECT ON public.ukpn_circuit_latest_utilisation TO authenticated, anon, service_role;

DROP FUNCTION IF EXISTS public.npg_circuits_for_substation(text);

CREATE OR REPLACE FUNCTION public.ukpn_circuits_for_substation(p_name text)
RETURNS TABLE (
  circuit_id text,
  voltage_kv int,
  feeder_description text,
  from_node text,
  to_node text,
  grid_supply_point text,
  latest_year int,
  latest_month int,
  peak_mw numeric,
  peak_amps numeric,
  months_12_peak_mw numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (SELECT lower(coalesce(p_name,'')) AS n),
  matched AS (
    SELECT m.* FROM public.ukpn_circuit_monthly m, q
    WHERE q.n <> '' AND (
      lower(coalesce(m.raw_json->>'grid_supply_point','')) LIKE '%' || q.n || '%'
      OR lower(coalesce(m.raw_json->>'feeder_description','')) LIKE '%' || q.n || '%'
      OR lower(coalesce(m.raw_json->>'from_ltds_node','')) = q.n
      OR lower(coalesce(m.raw_json->>'to_ltds_node','')) = q.n
    )
  ),
  latest AS (
    SELECT DISTINCT ON (circuit_id)
      circuit_id, voltage_kv,
      raw_json->>'feeder_description' AS feeder_description,
      raw_json->>'from_ltds_node' AS from_node,
      raw_json->>'to_ltds_node' AS to_node,
      raw_json->>'grid_supply_point' AS grid_supply_point,
      year, month, peak_mw, peak_amps
    FROM matched ORDER BY circuit_id, year DESC, month DESC
  ),
  peak12 AS (
    SELECT circuit_id, max(peak_mw) AS p12 FROM matched
    WHERE (year*12 + month) >= (SELECT max(year*12 + month) - 11 FROM matched)
    GROUP BY circuit_id
  )
  SELECT l.circuit_id, l.voltage_kv, l.feeder_description, l.from_node, l.to_node,
         l.grid_supply_point, l.year, l.month, l.peak_mw, l.peak_amps, p.p12
  FROM latest l LEFT JOIN peak12 p USING (circuit_id)
  ORDER BY p.p12 DESC NULLS LAST LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.ukpn_circuits_for_substation(text) TO authenticated, anon, service_role;
