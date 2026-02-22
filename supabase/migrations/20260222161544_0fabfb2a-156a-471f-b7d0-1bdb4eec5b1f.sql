
-- Create design_cables table for cable routes drawn in Design Mode
CREATE TABLE public.design_cables (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  cable_type text NOT NULL,
  label text,
  coordinates jsonb NOT NULL DEFAULT '[]'::jsonb,
  length_m double precision NOT NULL DEFAULT 0,
  properties_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.design_cables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own design cables"
  ON public.design_cables FOR SELECT
  USING (EXISTS (SELECT 1 FROM studies WHERE studies.id = design_cables.study_id AND studies.created_by = auth.uid()));

CREATE POLICY "Users can insert own design cables"
  ON public.design_cables FOR INSERT
  WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM studies WHERE studies.id = design_cables.study_id AND studies.created_by = auth.uid()));

CREATE POLICY "Users can delete own design cables"
  ON public.design_cables FOR DELETE
  USING (EXISTS (SELECT 1 FROM studies WHERE studies.id = design_cables.study_id AND studies.created_by = auth.uid()));

CREATE POLICY "Admins can manage design_cables"
  ON public.design_cables FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view design_cables"
  ON public.design_cables FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));
