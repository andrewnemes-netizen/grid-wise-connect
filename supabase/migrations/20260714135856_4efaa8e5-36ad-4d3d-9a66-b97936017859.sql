
CREATE TABLE public.project_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES public.project_milestones(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL,
  body_md TEXT NOT NULL,
  mentions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_project ON public.project_comments(project_id);
CREATE INDEX idx_comments_task ON public.project_comments(task_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_comments TO authenticated;
GRANT ALL ON public.project_comments TO service_role;
ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments_read" ON public.project_comments FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "comments_insert" ON public.project_comments FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid() AND public.can_access_project(project_id, auth.uid()));
CREATE POLICY "comments_update" ON public.project_comments FOR UPDATE TO authenticated
  USING (author_user_id = auth.uid());
CREATE POLICY "comments_delete" ON public.project_comments FOR DELETE TO authenticated
  USING (author_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_comments_updated BEFORE UPDATE ON public.project_comments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT,
  size_bytes BIGINT,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_files_project ON public.project_files(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_files TO authenticated;
GRANT ALL ON public.project_files TO service_role;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "files_read" ON public.project_files FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "files_insert" ON public.project_files FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND public.can_access_project(project_id, auth.uid()));
CREATE POLICY "files_delete" ON public.project_files FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE TABLE public.project_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  actor_user_id UUID,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  summary TEXT,
  diff_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_project ON public.project_activity(project_id, created_at DESC);
GRANT SELECT, INSERT ON public.project_activity TO authenticated;
GRANT ALL ON public.project_activity TO service_role;
ALTER TABLE public.project_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_read" ON public.project_activity FOR SELECT TO authenticated
  USING (public.can_access_project(project_id, auth.uid()));
CREATE POLICY "activity_insert" ON public.project_activity FOR INSERT TO authenticated
  WITH CHECK (public.can_access_project(project_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.log_project_activity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _pid UUID; _sum TEXT; _diff JSONB := '{}'::jsonb;
BEGIN
  IF TG_TABLE_NAME = 'project_tasks' THEN
    _pid := COALESCE(NEW.project_id, OLD.project_id);
    IF TG_OP = 'INSERT' THEN _sum := 'Task created: ' || NEW.title;
    ELSIF TG_OP = 'DELETE' THEN _sum := 'Task deleted: ' || OLD.title;
    ELSE
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        _sum := 'Task status: ' || OLD.status || ' → ' || NEW.status || ' (' || NEW.title || ')';
        _diff := jsonb_build_object('from', OLD.status, 'to', NEW.status);
      ELSIF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
        _sum := 'Task reassigned: ' || NEW.title;
      ELSE RETURN NEW;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'project_milestones' THEN
    _pid := COALESCE(NEW.project_id, OLD.project_id);
    IF TG_OP = 'INSERT' THEN _sum := 'Milestone created: ' || NEW.name;
    ELSIF TG_OP = 'DELETE' THEN _sum := 'Milestone deleted: ' || OLD.name;
    ELSE
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        _sum := 'Milestone status: ' || OLD.status || ' → ' || NEW.status || ' (' || NEW.name || ')';
      ELSE RETURN NEW;
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'project_comments' THEN
    _pid := COALESCE(NEW.project_id, OLD.project_id);
    IF TG_OP = 'INSERT' THEN _sum := 'Comment added';
    ELSE RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  INSERT INTO public.project_activity(project_id, actor_user_id, entity_type, entity_id, action, summary, diff_json)
  VALUES (_pid, auth.uid(), TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), lower(TG_OP), _sum, _diff);
  RETURN COALESCE(NEW, OLD);
END; $$;

CREATE TRIGGER trg_activity_tasks AFTER INSERT OR UPDATE OR DELETE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_project_activity();
CREATE TRIGGER trg_activity_milestones AFTER INSERT OR UPDATE OR DELETE ON public.project_milestones
  FOR EACH ROW EXECUTE FUNCTION public.log_project_activity();
CREATE TRIGGER trg_activity_comments AFTER INSERT ON public.project_comments
  FOR EACH ROW EXECUTE FUNCTION public.log_project_activity();

CREATE TABLE public.programme_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  wp_type_key TEXT,
  version INT NOT NULL DEFAULT 1,
  is_published BOOLEAN NOT NULL DEFAULT true,
  template_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.programme_templates TO authenticated;
GRANT ALL ON public.programme_templates TO service_role;
ALTER TABLE public.programme_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tmpl_read" ON public.programme_templates FOR SELECT TO authenticated USING (is_published OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "tmpl_admin_write" ON public.programme_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_tmpl_updated BEFORE UPDATE ON public.programme_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
