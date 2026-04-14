
-- Route Amendment Tracking table
-- Stores AI-generated vs engineer-corrected route pairs for learning pipeline
CREATE TABLE public.route_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  study_id uuid REFERENCES public.studies(id) ON DELETE SET NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  dno_region text,
  voltage_level text,
  proposed_kw numeric,

  -- AI baseline
  ai_route_geojson jsonb,
  ai_poc_lat numeric,
  ai_poc_lng numeric,
  ai_distance_m numeric,
  ai_cost_estimate jsonb,
  ai_surface_split jsonb,

  -- Engineer correction
  eng_route_geojson jsonb,
  eng_poc_lat numeric,
  eng_poc_lng numeric,
  eng_distance_m numeric,
  eng_cost_estimate jsonb,
  eng_surface_split jsonb,

  -- Computed diffs
  distance_delta_m numeric,
  cost_delta_pct numeric,
  poc_shift_m numeric,

  -- Meta
  amendment_notes text,
  approved_for_training boolean NOT NULL DEFAULT false
);

-- Enable RLS
ALTER TABLE public.route_amendments ENABLE ROW LEVEL SECURITY;

-- Engineers and admins can insert their own amendments
CREATE POLICY "Users can insert own amendments"
  ON public.route_amendments FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    AND (
      has_role(auth.uid(), 'engineer'::app_role)
      OR has_role(auth.uid(), 'admin'::app_role)
    )
  );

-- Engineers can view their own amendments
CREATE POLICY "Engineers can view own amendments"
  ON public.route_amendments FOR SELECT
  TO authenticated
  USING (
    auth.uid() = created_by
    AND has_role(auth.uid(), 'engineer'::app_role)
  );

-- Admins can view all amendments
CREATE POLICY "Admins can view all amendments"
  ON public.route_amendments FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update all amendments (for approval gate)
CREATE POLICY "Admins can update all amendments"
  ON public.route_amendments FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Indexes
CREATE INDEX idx_route_amendments_site ON public.route_amendments(site_id);
CREATE INDEX idx_route_amendments_dno ON public.route_amendments(dno_region);
CREATE INDEX idx_route_amendments_created ON public.route_amendments(created_at DESC);
