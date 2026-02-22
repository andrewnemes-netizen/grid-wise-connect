
-- Ruleset change log for governance/audit trail
CREATE TABLE public.ruleset_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ruleset_id uuid NOT NULL REFERENCES public.ev_hub_rulesets(id) ON DELETE CASCADE,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  change_type text NOT NULL,
  previous_version text,
  new_version text NOT NULL,
  change_summary text NOT NULL,
  diff_json jsonb
);

ALTER TABLE public.ruleset_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read change log"
  ON public.ruleset_change_log FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert change log"
  ON public.ruleset_change_log FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_ruleset_change_log_ruleset ON public.ruleset_change_log(ruleset_id);
CREATE INDEX idx_ruleset_change_log_changed_at ON public.ruleset_change_log(changed_at DESC);
