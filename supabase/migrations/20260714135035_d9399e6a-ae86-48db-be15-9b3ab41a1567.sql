
-- ============ ENUMS ============
CREATE TYPE public.proposal_status AS ENUM ('draft','sent','accepted','rejected','expired');
CREATE TYPE public.project_status AS ENUM ('planning','active','on_hold','completed','cancelled');
CREATE TYPE public.project_priority AS ENUM ('low','medium','high','critical');
CREATE TYPE public.project_health AS ENUM ('green','amber','red');
CREATE TYPE public.project_member_role AS ENUM ('owner','pm','engineer','commercial','delivery','client_viewer','dno_viewer','icp');
CREATE TYPE public.milestone_phase AS ENUM ('procurement','delivery','commissioning','handover','custom');
CREATE TYPE public.milestone_status AS ENUM ('not_started','in_progress','completed','blocked');
CREATE TYPE public.task_status AS ENUM ('todo','in_progress','blocked','review','done');
CREATE TYPE public.task_dep_type AS ENUM ('FS','SS','FF','SF');

-- ============ updated_at helper (create if missing) ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ PROPOSALS ============
CREATE TABLE public.proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id UUID NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  org_id UUID,
  version INT NOT NULL DEFAULT 1,
  status public.proposal_status NOT NULL DEFAULT 'draft',
  title TEXT,
  total_amount NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'GBP',
  valid_until DATE,
  snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_by UUID NOT NULL,
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_proposals_study ON public.proposals(study_id);
CREATE INDEX idx_proposals_account ON public.proposals(account_id);
CREATE INDEX idx_proposals_org ON public.proposals(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposals TO authenticated;
GRANT ALL ON public.proposals TO service_role;
ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "proposals_org_read" ON public.proposals FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR created_by = auth.uid()
    OR (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = proposals.org_id AND m.user_id = auth.uid()))
  );
CREATE POLICY "proposals_write" ON public.proposals FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'engineer')));
CREATE POLICY "proposals_update" ON public.proposals FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR created_by = auth.uid() OR (org_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.org_members m WHERE m.org_id = proposals.org_id AND m.user_id = auth.uid())));
CREATE POLICY "proposals_delete" ON public.proposals FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR created_by = auth.uid());
CREATE TRIGGER trg_proposals_updated BEFORE UPDATE ON public.proposals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PROJECTS ============
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID UNIQUE REFERENCES public.proposals(id) ON DELETE SET NULL,
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  site_id UUID REFERENCES public.sites(id) ON DELETE SET NULL,
  study_id UUID REFERENCES public.studies(id) ON DELETE SET NULL,
  org_id UUID,
  code TEXT,
  name TEXT NOT NULL,
  description TEXT,
  status public.project_status NOT NULL DEFAULT 'planning',
  priority public.project_priority NOT NULL DEFAULT 'medium',
  health public.project_health NOT NULL DEFAULT 'green',
  start_date DATE,
  target_end_date DATE,
  actual_end_date DATE,
  percent_complete NUMERIC(5,2) NOT NULL DEFAULT 0,
  template_id UUID,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_org ON public.projects(org_id);
CREATE INDEX idx_projects_study ON public.projects(study_id);
CREATE INDEX idx_projects_wp ON public.projects(work_package_id);
CREATE INDEX idx_projects_status ON public.projects(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PROJECT MEMBERS ============
CREATE TABLE public.project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.project_member_role NOT NULL DEFAULT 'engineer',
  added_by UUID,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
CREATE INDEX idx_project_members_user ON public.project_members(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- Membership helper (SECURITY DEFINER to avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_members WHERE project_id = _project_id AND user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.can_access_project(_project_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_role(_user_id,'admin')
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project_id AND p.created_by = _user_id)
    OR EXISTS (
      SELECT 1 FROM public.projects p JOIN public.org_members m ON m.org_id = p.org_id
      WHERE p.id = _project_id AND m.user_id = _user_id
    )
    OR EXISTS (SELECT 1 FROM public.project_members pm WHERE pm.project_id = _project_id AND pm.user_id = _user_id);
$$;

-- projects policies (created here so they can reference the helper)
CREATE POLICY "projects_read" ON public.projects FOR SELECT TO authenticated
  USING (public.can_access_project(id, auth.uid()));
CREATE POLICY "projects_insert" ON public.projects FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'engineer')));
CREATE POLICY "projects_update" ON public.projects FOR UPDATE TO authenticated
  USING (public.can_access_project(id, auth.uid()));
CREATE POLICY "projects_delete" ON public.projects FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR created_by = auth.uid());

-- project_members policies
CREATE POLICY "pm_read" ON public.project_members FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "pm_write" ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "pm_update" ON public.project_members FOR UPDATE TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "pm_delete" ON public.project_members FOR DELETE TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));

-- ============ MILESTONES ============
CREATE TABLE public.project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  phase public.milestone_phase NOT NULL DEFAULT 'delivery',
  sequence INT NOT NULL DEFAULT 0,
  planned_date DATE,
  actual_date DATE,
  status public.milestone_status NOT NULL DEFAULT 'not_started',
  percent_complete NUMERIC(5,2) NOT NULL DEFAULT 0,
  owner_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_milestones_project ON public.project_milestones(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_milestones TO authenticated;
GRANT ALL ON public.project_milestones TO service_role;
ALTER TABLE public.project_milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ms_all" ON public.project_milestones FOR ALL TO authenticated
  USING (public.can_access_project(project_id, auth.uid()))
  WITH CHECK (public.can_access_project(project_id, auth.uid()));
CREATE TRIGGER trg_ms_updated BEFORE UPDATE ON public.project_milestones FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ TASKS ============
CREATE TABLE public.project_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES public.project_milestones(id) ON DELETE SET NULL,
  parent_task_id UUID REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status public.task_status NOT NULL DEFAULT 'todo',
  priority public.project_priority NOT NULL DEFAULT 'medium',
  owner_user_id UUID,
  start_date DATE,
  due_date DATE,
  estimated_hours NUMERIC(8,2),
  actual_hours NUMERIC(8,2),
  percent_complete NUMERIC(5,2) NOT NULL DEFAULT 0,
  sort_index INT NOT NULL DEFAULT 0,
  boq_ref TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_project ON public.project_tasks(project_id);
CREATE INDEX idx_tasks_milestone ON public.project_tasks(milestone_id);
CREATE INDEX idx_tasks_owner ON public.project_tasks(owner_user_id);
CREATE INDEX idx_tasks_status ON public.project_tasks(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_tasks TO authenticated;
GRANT ALL ON public.project_tasks TO service_role;
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_all" ON public.project_tasks FOR ALL TO authenticated
  USING (public.can_access_project(project_id, auth.uid()))
  WITH CHECK (public.can_access_project(project_id, auth.uid()));
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.project_tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ TASK DEPENDENCIES ============
CREATE TABLE public.project_task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  type public.task_dep_type NOT NULL DEFAULT 'FS',
  lag_days INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);
CREATE INDEX idx_deps_task ON public.project_task_dependencies(task_id);
CREATE INDEX idx_deps_dep ON public.project_task_dependencies(depends_on_task_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_task_dependencies TO authenticated;
GRANT ALL ON public.project_task_dependencies TO service_role;
ALTER TABLE public.project_task_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deps_all" ON public.project_task_dependencies FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.project_tasks t WHERE t.id = task_id AND public.can_access_project(t.project_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.project_tasks t WHERE t.id = task_id AND public.can_access_project(t.project_id, auth.uid())));

-- Cycle prevention trigger
CREATE OR REPLACE FUNCTION public.check_task_dep_cycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE has_cycle BOOLEAN;
BEGIN
  WITH RECURSIVE walk(node) AS (
    SELECT NEW.depends_on_task_id
    UNION
    SELECT d.depends_on_task_id FROM public.project_task_dependencies d JOIN walk w ON d.task_id = w.node
  )
  SELECT EXISTS (SELECT 1 FROM walk WHERE node = NEW.task_id) INTO has_cycle;
  IF has_cycle THEN RAISE EXCEPTION 'Task dependency cycle detected'; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_dep_cycle BEFORE INSERT OR UPDATE ON public.project_task_dependencies
  FOR EACH ROW EXECUTE FUNCTION public.check_task_dep_cycle();

-- ============ ROLLUP: task % -> milestone % -> project % ============
CREATE OR REPLACE FUNCTION public.rollup_project_progress(_project_id UUID)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.project_milestones ms SET percent_complete = COALESCE(sub.avg_pct, 0)
  FROM (
    SELECT milestone_id, AVG(percent_complete)::numeric(5,2) AS avg_pct
    FROM public.project_tasks WHERE project_id = _project_id AND milestone_id IS NOT NULL
    GROUP BY milestone_id
  ) sub WHERE ms.id = sub.milestone_id AND ms.project_id = _project_id;

  UPDATE public.projects SET percent_complete = COALESCE((
    SELECT AVG(percent_complete)::numeric(5,2) FROM public.project_tasks WHERE project_id = _project_id
  ), 0) WHERE id = _project_id;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_rollup_on_task()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.rollup_project_progress(OLD.project_id);
    RETURN OLD;
  END IF;
  IF NEW.status = 'done' AND NEW.percent_complete < 100 THEN NEW.percent_complete = 100; END IF;
  PERFORM public.rollup_project_progress(NEW.project_id);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_task_rollup AFTER INSERT OR UPDATE OR DELETE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.trg_rollup_on_task();
