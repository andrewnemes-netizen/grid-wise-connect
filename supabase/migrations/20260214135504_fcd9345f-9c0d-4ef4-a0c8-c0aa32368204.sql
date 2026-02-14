
-- Single-row table storing customisable unit rates
CREATE TABLE public.unit_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cable_lv_per_m numeric NOT NULL DEFAULT 85,
  cable_hv_per_m numeric NOT NULL DEFAULT 145,
  cable_ehv_per_m numeric NOT NULL DEFAULT 280,
  excavation_footway_per_m numeric NOT NULL DEFAULT 120,
  excavation_carriageway_per_m numeric NOT NULL DEFAULT 210,
  excavation_verge_per_m numeric NOT NULL DEFAULT 65,
  jointing_each numeric NOT NULL DEFAULT 2800,
  switchgear_ring_main numeric NOT NULL DEFAULT 18500,
  switchgear_circuit_breaker numeric NOT NULL DEFAULT 35000,
  transformer_500kva numeric NOT NULL DEFAULT 22000,
  transformer_1000kva numeric NOT NULL DEFAULT 38000,
  transformer_1500kva numeric NOT NULL DEFAULT 52000,
  metering_ct numeric NOT NULL DEFAULT 4500,
  metering_wc numeric NOT NULL DEFAULT 1200,
  design_fee_pct numeric NOT NULL DEFAULT 0.08,
  project_management_pct numeric NOT NULL DEFAULT 0.06,
  contingency_pct numeric NOT NULL DEFAULT 0.10,
  reinforcement_per_kw_over_capacity numeric NOT NULL DEFAULT 85,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.unit_rates ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read rates (needed for cost estimation)
CREATE POLICY "Authenticated users can read unit_rates"
  ON public.unit_rates FOR SELECT TO authenticated
  USING (true);

-- Only admins can modify
CREATE POLICY "Admins can manage unit_rates"
  ON public.unit_rates FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed with defaults
INSERT INTO public.unit_rates (id) VALUES (gen_random_uuid());
