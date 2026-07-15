-- Gate type enum
DO $$ BEGIN
  CREATE TYPE public.milestone_gate_type AS ENUM (
    'information', 'stage_gate', 'payment', 'dno_energisation',
    'commissioning', 'handover', 'commercial', 'compliance'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.milestone_gate_status AS ENUM ('open','passed','blocked','waived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- wp_milestones
ALTER TABLE public.wp_milestones
  ADD COLUMN IF NOT EXISTS gate_type public.milestone_gate_type NOT NULL DEFAULT 'information',
  ADD COLUMN IF NOT EXISTS gate_status public.milestone_gate_status NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS passed_at timestamptz,
  ADD COLUMN IF NOT EXISTS passed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gate_notes text;

CREATE INDEX IF NOT EXISTS idx_wp_milestones_gate ON public.wp_milestones(gate_type, gate_status);

-- project_milestones
ALTER TABLE public.project_milestones
  ADD COLUMN IF NOT EXISTS gate_type public.milestone_gate_type NOT NULL DEFAULT 'information',
  ADD COLUMN IF NOT EXISTS gate_status public.milestone_gate_status NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS passed_at timestamptz,
  ADD COLUMN IF NOT EXISTS passed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gate_notes text;

CREATE INDEX IF NOT EXISTS idx_project_milestones_gate ON public.project_milestones(gate_type, gate_status);

-- Sync trigger: when a milestone completes, auto-pass its gate; when reopened, reopen the gate.
CREATE OR REPLACE FUNCTION public.sync_milestone_gate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _completed boolean;
BEGIN
  -- A milestone is "complete" when status text matches 'complete%' or actual_date is filled
  _completed := (NEW.actual_date IS NOT NULL)
             OR (LOWER(COALESCE(NEW.status::text,'')) LIKE 'complete%');

  IF _completed AND NEW.gate_status = 'open' THEN
    NEW.gate_status := 'passed';
    IF NEW.passed_at IS NULL THEN NEW.passed_at := now(); END IF;
    IF NEW.passed_by IS NULL THEN NEW.passed_by := auth.uid(); END IF;
  ELSIF NOT _completed AND NEW.gate_status = 'passed' AND OLD.gate_status = 'passed' THEN
    -- Milestone was un-completed; leave gate as passed unless explicitly reset
    NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wp_milestone_gate ON public.wp_milestones;
CREATE TRIGGER trg_wp_milestone_gate
  BEFORE UPDATE OF status, actual_date, gate_status ON public.wp_milestones
  FOR EACH ROW EXECUTE FUNCTION public.sync_milestone_gate();

DROP TRIGGER IF EXISTS trg_project_milestone_gate ON public.project_milestones;
CREATE TRIGGER trg_project_milestone_gate
  BEFORE UPDATE OF status, actual_date, gate_status ON public.project_milestones
  FOR EACH ROW EXECUTE FUNCTION public.sync_milestone_gate();