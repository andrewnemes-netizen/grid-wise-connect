
CREATE OR REPLACE FUNCTION public.can_access_wp(_user_id uuid, _wp_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
  OR EXISTS (
    SELECT 1 FROM public.work_packages wp
    WHERE wp.id = _wp_id
      AND (wp.pm_user_id = _user_id OR wp.delivery_user_id = _user_id
           OR wp.commercial_user_id = _user_id OR wp.created_by = _user_id)
  )
  OR EXISTS (SELECT 1 FROM public.wp_team WHERE work_package_id = _wp_id AND user_id = _user_id)
  OR EXISTS (
    SELECT 1 FROM public.wp_access
    WHERE work_package_id = _wp_id AND user_id = _user_id
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_wp(_user_id uuid, _wp_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
  OR EXISTS (
    SELECT 1 FROM public.work_packages wp
    WHERE wp.id = _wp_id
      AND (wp.pm_user_id = _user_id OR wp.delivery_user_id = _user_id
           OR wp.commercial_user_id = _user_id OR wp.created_by = _user_id)
  )
  OR EXISTS (
    SELECT 1 FROM public.wp_team
    WHERE work_package_id = _wp_id AND user_id = _user_id
      AND team_role IN ('pm','delivery','engineer','commercial','lead')
  );
$$;

-- M5: partial unique + views
CREATE UNIQUE INDEX IF NOT EXISTS projects_wp_site_unique
  ON public.projects (work_package_id, site_id)
  WHERE work_package_id IS NOT NULL AND site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS projects_work_package_id_idx ON public.projects (work_package_id);

CREATE OR REPLACE VIEW public.site_programmes AS
  SELECT * FROM public.projects WHERE site_id IS NOT NULL;
CREATE OR REPLACE VIEW public.site_milestones AS SELECT * FROM public.project_milestones;
CREATE OR REPLACE VIEW public.site_tasks AS SELECT * FROM public.project_tasks;

GRANT SELECT ON public.site_programmes TO authenticated;
GRANT SELECT ON public.site_milestones TO authenticated;
GRANT SELECT ON public.site_tasks TO authenticated;

-- M6: WP-level tables
DO $$ BEGIN
  CREATE TYPE public.wp_milestone_phase AS ENUM
    ('mobilisation','design_batch','procurement','construction','commissioning','handover','commercial','custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wp_item_status AS ENUM ('not_started','in_progress','blocked','review','done','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wp_priority AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.wp_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  phase public.wp_milestone_phase NOT NULL DEFAULT 'mobilisation',
  sequence integer NOT NULL DEFAULT 0,
  planned_date date,
  actual_date date,
  status public.wp_item_status NOT NULL DEFAULT 'not_started',
  percent_complete numeric NOT NULL DEFAULT 0,
  owner_user_id uuid,
  depends_on_rule_json jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wp_milestones_wp_idx ON public.wp_milestones(work_package_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wp_milestones TO authenticated;
GRANT ALL ON public.wp_milestones TO service_role;
ALTER TABLE public.wp_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View WP milestones with access" ON public.wp_milestones
  FOR SELECT TO authenticated USING (public.can_access_wp(auth.uid(), work_package_id));
CREATE POLICY "Manage WP milestones" ON public.wp_milestones
  FOR ALL TO authenticated
  USING (public.can_manage_wp(auth.uid(), work_package_id))
  WITH CHECK (public.can_manage_wp(auth.uid(), work_package_id));

CREATE TRIGGER wp_milestones_updated_at BEFORE UPDATE ON public.wp_milestones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.wp_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES public.wp_milestones(id) ON DELETE SET NULL,
  parent_task_id uuid REFERENCES public.wp_tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status public.wp_item_status NOT NULL DEFAULT 'not_started',
  priority public.wp_priority NOT NULL DEFAULT 'medium',
  owner_user_id uuid,
  start_date date,
  due_date date,
  estimated_hours numeric,
  actual_hours numeric,
  percent_complete numeric NOT NULL DEFAULT 0,
  sort_index integer NOT NULL DEFAULT 0,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wp_tasks_wp_idx ON public.wp_tasks(work_package_id);
CREATE INDEX wp_tasks_milestone_idx ON public.wp_tasks(milestone_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wp_tasks TO authenticated;
GRANT ALL ON public.wp_tasks TO service_role;
ALTER TABLE public.wp_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View WP tasks with access" ON public.wp_tasks
  FOR SELECT TO authenticated USING (public.can_access_wp(auth.uid(), work_package_id));
CREATE POLICY "Manage WP tasks" ON public.wp_tasks
  FOR ALL TO authenticated
  USING (public.can_manage_wp(auth.uid(), work_package_id))
  WITH CHECK (public.can_manage_wp(auth.uid(), work_package_id));

CREATE TRIGGER wp_tasks_updated_at BEFORE UPDATE ON public.wp_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.wp_task_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.wp_tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid REFERENCES public.wp_tasks(id) ON DELETE CASCADE,
  depends_on_site_stage_json jsonb,
  type text NOT NULL DEFAULT 'FS',
  lag_days integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (task_id <> depends_on_task_id),
  CHECK (depends_on_task_id IS NOT NULL OR depends_on_site_stage_json IS NOT NULL),
  UNIQUE (task_id, depends_on_task_id)
);
CREATE INDEX wp_task_deps_task_idx ON public.wp_task_dependencies(task_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wp_task_dependencies TO authenticated;
GRANT ALL ON public.wp_task_dependencies TO service_role;
ALTER TABLE public.wp_task_dependencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View WP task deps" ON public.wp_task_dependencies
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.wp_tasks t WHERE t.id = task_id AND public.can_access_wp(auth.uid(), t.work_package_id))
  );
CREATE POLICY "Manage WP task deps" ON public.wp_task_dependencies
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.wp_tasks t WHERE t.id = task_id AND public.can_manage_wp(auth.uid(), t.work_package_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.wp_tasks t WHERE t.id = task_id AND public.can_manage_wp(auth.uid(), t.work_package_id)));

-- Rollup: wp_tasks -> wp_milestones
CREATE OR REPLACE FUNCTION public.recalc_wp_milestone_progress(_milestone_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _milestone_id IS NULL THEN RETURN; END IF;
  UPDATE public.wp_milestones m
     SET percent_complete = COALESCE((SELECT AVG(percent_complete) FROM public.wp_tasks WHERE milestone_id = _milestone_id), 0),
         status = CASE
           WHEN NOT EXISTS (SELECT 1 FROM public.wp_tasks WHERE milestone_id = _milestone_id) THEN m.status
           WHEN (SELECT AVG(percent_complete) FROM public.wp_tasks WHERE milestone_id = _milestone_id) >= 100 THEN 'done'::wp_item_status
           WHEN (SELECT AVG(percent_complete) FROM public.wp_tasks WHERE milestone_id = _milestone_id) > 0 THEN 'in_progress'::wp_item_status
           ELSE m.status
         END,
         updated_at = now()
   WHERE m.id = _milestone_id;
END $$;

CREATE OR REPLACE FUNCTION public.wp_tasks_rollup_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_wp_milestone_progress(OLD.milestone_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalc_wp_milestone_progress(NEW.milestone_id);
    IF TG_OP = 'UPDATE' AND OLD.milestone_id IS DISTINCT FROM NEW.milestone_id THEN
      PERFORM public.recalc_wp_milestone_progress(OLD.milestone_id);
    END IF;
    RETURN NEW;
  END IF;
END $$;

CREATE TRIGGER wp_tasks_rollup
AFTER INSERT OR UPDATE OR DELETE ON public.wp_tasks
FOR EACH ROW EXECUTE FUNCTION public.wp_tasks_rollup_trigger();
