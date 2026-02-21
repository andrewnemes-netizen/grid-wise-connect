
-- Immutable study snapshots for audit trail and ICP defensibility
CREATE TABLE public.study_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  study_id uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Version references
  engine_version text NOT NULL DEFAULT 'v1',
  ruleset_version text NOT NULL DEFAULT 'v1',
  pricebook_version text NOT NULL DEFAULT 'v1',

  -- Frozen inputs
  electrical_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  cable_configuration jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Frozen outputs
  validation_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  optimiser_output jsonb,

  -- Metadata
  snapshot_label text,
  notes text
);

-- Immutability: no updates or deletes by normal users
ALTER TABLE public.study_snapshots ENABLE ROW LEVEL SECURITY;

-- Users can view snapshots for their own studies
CREATE POLICY "Users can view own study snapshots"
  ON public.study_snapshots FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.studies
      WHERE studies.id = study_snapshots.study_id
        AND studies.created_by = auth.uid()
    )
  );

-- Users can insert snapshots for their own studies
CREATE POLICY "Users can insert own study snapshots"
  ON public.study_snapshots FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM public.studies
      WHERE studies.id = study_snapshots.study_id
        AND studies.created_by = auth.uid()
    )
  );

-- Admins full access
CREATE POLICY "Admins can manage study_snapshots"
  ON public.study_snapshots FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Engineers can read all snapshots
CREATE POLICY "Engineers can view all study snapshots"
  ON public.study_snapshots FOR SELECT
  USING (has_role(auth.uid(), 'engineer'::app_role));

-- No UPDATE or DELETE policies for regular users = immutability enforced at RLS level
-- Index for fast lookup
CREATE INDEX idx_study_snapshots_study_id ON public.study_snapshots(study_id);
CREATE INDEX idx_study_snapshots_created_at ON public.study_snapshots(created_at DESC);
