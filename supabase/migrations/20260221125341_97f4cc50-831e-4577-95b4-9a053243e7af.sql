
-- 1. Studies table
CREATE TABLE public.studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  study_name text NOT NULL,
  mode text NOT NULL DEFAULT 'connect',
  status text NOT NULL DEFAULT 'draft',
  boundary_geojson jsonb,
  route_geojson jsonb,
  proposed_kw numeric,
  dno text,
  voltage_level text,
  ruleset_version text,
  engine_input_json jsonb,
  engine_output_json jsonb,
  cost_estimate_json jsonb,
  bom_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own studies" ON public.studies FOR SELECT USING (auth.uid() = created_by);
CREATE POLICY "Users can insert own studies" ON public.studies FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Users can update own studies" ON public.studies FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Users can delete own studies" ON public.studies FOR DELETE USING (auth.uid() = created_by);
CREATE POLICY "Admins can manage all studies" ON public.studies FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Engineers can view all studies" ON public.studies FOR SELECT USING (has_role(auth.uid(), 'engineer'::app_role));

CREATE TRIGGER update_studies_updated_at BEFORE UPDATE ON public.studies FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. DNO Rulesets table
CREATE TABLE public.dno_rulesets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dno_code text NOT NULL,
  version text NOT NULL DEFAULT 'v1',
  rules_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.dno_rulesets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read dno_rulesets" ON public.dno_rulesets FOR SELECT USING (true);
CREATE POLICY "Admins can manage dno_rulesets" ON public.dno_rulesets FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_dno_rulesets_updated_at BEFORE UPDATE ON public.dno_rulesets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Cable Catalogue table
CREATE TABLE public.cable_catalogue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cable_type text NOT NULL,
  voltage_class text NOT NULL,
  impedance_per_km numeric NOT NULL DEFAULT 0,
  current_rating_a numeric NOT NULL DEFAULT 0,
  cost_per_m numeric NOT NULL DEFAULT 0,
  diameter_mm numeric NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cable_catalogue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read cable_catalogue" ON public.cable_catalogue FOR SELECT USING (true);
CREATE POLICY "Admins can manage cable_catalogue" ON public.cable_catalogue FOR ALL USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_cable_catalogue_updated_at BEFORE UPDATE ON public.cable_catalogue FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
