
-- ───────── Table 2a: 2-winding transformers ─────────
CREATE TABLE public.ukpn_ltds_transformers_2w (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sitefunctionallocation text NOT NULL,
  site_name text,
  voltage_kv numeric,
  firm_capacity_mva numeric,
  cyclic_rating_mva numeric,
  nameplate_mva numeric,
  year integer,
  raw_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sitefunctionallocation, voltage_kv, year)
);
CREATE INDEX idx_ltds_2w_sfl ON public.ukpn_ltds_transformers_2w (sitefunctionallocation);
GRANT SELECT ON public.ukpn_ltds_transformers_2w TO anon, authenticated;
GRANT ALL ON public.ukpn_ltds_transformers_2w TO service_role;
ALTER TABLE public.ukpn_ltds_transformers_2w ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ltds_2w_read" ON public.ukpn_ltds_transformers_2w FOR SELECT USING (true);
CREATE POLICY "ltds_2w_admin" ON public.ukpn_ltds_transformers_2w FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ───────── Table 2b: 3-winding transformers ─────────
CREATE TABLE public.ukpn_ltds_transformers_3w (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sitefunctionallocation text NOT NULL,
  site_name text,
  voltage_kv numeric,
  firm_capacity_mva numeric,
  cyclic_rating_mva numeric,
  nameplate_mva numeric,
  tertiary_voltage_kv numeric,
  tertiary_rating_mva numeric,
  year integer,
  raw_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sitefunctionallocation, voltage_kv, year)
);
CREATE INDEX idx_ltds_3w_sfl ON public.ukpn_ltds_transformers_3w (sitefunctionallocation);
GRANT SELECT ON public.ukpn_ltds_transformers_3w TO anon, authenticated;
GRANT ALL ON public.ukpn_ltds_transformers_3w TO service_role;
ALTER TABLE public.ukpn_ltds_transformers_3w ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ltds_3w_read" ON public.ukpn_ltds_transformers_3w FOR SELECT USING (true);
CREATE POLICY "ltds_3w_admin" ON public.ukpn_ltds_transformers_3w FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ───────── Table 3a: observed peak demand ─────────
CREATE TABLE public.ukpn_ltds_peak_demand_observed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sitefunctionallocation text NOT NULL,
  site_name text,
  voltage_kv numeric,
  peak_mw numeric,
  peak_mvar numeric,
  year integer,
  season text,
  raw_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sitefunctionallocation, voltage_kv, year, season)
);
CREATE INDEX idx_ltds_3a_sfl ON public.ukpn_ltds_peak_demand_observed (sitefunctionallocation);
GRANT SELECT ON public.ukpn_ltds_peak_demand_observed TO anon, authenticated;
GRANT ALL ON public.ukpn_ltds_peak_demand_observed TO service_role;
ALTER TABLE public.ukpn_ltds_peak_demand_observed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ltds_3a_read" ON public.ukpn_ltds_peak_demand_observed FOR SELECT USING (true);
CREATE POLICY "ltds_3a_admin" ON public.ukpn_ltds_peak_demand_observed FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ───────── Table 3b: true peak demand ─────────
CREATE TABLE public.ukpn_ltds_peak_demand_true (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sitefunctionallocation text NOT NULL,
  site_name text,
  voltage_kv numeric,
  peak_mw numeric,
  peak_mvar numeric,
  year integer,
  season text,
  raw_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sitefunctionallocation, voltage_kv, year, season)
);
CREATE INDEX idx_ltds_3b_sfl ON public.ukpn_ltds_peak_demand_true (sitefunctionallocation);
GRANT SELECT ON public.ukpn_ltds_peak_demand_true TO anon, authenticated;
GRANT ALL ON public.ukpn_ltds_peak_demand_true TO service_role;
ALTER TABLE public.ukpn_ltds_peak_demand_true ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ltds_3b_read" ON public.ukpn_ltds_peak_demand_true FOR SELECT USING (true);
CREATE POLICY "ltds_3b_admin" ON public.ukpn_ltds_peak_demand_true FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ───────── Table 4a: 3-phase fault ─────────
CREATE TABLE public.ukpn_ltds_fault_3ph (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sitefunctionallocation text NOT NULL,
  site_name text,
  voltage_kv numeric,
  fault_level_ka numeric,
  x_r_ratio numeric,
  year integer,
  raw_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sitefunctionallocation, voltage_kv, year)
);
CREATE INDEX idx_ltds_4a_sfl ON public.ukpn_ltds_fault_3ph (sitefunctionallocation);
GRANT SELECT ON public.ukpn_ltds_fault_3ph TO anon, authenticated;
GRANT ALL ON public.ukpn_ltds_fault_3ph TO service_role;
ALTER TABLE public.ukpn_ltds_fault_3ph ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ltds_4a_read" ON public.ukpn_ltds_fault_3ph FOR SELECT USING (true);
CREATE POLICY "ltds_4a_admin" ON public.ukpn_ltds_fault_3ph FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ───────── Table 4b: earth fault ─────────
CREATE TABLE public.ukpn_ltds_fault_earth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sitefunctionallocation text NOT NULL,
  site_name text,
  voltage_kv numeric,
  fault_level_ka numeric,
  year integer,
  raw_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sitefunctionallocation, voltage_kv, year)
);
CREATE INDEX idx_ltds_4b_sfl ON public.ukpn_ltds_fault_earth (sitefunctionallocation);
GRANT SELECT ON public.ukpn_ltds_fault_earth TO anon, authenticated;
GRANT ALL ON public.ukpn_ltds_fault_earth TO service_role;
ALTER TABLE public.ukpn_ltds_fault_earth ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ltds_4b_read" ON public.ukpn_ltds_fault_earth FOR SELECT USING (true);
CREATE POLICY "ltds_4b_admin" ON public.ukpn_ltds_fault_earth FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ───────── Lookup RPC ─────────
CREATE OR REPLACE FUNCTION public.ukpn_substation_capacity_lookup(_sfl text)
RETURNS TABLE (
  sitefunctionallocation text,
  voltage_kv numeric,
  firm_capacity_mva numeric,
  cyclic_rating_mva numeric,
  peak_observed_mw numeric,
  peak_true_mw numeric,
  headroom_observed_mva numeric,
  headroom_true_mva numeric,
  fault_3ph_ka numeric,
  fault_earth_ka numeric,
  year integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH tx AS (
    SELECT sitefunctionallocation, voltage_kv, firm_capacity_mva, cyclic_rating_mva, year
    FROM public.ukpn_ltds_transformers_2w
    WHERE sitefunctionallocation = _sfl
    UNION ALL
    SELECT sitefunctionallocation, voltage_kv, firm_capacity_mva, cyclic_rating_mva, year
    FROM public.ukpn_ltds_transformers_3w
    WHERE sitefunctionallocation = _sfl
  ),
  tx_latest AS (
    SELECT DISTINCT ON (voltage_kv)
      sitefunctionallocation, voltage_kv, firm_capacity_mva, cyclic_rating_mva, year
    FROM tx
    ORDER BY voltage_kv, year DESC NULLS LAST
  ),
  obs AS (
    SELECT DISTINCT ON (voltage_kv) voltage_kv, peak_mw, year
    FROM public.ukpn_ltds_peak_demand_observed
    WHERE sitefunctionallocation = _sfl
    ORDER BY voltage_kv, year DESC NULLS LAST
  ),
  tru AS (
    SELECT DISTINCT ON (voltage_kv) voltage_kv, peak_mw, year
    FROM public.ukpn_ltds_peak_demand_true
    WHERE sitefunctionallocation = _sfl
    ORDER BY voltage_kv, year DESC NULLS LAST
  ),
  f3 AS (
    SELECT DISTINCT ON (voltage_kv) voltage_kv, fault_level_ka
    FROM public.ukpn_ltds_fault_3ph
    WHERE sitefunctionallocation = _sfl
    ORDER BY voltage_kv, year DESC NULLS LAST
  ),
  fe AS (
    SELECT DISTINCT ON (voltage_kv) voltage_kv, fault_level_ka
    FROM public.ukpn_ltds_fault_earth
    WHERE sitefunctionallocation = _sfl
    ORDER BY voltage_kv, year DESC NULLS LAST
  )
  SELECT
    _sfl,
    tx_latest.voltage_kv,
    tx_latest.firm_capacity_mva,
    tx_latest.cyclic_rating_mva,
    obs.peak_mw,
    tru.peak_mw,
    CASE WHEN tx_latest.firm_capacity_mva IS NOT NULL AND obs.peak_mw IS NOT NULL
         THEN tx_latest.firm_capacity_mva - obs.peak_mw END,
    CASE WHEN tx_latest.firm_capacity_mva IS NOT NULL AND tru.peak_mw IS NOT NULL
         THEN tx_latest.firm_capacity_mva - tru.peak_mw END,
    f3.fault_level_ka,
    fe.fault_level_ka,
    tx_latest.year
  FROM tx_latest
  LEFT JOIN obs USING (voltage_kv)
  LEFT JOIN tru USING (voltage_kv)
  LEFT JOIN f3  USING (voltage_kv)
  LEFT JOIN fe  USING (voltage_kv)
  ORDER BY tx_latest.voltage_kv DESC;
$$;

GRANT EXECUTE ON FUNCTION public.ukpn_substation_capacity_lookup(text) TO anon, authenticated, service_role;
