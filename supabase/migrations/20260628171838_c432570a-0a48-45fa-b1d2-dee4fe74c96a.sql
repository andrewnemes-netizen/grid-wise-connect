
CREATE TABLE public.npg_circuit_monthly (
  circuit_id text NOT NULL,
  voltage_kv numeric NOT NULL,
  licence_area text,
  year int NOT NULL,
  month int NOT NULL,
  peak_mw numeric,
  peak_mvar numeric,
  peak_mva numeric,
  peak_amps numeric,
  rating_mva numeric,
  utilisation_pct numeric GENERATED ALWAYS AS (
    CASE WHEN rating_mva IS NOT NULL AND rating_mva > 0 AND peak_mva IS NOT NULL
         THEN (peak_mva / rating_mva) * 100 END
  ) STORED,
  raw_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (circuit_id, voltage_kv, year, month)
);

CREATE INDEX idx_npg_circuit_monthly_cid ON public.npg_circuit_monthly (circuit_id);
CREATE INDEX idx_npg_circuit_monthly_cid_ym ON public.npg_circuit_monthly (circuit_id, year DESC, month DESC);

GRANT SELECT ON public.npg_circuit_monthly TO anon, authenticated;
GRANT ALL ON public.npg_circuit_monthly TO service_role;

ALTER TABLE public.npg_circuit_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read npg_circuit_monthly" ON public.npg_circuit_monthly
  FOR SELECT USING (true);
CREATE POLICY "Service role manages npg_circuit_monthly" ON public.npg_circuit_monthly
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Latest 12 months peak per circuit
CREATE OR REPLACE VIEW public.npg_circuit_latest_utilisation AS
WITH recent AS (
  SELECT m.*
  FROM public.npg_circuit_monthly m
  WHERE make_date(m.year, m.month, 1) >= (
    SELECT (date_trunc('month', max(make_date(year, month, 1))) - interval '11 months')::date
    FROM public.npg_circuit_monthly
  )
),
ranked AS (
  SELECT
    circuit_id,
    voltage_kv,
    licence_area,
    peak_mw,
    peak_mva,
    peak_amps,
    rating_mva,
    utilisation_pct,
    year,
    month,
    row_number() OVER (
      PARTITION BY circuit_id
      ORDER BY utilisation_pct DESC NULLS LAST, peak_mva DESC NULLS LAST, year DESC, month DESC
    ) AS rn
  FROM recent
)
SELECT circuit_id, voltage_kv, licence_area, peak_mw, peak_mva, peak_amps,
       rating_mva, utilisation_pct, year, month
FROM ranked
WHERE rn = 1;

GRANT SELECT ON public.npg_circuit_latest_utilisation TO anon, authenticated;
