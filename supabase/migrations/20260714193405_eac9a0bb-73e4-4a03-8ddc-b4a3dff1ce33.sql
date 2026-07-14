
ALTER TABLE public.board_columns DROP CONSTRAINT IF EXISTS board_columns_project_id_key_key;
ALTER TABLE public.board_columns ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE public.board_columns ADD COLUMN IF NOT EXISTS work_package_id uuid REFERENCES public.work_packages(id) ON DELETE CASCADE;
ALTER TABLE public.board_columns DROP CONSTRAINT IF EXISTS board_columns_scope_chk;
ALTER TABLE public.board_columns ADD CONSTRAINT board_columns_scope_chk CHECK ((project_id IS NOT NULL)::int + (work_package_id IS NOT NULL)::int = 1);
CREATE UNIQUE INDEX IF NOT EXISTS board_columns_scope_key ON public.board_columns (COALESCE(project_id, work_package_id), key);

ALTER TABLE public.board_views ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE public.board_views ADD COLUMN IF NOT EXISTS work_package_id uuid REFERENCES public.work_packages(id) ON DELETE CASCADE;
ALTER TABLE public.board_views DROP CONSTRAINT IF EXISTS board_views_scope_chk;
ALTER TABLE public.board_views ADD CONSTRAINT board_views_scope_chk CHECK ((project_id IS NOT NULL)::int + (work_package_id IS NOT NULL)::int = 1);

ALTER TABLE public.board_automations ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE public.board_automations ADD COLUMN IF NOT EXISTS work_package_id uuid REFERENCES public.work_packages(id) ON DELETE CASCADE;
ALTER TABLE public.board_automations DROP CONSTRAINT IF EXISTS board_automations_scope_chk;
ALTER TABLE public.board_automations ADD CONSTRAINT board_automations_scope_chk CHECK ((project_id IS NOT NULL)::int + (work_package_id IS NOT NULL)::int = 1);

DROP POLICY IF EXISTS "board_columns access via project" ON public.board_columns;
DROP POLICY IF EXISTS "board_columns scope access" ON public.board_columns;
CREATE POLICY "board_columns scope access"
ON public.board_columns FOR ALL TO authenticated
USING (
  (project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_columns.project_id AND (p.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid()))))
  OR (work_package_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.work_packages w WHERE w.id = board_columns.work_package_id AND (w.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.wp_access wa WHERE wa.work_package_id = w.id AND wa.user_id = auth.uid()))))
)
WITH CHECK (
  (project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_columns.project_id AND (p.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid()))))
  OR (work_package_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.work_packages w WHERE w.id = board_columns.work_package_id AND (w.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.wp_access wa WHERE wa.work_package_id = w.id AND wa.user_id = auth.uid()))))
);

DROP POLICY IF EXISTS "board_views access via project" ON public.board_views;
DROP POLICY IF EXISTS "board_views scope access" ON public.board_views;
CREATE POLICY "board_views scope access"
ON public.board_views FOR ALL TO authenticated
USING (
  (user_id IS NULL OR user_id = auth.uid()) AND (
    (project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_views.project_id AND (p.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid()))))
    OR (work_package_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.work_packages w WHERE w.id = board_views.work_package_id AND (w.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.wp_access wa WHERE wa.work_package_id = w.id AND wa.user_id = auth.uid()))))
  )
)
WITH CHECK (
  (user_id IS NULL OR user_id = auth.uid()) AND (
    (project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_views.project_id AND (p.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid()))))
    OR (work_package_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.work_packages w WHERE w.id = board_views.work_package_id AND (w.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.wp_access wa WHERE wa.work_package_id = w.id AND wa.user_id = auth.uid()))))
  )
);

DROP POLICY IF EXISTS "board_automations access via project" ON public.board_automations;
DROP POLICY IF EXISTS "board_automations scope access" ON public.board_automations;
CREATE POLICY "board_automations scope access"
ON public.board_automations FOR ALL TO authenticated
USING (
  (project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_automations.project_id AND (p.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid()))))
  OR (work_package_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.work_packages w WHERE w.id = board_automations.work_package_id AND (w.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.wp_access wa WHERE wa.work_package_id = w.id AND wa.user_id = auth.uid()))))
)
WITH CHECK (
  (project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_automations.project_id AND (p.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid()))))
  OR (work_package_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.work_packages w WHERE w.id = board_automations.work_package_id AND (w.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.wp_access wa WHERE wa.work_package_id = w.id AND wa.user_id = auth.uid()))))
);
