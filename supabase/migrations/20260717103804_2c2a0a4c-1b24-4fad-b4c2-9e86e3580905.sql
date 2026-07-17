
-- 1. Preserve old wide table (rename table + indexes to free names)
ALTER TABLE public.site_stage_status RENAME TO site_stage_status_legacy;
ALTER INDEX IF EXISTS public.site_stage_status_pkey RENAME TO site_stage_status_legacy_pkey;
ALTER INDEX IF EXISTS public.site_stage_status_wp_idx RENAME TO site_stage_status_legacy_wp_idx;
ALTER INDEX IF EXISTS public.site_stage_status_work_package_id_site_id_key
  RENAME TO site_stage_status_legacy_wp_site_key;

-- 2. Stage key enum
DO $$ BEGIN
  CREATE TYPE public.site_stage_key AS ENUM
    ('survey','design','dno','permit','civils','electrical','meter','handover');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. New normalised table
CREATE TABLE public.site_stage_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  stage public.site_stage_key NOT NULL,
  workflow_status public.site_stage_state NOT NULL DEFAULT 'not_started',
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  planned_start_date date,
  planned_finish_date date,
  actual_start_date date,
  actual_finish_date date,
  blocked_reason text,
  review_notes text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, stage)
);

CREATE INDEX sss_wp_idx ON public.site_stage_status(work_package_id);
CREATE INDEX sss_site_idx ON public.site_stage_status(site_id);
CREATE INDEX sss_stage_idx ON public.site_stage_status(stage);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_stage_status TO authenticated;
GRANT ALL ON public.site_stage_status TO service_role;

ALTER TABLE public.site_stage_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View site stage with WP access"
  ON public.site_stage_status FOR SELECT TO authenticated
  USING (can_access_wp(auth.uid(), work_package_id));

CREATE POLICY "Manage site stage with WP access"
  ON public.site_stage_status FOR ALL TO authenticated
  USING (can_manage_wp(auth.uid(), work_package_id))
  WITH CHECK (can_manage_wp(auth.uid(), work_package_id));

-- 4. updated_at + updated_by trigger
CREATE OR REPLACE FUNCTION public.site_stage_status_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by = auth.uid();
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_site_stage_status_touch
  BEFORE INSERT OR UPDATE ON public.site_stage_status
  FOR EACH ROW EXECUTE FUNCTION public.site_stage_status_touch();

-- 5. Immutable audit trail
CREATE TABLE public.site_stage_status_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL,
  site_id uuid NOT NULL,
  stage public.site_stage_key NOT NULL,
  previous_status public.site_stage_state,
  new_status public.site_stage_state NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text
);

CREATE INDEX sssa_site_stage_idx
  ON public.site_stage_status_audit(site_id, stage, changed_at DESC);
CREATE INDEX sssa_wp_idx ON public.site_stage_status_audit(work_package_id);

GRANT SELECT ON public.site_stage_status_audit TO authenticated;
GRANT ALL ON public.site_stage_status_audit TO service_role;

ALTER TABLE public.site_stage_status_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View stage audit with WP access"
  ON public.site_stage_status_audit FOR SELECT TO authenticated
  USING (can_access_wp(auth.uid(), work_package_id));

-- Audit trigger (populated server-side; no client writes)
CREATE OR REPLACE FUNCTION public.site_stage_status_audit_fn()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.workflow_status <> 'not_started' THEN
      INSERT INTO public.site_stage_status_audit
        (work_package_id, site_id, stage, previous_status, new_status, changed_by, reason)
      VALUES (NEW.work_package_id, NEW.site_id, NEW.stage, NULL, NEW.workflow_status,
              COALESCE(NEW.updated_by, auth.uid()), NEW.blocked_reason);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.workflow_status IS DISTINCT FROM OLD.workflow_status THEN
    INSERT INTO public.site_stage_status_audit
      (work_package_id, site_id, stage, previous_status, new_status, changed_by, reason)
    VALUES (NEW.work_package_id, NEW.site_id, NEW.stage, OLD.workflow_status, NEW.workflow_status,
            COALESCE(NEW.updated_by, auth.uid()), NEW.blocked_reason);
    RETURN NEW;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_site_stage_status_audit
  AFTER INSERT OR UPDATE ON public.site_stage_status
  FOR EACH ROW EXECUTE FUNCTION public.site_stage_status_audit_fn();

-- 6. Backfill from legacy wide table (unpivot 8 columns into 8 rows per site)
INSERT INTO public.site_stage_status
  (work_package_id, site_id, stage, workflow_status, updated_at)
SELECT work_package_id, site_id, stage::public.site_stage_key, status, updated_at
FROM (
  SELECT work_package_id, site_id, updated_at,
         unnest(ARRAY['survey','design','dno','permit','civils','electrical','meter','handover']) AS stage,
         unnest(ARRAY[survey, design, dno, permit, civils, electrical, meter, handover]) AS status
  FROM public.site_stage_status_legacy
) s
ON CONFLICT (site_id, stage) DO NOTHING;
