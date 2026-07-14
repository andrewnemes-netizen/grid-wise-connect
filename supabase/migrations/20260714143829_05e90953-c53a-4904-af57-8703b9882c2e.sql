
DO $$ BEGIN
  CREATE TYPE public.site_stage_state AS ENUM ('not_started','in_progress','blocked','review','done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.site_stage_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  survey      public.site_stage_state NOT NULL DEFAULT 'not_started',
  design      public.site_stage_state NOT NULL DEFAULT 'not_started',
  dno         public.site_stage_state NOT NULL DEFAULT 'not_started',
  permit      public.site_stage_state NOT NULL DEFAULT 'not_started',
  civils      public.site_stage_state NOT NULL DEFAULT 'not_started',
  electrical  public.site_stage_state NOT NULL DEFAULT 'not_started',
  meter       public.site_stage_state NOT NULL DEFAULT 'not_started',
  handover    public.site_stage_state NOT NULL DEFAULT 'not_started',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_package_id, site_id)
);
CREATE INDEX site_stage_status_wp_idx ON public.site_stage_status(work_package_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_stage_status TO authenticated;
GRANT ALL ON public.site_stage_status TO service_role;
ALTER TABLE public.site_stage_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View site stage with WP access" ON public.site_stage_status
  FOR SELECT TO authenticated USING (public.can_access_wp(auth.uid(), work_package_id));
CREATE POLICY "Manage site stage" ON public.site_stage_status
  FOR ALL TO authenticated
  USING (public.can_manage_wp(auth.uid(), work_package_id))
  WITH CHECK (public.can_manage_wp(auth.uid(), work_package_id));

INSERT INTO public.site_stage_status (work_package_id, site_id)
SELECT work_package_id, site_id FROM public.wp_sites
ON CONFLICT (work_package_id, site_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.wp_sites_ensure_stage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.site_stage_status (work_package_id, site_id)
  VALUES (NEW.work_package_id, NEW.site_id)
  ON CONFLICT (work_package_id, site_id) DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER wp_sites_ensure_stage
AFTER INSERT ON public.wp_sites
FOR EACH ROW EXECUTE FUNCTION public.wp_sites_ensure_stage();

CREATE OR REPLACE FUNCTION public.recalc_site_stage(_project_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_wp uuid;
  v_site uuid;
BEGIN
  SELECT work_package_id, site_id INTO v_wp, v_site FROM public.projects WHERE id = _project_id;
  IF v_wp IS NULL OR v_site IS NULL THEN RETURN; END IF;

  INSERT INTO public.site_stage_status (work_package_id, site_id)
  VALUES (v_wp, v_site) ON CONFLICT (work_package_id, site_id) DO NOTHING;

  WITH agg AS (
    SELECT
      COALESCE(metadata_json->>'stage','') AS stage,
      BOOL_AND(status::text = 'done') AS all_done,
      BOOL_OR(status::text = 'blocked') AS any_blocked,
      BOOL_OR(status::text IN ('in_progress','review')) AS any_active
    FROM public.project_tasks
    WHERE project_id = _project_id AND COALESCE(metadata_json->>'stage','') <> ''
    GROUP BY 1
  )
  UPDATE public.site_stage_status s SET
    survey     = COALESCE((SELECT CASE WHEN any_blocked THEN 'blocked'::site_stage_state WHEN all_done THEN 'done' WHEN any_active THEN 'in_progress' ELSE 'not_started' END FROM agg WHERE stage='survey'), s.survey),
    design     = COALESCE((SELECT CASE WHEN any_blocked THEN 'blocked'::site_stage_state WHEN all_done THEN 'done' WHEN any_active THEN 'in_progress' ELSE 'not_started' END FROM agg WHERE stage='design'), s.design),
    dno        = COALESCE((SELECT CASE WHEN any_blocked THEN 'blocked'::site_stage_state WHEN all_done THEN 'done' WHEN any_active THEN 'in_progress' ELSE 'not_started' END FROM agg WHERE stage='dno'), s.dno),
    permit     = COALESCE((SELECT CASE WHEN any_blocked THEN 'blocked'::site_stage_state WHEN all_done THEN 'done' WHEN any_active THEN 'in_progress' ELSE 'not_started' END FROM agg WHERE stage='permit'), s.permit),
    civils     = COALESCE((SELECT CASE WHEN any_blocked THEN 'blocked'::site_stage_state WHEN all_done THEN 'done' WHEN any_active THEN 'in_progress' ELSE 'not_started' END FROM agg WHERE stage='civils'), s.civils),
    electrical = COALESCE((SELECT CASE WHEN any_blocked THEN 'blocked'::site_stage_state WHEN all_done THEN 'done' WHEN any_active THEN 'in_progress' ELSE 'not_started' END FROM agg WHERE stage='electrical'), s.electrical),
    meter      = COALESCE((SELECT CASE WHEN any_blocked THEN 'blocked'::site_stage_state WHEN all_done THEN 'done' WHEN any_active THEN 'in_progress' ELSE 'not_started' END FROM agg WHERE stage='meter'), s.meter),
    handover   = COALESCE((SELECT CASE WHEN any_blocked THEN 'blocked'::site_stage_state WHEN all_done THEN 'done' WHEN any_active THEN 'in_progress' ELSE 'not_started' END FROM agg WHERE stage='handover'), s.handover),
    updated_at = now()
  WHERE s.work_package_id = v_wp AND s.site_id = v_site;
END $$;

CREATE OR REPLACE FUNCTION public.project_tasks_stage_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.recalc_site_stage(COALESCE(NEW.project_id, OLD.project_id));
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER project_tasks_stage
AFTER INSERT OR UPDATE OR DELETE ON public.project_tasks
FOR EACH ROW EXECUTE FUNCTION public.project_tasks_stage_trigger();

CREATE TABLE public.site_handover_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('as_built','test_cert','commissioning','photos','meter_cert','other')),
  storage_path text NOT NULL,
  filename text NOT NULL,
  size_bytes bigint,
  mime text,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid,
  notes text
);
CREATE INDEX site_handover_docs_wp_site_idx ON public.site_handover_docs(work_package_id, site_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_handover_docs TO authenticated;
GRANT ALL ON public.site_handover_docs TO service_role;
ALTER TABLE public.site_handover_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View handover with WP access" ON public.site_handover_docs
  FOR SELECT TO authenticated USING (public.can_access_wp(auth.uid(), work_package_id));
CREATE POLICY "Upload handover" ON public.site_handover_docs
  FOR INSERT TO authenticated WITH CHECK (public.can_access_wp(auth.uid(), work_package_id) AND uploaded_by = auth.uid());
CREATE POLICY "Update handover" ON public.site_handover_docs
  FOR UPDATE TO authenticated USING (public.can_manage_wp(auth.uid(), work_package_id))
  WITH CHECK (public.can_manage_wp(auth.uid(), work_package_id));
CREATE POLICY "Delete handover" ON public.site_handover_docs
  FOR DELETE TO authenticated USING (public.can_manage_wp(auth.uid(), work_package_id));

REVOKE EXECUTE ON FUNCTION public.recalc_site_stage(uuid) FROM PUBLIC, anon;
