
ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS next_action_label text,
  ADD COLUMN IF NOT EXISTS next_action_due date,
  ADD COLUMN IF NOT EXISTS blocker_reason text;

ALTER TABLE public.dno_offers
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_dno_offers_wp_site ON public.dno_offers(work_package_id, site_id);

ALTER TABLE public.design_submissions
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS design_type text;
UPDATE public.design_submissions SET design_type='ev' WHERE design_type IS NULL;
ALTER TABLE public.design_submissions ALTER COLUMN design_type SET DEFAULT 'ev';
DO $$ BEGIN
  ALTER TABLE public.design_submissions
    ADD CONSTRAINT design_submissions_design_type_chk CHECK (design_type IN ('ev','icp'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_design_submissions_wp_site_type
  ON public.design_submissions(work_package_id, site_id, design_type, revision DESC);

ALTER TYPE public.wp_task_kind ADD VALUE IF NOT EXISTS 'poc';
ALTER TYPE public.wp_task_kind ADD VALUE IF NOT EXISTS 'estimate';
ALTER TYPE public.wp_task_kind ADD VALUE IF NOT EXISTS 'client_decision';
ALTER TYPE public.wp_task_kind ADD VALUE IF NOT EXISTS 'survey_alloc';
ALTER TYPE public.wp_task_kind ADD VALUE IF NOT EXISTS 'design_ev';
ALTER TYPE public.wp_task_kind ADD VALUE IF NOT EXISTS 'design_icp';
ALTER TYPE public.wp_task_kind ADD VALUE IF NOT EXISTS 'rams';
ALTER TYPE public.wp_task_kind ADD VALUE IF NOT EXISTS 'design_review';
ALTER TYPE public.wp_task_kind ADD VALUE IF NOT EXISTS 'precon_gate';

CREATE INDEX IF NOT EXISTS idx_wp_tasks_wp_site_kind ON public.wp_tasks(work_package_id, site_id, task_kind);

CREATE TABLE IF NOT EXISTS public.site_precon_gates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  gate_key text NOT NULL CHECK (gate_key IN ('poc','commercial','design_ev','design_icp','rams','final_review')),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','passed','waived')),
  passed_at timestamptz,
  passed_by uuid,
  evidence_ref text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_package_id, site_id, gate_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_precon_gates TO authenticated;
GRANT ALL ON public.site_precon_gates TO service_role;

ALTER TABLE public.site_precon_gates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "precon_gates_read_via_wp_site" ON public.site_precon_gates;
CREATE POLICY "precon_gates_read_via_wp_site"
  ON public.site_precon_gates FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.wp_sites ws
                 WHERE ws.work_package_id = site_precon_gates.work_package_id
                   AND ws.site_id = site_precon_gates.site_id));

DROP POLICY IF EXISTS "precon_gates_write_via_wp_site" ON public.site_precon_gates;
CREATE POLICY "precon_gates_write_via_wp_site"
  ON public.site_precon_gates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.wp_sites ws
                 WHERE ws.work_package_id = site_precon_gates.work_package_id
                   AND ws.site_id = site_precon_gates.site_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.wp_sites ws
                      WHERE ws.work_package_id = site_precon_gates.work_package_id
                        AND ws.site_id = site_precon_gates.site_id));

DROP TRIGGER IF EXISTS trg_site_precon_gates_updated ON public.site_precon_gates;
CREATE TRIGGER trg_site_precon_gates_updated
  BEFORE UPDATE ON public.site_precon_gates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.v_wp_site_precon_status AS
SELECT
  ws.work_package_id,
  ws.id                                    AS wp_site_id,
  ws.sequence, ws.local_ref,
  s.id                                     AS site_id,
  s.site_name, s.postcode, s.viability_index,
  s.current_stage_id,
  sd.label                                 AS current_stage_label,
  s.primary_partner_id,
  poc.id     AS poc_task_id, poc.status::text AS poc_status, poc.due_date AS poc_sla_date,
  dof.id     AS latest_offer_id, dof.status AS latest_offer_status,
             dof.offer_value AS latest_offer_value, dof.received_at AS latest_offer_at,
  se.id      AS latest_site_estimate_id, se.status AS estimate_status,
             se.approved_at AS estimate_approved_at,
  sv.id      AS latest_survey_id, sv.status AS survey_status, sv.submitted_at AS survey_submitted_at,
  d_ev.id    AS ev_design_id,  d_ev.status  AS ev_design_status,
  d_ic.id    AS icp_design_id, d_ic.status  AS icp_design_status,
  ram.id     AS latest_rams_id, ram.status  AS rams_status,
  rev.state  AS final_review_state,
  s.next_action_label, s.next_action_due, s.blocker_reason,
  GREATEST(s.updated_at,
    COALESCE(poc.updated_at,  '-infinity'::timestamptz),
    COALESCE(se.updated_at,   '-infinity'::timestamptz),
    COALESCE(sv.updated_at,   '-infinity'::timestamptz),
    COALESCE(d_ev.updated_at, '-infinity'::timestamptz),
    COALESCE(d_ic.updated_at, '-infinity'::timestamptz)
  ) AS last_activity_at
FROM public.wp_sites ws
JOIN public.sites s ON s.id = ws.site_id
LEFT JOIN public.stage_definitions sd ON sd.id = s.current_stage_id
LEFT JOIN LATERAL (
  SELECT * FROM public.wp_tasks t
  WHERE t.work_package_id = ws.work_package_id AND t.site_id = s.id AND t.task_kind::text = 'poc'
  ORDER BY t.updated_at DESC LIMIT 1
) poc ON true
LEFT JOIN LATERAL (
  SELECT * FROM public.dno_offers o
  WHERE o.work_package_id = ws.work_package_id
    AND (o.site_id = s.id OR EXISTS (
      SELECT 1 FROM public.dno_offer_sites x
      WHERE x.dno_offer_id = o.id AND x.site_id = s.id))
  ORDER BY o.received_at DESC NULLS LAST LIMIT 1
) dof ON true
LEFT JOIN LATERAL (
  SELECT * FROM public.site_estimates x
  WHERE x.site_id = s.id ORDER BY x.updated_at DESC LIMIT 1
) se ON true
LEFT JOIN LATERAL (
  SELECT * FROM public.site_surveys x
  WHERE x.site_id = s.id ORDER BY x.updated_at DESC LIMIT 1
) sv ON true
LEFT JOIN LATERAL (
  SELECT * FROM public.design_submissions x
  WHERE x.work_package_id = ws.work_package_id AND x.site_id = s.id AND x.design_type = 'ev'
  ORDER BY x.revision DESC LIMIT 1
) d_ev ON true
LEFT JOIN LATERAL (
  SELECT * FROM public.design_submissions x
  WHERE x.work_package_id = ws.work_package_id AND x.site_id = s.id AND x.design_type = 'icp'
  ORDER BY x.revision DESC LIMIT 1
) d_ic ON true
LEFT JOIN LATERAL (
  SELECT * FROM public.rams_documents x
  WHERE x.site_id = s.id ORDER BY x.updated_at DESC LIMIT 1
) ram ON true
LEFT JOIN LATERAL (
  SELECT * FROM public.site_precon_gates g
  WHERE g.site_id = s.id AND g.work_package_id = ws.work_package_id AND g.gate_key = 'final_review'
  ORDER BY g.updated_at DESC LIMIT 1
) rev ON true;

GRANT SELECT ON public.v_wp_site_precon_status TO authenticated;
