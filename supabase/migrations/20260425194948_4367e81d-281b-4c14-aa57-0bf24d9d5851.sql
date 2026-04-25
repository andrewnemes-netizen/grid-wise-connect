-- Visual Design Workflow: workflow status, scenarios, and event log
-- Layered on top of existing design_elements / design_cables tables

-- 1. Add workflow status to studies
ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS workflow_status text NOT NULL DEFAULT 'draft';

-- 2. Scenarios: A/B/C options inside a single study
CREATE TABLE IF NOT EXISTS public.design_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL,
  name text NOT NULL,
  option_type text,
  status text NOT NULL DEFAULT 'draft',
  is_active boolean NOT NULL DEFAULT false,
  demand_kw numeric,
  demand_kva numeric,
  dno text,
  voltage_level text,
  score numeric,
  risk_rating text,
  cost_low numeric,
  cost_mid numeric,
  cost_high numeric,
  recommendation text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_scenarios_study ON public.design_scenarios(study_id);

ALTER TABLE public.design_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scenarios"
  ON public.design_scenarios FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.studies WHERE studies.id = design_scenarios.study_id AND studies.created_by = auth.uid()));

CREATE POLICY "Users can insert own scenarios"
  ON public.design_scenarios FOR INSERT
  WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM public.studies WHERE studies.id = design_scenarios.study_id AND studies.created_by = auth.uid()));

CREATE POLICY "Users can update own scenarios"
  ON public.design_scenarios FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.studies WHERE studies.id = design_scenarios.study_id AND studies.created_by = auth.uid()));

CREATE POLICY "Users can delete own scenarios"
  ON public.design_scenarios FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.studies WHERE studies.id = design_scenarios.study_id AND studies.created_by = auth.uid()));

CREATE POLICY "Engineers can view design_scenarios"
  ON public.design_scenarios FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));

CREATE POLICY "Admins can manage design_scenarios"
  ON public.design_scenarios FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_design_scenarios_updated_at
  BEFORE UPDATE ON public.design_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Workflow event log
CREATE TABLE IF NOT EXISTS public.design_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id uuid NOT NULL,
  scenario_id uuid,
  event_type text NOT NULL,
  event_label text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_workflow_events_study ON public.design_workflow_events(study_id, created_at DESC);

ALTER TABLE public.design_workflow_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own workflow events"
  ON public.design_workflow_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.studies WHERE studies.id = design_workflow_events.study_id AND studies.created_by = auth.uid()));

CREATE POLICY "Users can insert own workflow events"
  ON public.design_workflow_events FOR INSERT
  WITH CHECK (auth.uid() = created_by AND EXISTS (SELECT 1 FROM public.studies WHERE studies.id = design_workflow_events.study_id AND studies.created_by = auth.uid()));

CREATE POLICY "Engineers can view design_workflow_events"
  ON public.design_workflow_events FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));

CREATE POLICY "Admins can manage design_workflow_events"
  ON public.design_workflow_events FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4. Bind existing design rows to a scenario (nullable = legacy / default)
ALTER TABLE public.design_elements ADD COLUMN IF NOT EXISTS scenario_id uuid;
ALTER TABLE public.design_cables   ADD COLUMN IF NOT EXISTS scenario_id uuid;

CREATE INDEX IF NOT EXISTS idx_design_elements_scenario ON public.design_elements(scenario_id);
CREATE INDEX IF NOT EXISTS idx_design_cables_scenario ON public.design_cables(scenario_id);
