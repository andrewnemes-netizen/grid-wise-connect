
-- Board customisation tables (Monday-style)

CREATE TABLE public.board_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  type text NOT NULL CHECK (type IN ('text','number','date','status','person','currency','checkbox','dropdown','formula','builtin')),
  options_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  width integer NOT NULL DEFAULT 160,
  sort_index integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_columns TO authenticated;
GRANT ALL ON public.board_columns TO service_role;
ALTER TABLE public.board_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "board_columns access via project"
ON public.board_columns FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_columns.project_id
    AND (p.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid())))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_columns.project_id
    AND (p.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid())))
);

CREATE TABLE public.board_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_views TO authenticated;
GRANT ALL ON public.board_views TO service_role;
ALTER TABLE public.board_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "board_views access via project"
ON public.board_views FOR ALL TO authenticated
USING (
  (user_id IS NULL OR user_id = auth.uid()) AND
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_views.project_id
    AND (p.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid())))
)
WITH CHECK (
  (user_id IS NULL OR user_id = auth.uid()) AND
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_views.project_id
    AND (p.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid())))
);

CREATE TABLE public.board_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  trigger_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  action_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.board_automations TO authenticated;
GRANT ALL ON public.board_automations TO service_role;
ALTER TABLE public.board_automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "board_automations access via project"
ON public.board_automations FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_automations.project_id
    AND (p.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid())))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_automations.project_id
    AND (p.created_by = auth.uid()
      OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid())))
);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_board_columns_touch BEFORE UPDATE ON public.board_columns FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_board_views_touch BEFORE UPDATE ON public.board_views FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_board_automations_touch BEFORE UPDATE ON public.board_automations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
