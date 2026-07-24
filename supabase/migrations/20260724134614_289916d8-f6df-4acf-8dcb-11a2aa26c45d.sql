CREATE TABLE IF NOT EXISTS public.stage_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  stage text NOT NULL,
  check_key text NOT NULL,
  checked boolean NOT NULL DEFAULT false,
  checked_by uuid REFERENCES auth.users(id),
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, stage, check_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_checklist_items TO authenticated;
GRANT ALL ON public.stage_checklist_items TO service_role;
ALTER TABLE public.stage_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stage_checklist_items_auth_all" ON public.stage_checklist_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.tg_set_updated_at_stage_checklist()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_stage_checklist_updated ON public.stage_checklist_items;
CREATE TRIGGER trg_stage_checklist_updated BEFORE UPDATE ON public.stage_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at_stage_checklist();