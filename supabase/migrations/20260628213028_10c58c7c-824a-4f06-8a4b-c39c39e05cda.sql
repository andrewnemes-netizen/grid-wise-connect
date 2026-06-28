-- SSEN LTDS Demand Data (Table 3 of LTDS XLSX)
CREATE TABLE IF NOT EXISTS public.ssen_ltds_demand (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region TEXT NOT NULL,                 -- 'SEPD' | 'SHEPD'
  gsp_group TEXT,
  site_name TEXT NOT NULL,
  site_name_normalised TEXT NOT NULL,   -- upper-cased, single-spaced for matching
  voltage_kv NUMERIC,
  recorded_demand_mva NUMERIC,
  power_factor NUMERIC,
  firm_capacity_mva NUMERIC,
  forecast_json JSONB,                  -- {"2024/25": 17.7, "2025/26": 19.9, ...}
  source_date DATE,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region, site_name_normalised, voltage_kv)
);

CREATE INDEX IF NOT EXISTS idx_ssen_ltds_demand_name ON public.ssen_ltds_demand (site_name_normalised);
CREATE INDEX IF NOT EXISTS idx_ssen_ltds_demand_region ON public.ssen_ltds_demand (region);

GRANT SELECT ON public.ssen_ltds_demand TO authenticated;
GRANT ALL ON public.ssen_ltds_demand TO service_role;

ALTER TABLE public.ssen_ltds_demand ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read SSEN LTDS demand"
  ON public.ssen_ltds_demand FOR SELECT
  TO authenticated USING (true);

-- SSEN LTDS Fault levels (Tables 4a/4b)
CREATE TABLE IF NOT EXISTS public.ssen_ltds_fault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region TEXT NOT NULL,
  gsp_group TEXT,
  site_name TEXT NOT NULL,
  site_name_normalised TEXT NOT NULL,
  voltage_kv NUMERIC,
  three_phase_break_ka NUMERIC,
  three_phase_peak_make_ka NUMERIC,
  fault_eq_mva NUMERIC,
  cb_make_ka NUMERIC,
  cb_break_ka NUMERIC,
  source_date DATE,
  raw_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region, site_name_normalised, voltage_kv)
);

CREATE INDEX IF NOT EXISTS idx_ssen_ltds_fault_name ON public.ssen_ltds_fault (site_name_normalised);

GRANT SELECT ON public.ssen_ltds_fault TO authenticated;
GRANT ALL ON public.ssen_ltds_fault TO service_role;

ALTER TABLE public.ssen_ltds_fault ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read SSEN LTDS fault"
  ON public.ssen_ltds_fault FOR SELECT
  TO authenticated USING (true);

-- updated_at triggers (reuse update_updated_at_column if it exists)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_ssen_ltds_demand_updated ON public.ssen_ltds_demand;
CREATE TRIGGER trg_ssen_ltds_demand_updated BEFORE UPDATE ON public.ssen_ltds_demand
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ssen_ltds_fault_updated ON public.ssen_ltds_fault;
CREATE TRIGGER trg_ssen_ltds_fault_updated BEFORE UPDATE ON public.ssen_ltds_fault
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();