
-- Add programme_id scope column
ALTER TABLE public.board_columns ADD COLUMN IF NOT EXISTS programme_id uuid REFERENCES public.programmes(id) ON DELETE CASCADE;
ALTER TABLE public.board_views ADD COLUMN IF NOT EXISTS programme_id uuid REFERENCES public.programmes(id) ON DELETE CASCADE;
ALTER TABLE public.board_automations ADD COLUMN IF NOT EXISTS programme_id uuid REFERENCES public.programmes(id) ON DELETE CASCADE;

-- Update exclusive-scope check to allow exactly one of the three
ALTER TABLE public.board_columns DROP CONSTRAINT IF EXISTS board_columns_scope_chk;
ALTER TABLE public.board_columns ADD CONSTRAINT board_columns_scope_chk
  CHECK ((project_id IS NOT NULL)::int + (work_package_id IS NOT NULL)::int + (programme_id IS NOT NULL)::int = 1);

ALTER TABLE public.board_views DROP CONSTRAINT IF EXISTS board_views_scope_chk;
ALTER TABLE public.board_views ADD CONSTRAINT board_views_scope_chk
  CHECK ((project_id IS NOT NULL)::int + (work_package_id IS NOT NULL)::int + (programme_id IS NOT NULL)::int = 1);

ALTER TABLE public.board_automations DROP CONSTRAINT IF EXISTS board_automations_scope_chk;
ALTER TABLE public.board_automations ADD CONSTRAINT board_automations_scope_chk
  CHECK ((project_id IS NOT NULL)::int + (work_package_id IS NOT NULL)::int + (programme_id IS NOT NULL)::int = 1);

DROP INDEX IF EXISTS board_columns_scope_key;
CREATE UNIQUE INDEX IF NOT EXISTS board_columns_scope_key
  ON public.board_columns (COALESCE(project_id, work_package_id, programme_id), key);

-- Programme access predicate: staff, or has access to any WP in the programme
DROP POLICY IF EXISTS "board_columns scope access" ON public.board_columns;
CREATE POLICY "board_columns scope access"
ON public.board_columns FOR ALL TO authenticated
USING (
  (project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_columns.project_id AND (p.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid()))))
  OR (work_package_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.work_packages w WHERE w.id = board_columns.work_package_id AND (w.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.wp_access wa WHERE wa.work_package_id = w.id AND wa.user_id = auth.uid()))))
  OR (programme_id IS NOT NULL AND (public.is_gridwise_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.work_packages w WHERE w.programme_id = board_columns.programme_id AND public.has_wp_access(auth.uid(), w.id))))
)
WITH CHECK (
  (project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_columns.project_id AND (p.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid()))))
  OR (work_package_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.work_packages w WHERE w.id = board_columns.work_package_id AND (w.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.wp_access wa WHERE wa.work_package_id = w.id AND wa.user_id = auth.uid()))))
  OR (programme_id IS NOT NULL AND (public.is_gridwise_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.work_packages w WHERE w.programme_id = board_columns.programme_id AND public.has_wp_access(auth.uid(), w.id))))
);

DROP POLICY IF EXISTS "board_views scope access" ON public.board_views;
CREATE POLICY "board_views scope access"
ON public.board_views FOR ALL TO authenticated
USING (
  (user_id IS NULL OR user_id = auth.uid()) AND (
    (project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_views.project_id AND (p.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid()))))
    OR (work_package_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.work_packages w WHERE w.id = board_views.work_package_id AND (w.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.wp_access wa WHERE wa.work_package_id = w.id AND wa.user_id = auth.uid()))))
    OR (programme_id IS NOT NULL AND (public.is_gridwise_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.work_packages w WHERE w.programme_id = board_views.programme_id AND public.has_wp_access(auth.uid(), w.id))))
  )
)
WITH CHECK (
  (user_id IS NULL OR user_id = auth.uid()) AND (
    (project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_views.project_id AND (p.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid()))))
    OR (work_package_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.work_packages w WHERE w.id = board_views.work_package_id AND (w.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.wp_access wa WHERE wa.work_package_id = w.id AND wa.user_id = auth.uid()))))
    OR (programme_id IS NOT NULL AND (public.is_gridwise_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.work_packages w WHERE w.programme_id = board_views.programme_id AND public.has_wp_access(auth.uid(), w.id))))
  )
);

DROP POLICY IF EXISTS "board_automations scope access" ON public.board_automations;
CREATE POLICY "board_automations scope access"
ON public.board_automations FOR ALL TO authenticated
USING (
  (project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_automations.project_id AND (p.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid()))))
  OR (work_package_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.work_packages w WHERE w.id = board_automations.work_package_id AND (w.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.wp_access wa WHERE wa.work_package_id = w.id AND wa.user_id = auth.uid()))))
  OR (programme_id IS NOT NULL AND (public.is_gridwise_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.work_packages w WHERE w.programme_id = board_automations.programme_id AND public.has_wp_access(auth.uid(), w.id))))
)
WITH CHECK (
  (project_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.projects p WHERE p.id = board_automations.project_id AND (p.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.project_members m WHERE m.project_id = p.id AND m.user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p.org_id AND om.user_id = auth.uid()))))
  OR (work_package_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.work_packages w WHERE w.id = board_automations.work_package_id AND (w.created_by = auth.uid() OR EXISTS (SELECT 1 FROM public.wp_access wa WHERE wa.work_package_id = w.id AND wa.user_id = auth.uid()))))
  OR (programme_id IS NOT NULL AND (public.is_gridwise_staff(auth.uid()) OR EXISTS (SELECT 1 FROM public.work_packages w WHERE w.programme_id = board_automations.programme_id AND public.has_wp_access(auth.uid(), w.id))))
);

-- Storage for board custom column values on work packages
ALTER TABLE public.work_packages ADD COLUMN IF NOT EXISTS metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb;
