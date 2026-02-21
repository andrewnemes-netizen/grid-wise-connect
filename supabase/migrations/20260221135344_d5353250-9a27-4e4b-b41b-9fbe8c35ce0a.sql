
-- Design elements table: equipment placed on the map during design mode
CREATE TABLE public.design_elements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  element_type text NOT NULL, -- transformer, rmu, feeder_pillar, cutout, joint, pole
  label text,
  lng numeric NOT NULL,
  lat numeric NOT NULL,
  properties_json jsonb NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookup by study
CREATE INDEX idx_design_elements_study ON public.design_elements(study_id);

-- Enable RLS
ALTER TABLE public.design_elements ENABLE ROW LEVEL SECURITY;

-- Policies: users manage own (via study ownership), admins/engineers can view
CREATE POLICY "Users can insert own design elements"
  ON public.design_elements FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (SELECT 1 FROM studies WHERE studies.id = design_elements.study_id AND studies.created_by = auth.uid())
  );

CREATE POLICY "Users can view own design elements"
  ON public.design_elements FOR SELECT
  USING (EXISTS (SELECT 1 FROM studies WHERE studies.id = design_elements.study_id AND studies.created_by = auth.uid()));

CREATE POLICY "Users can update own design elements"
  ON public.design_elements FOR UPDATE
  USING (EXISTS (SELECT 1 FROM studies WHERE studies.id = design_elements.study_id AND studies.created_by = auth.uid()));

CREATE POLICY "Users can delete own design elements"
  ON public.design_elements FOR DELETE
  USING (EXISTS (SELECT 1 FROM studies WHERE studies.id = design_elements.study_id AND studies.created_by = auth.uid()));

CREATE POLICY "Admins can manage design_elements"
  ON public.design_elements FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Engineers can view design_elements"
  ON public.design_elements FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));
