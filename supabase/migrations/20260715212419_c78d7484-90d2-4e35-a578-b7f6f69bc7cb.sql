
-- Phase 9: Construction Control (7 tables)

CREATE TYPE public.permit_status AS ENUM ('draft','applied','approved','rejected','expired','cancelled');
CREATE TYPE public.tm_approval_state AS ENUM ('draft','submitted','approved','rejected','expired');
CREATE TYPE public.rams_status AS ENUM ('draft','under_review','approved','superseded','rejected');
CREATE TYPE public.inspection_result AS ENUM ('pending','passed','passed_with_defects','failed');

-- Helper: standard org-scoped RLS policy set applied below

--------------------------------------------------------------------------------
-- 1. permits
--------------------------------------------------------------------------------
CREATE TABLE public.permits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id UUID,
  permit_type TEXT NOT NULL,
  reference TEXT,
  status public.permit_status NOT NULL DEFAULT 'draft',
  authority TEXT,
  applied_on DATE,
  approved_on DATE,
  valid_from DATE,
  expiry_date DATE,
  notes TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.permits TO authenticated;
GRANT ALL ON public.permits TO service_role;
ALTER TABLE public.permits ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 2. traffic_management_plans
--------------------------------------------------------------------------------
CREATE TABLE public.traffic_management_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id UUID,
  tm_type TEXT NOT NULL,
  reference TEXT,
  approval_state public.tm_approval_state NOT NULL DEFAULT 'draft',
  authority TEXT,
  contractor TEXT,
  valid_from DATE,
  valid_to DATE,
  notes TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.traffic_management_plans TO authenticated;
GRANT ALL ON public.traffic_management_plans TO service_role;
ALTER TABLE public.traffic_management_plans ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 3. rams_documents
--------------------------------------------------------------------------------
CREATE TABLE public.rams_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id UUID,
  title TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  status public.rams_status NOT NULL DEFAULT 'draft',
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  valid_from DATE,
  valid_to DATE,
  summary TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rams_documents TO authenticated;
GRANT ALL ON public.rams_documents TO service_role;
ALTER TABLE public.rams_documents ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 4. daily_logs
--------------------------------------------------------------------------------
CREATE TABLE public.daily_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id UUID,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  weather TEXT,
  temperature_c NUMERIC,
  crew_count INTEGER,
  crew_names TEXT,
  hours_worked NUMERIC,
  work_done TEXT,
  issues TEXT,
  photos_count INTEGER NOT NULL DEFAULT 0,
  logged_by UUID,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_logs TO authenticated;
GRANT ALL ON public.daily_logs TO service_role;
ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 5. site_photos
--------------------------------------------------------------------------------
CREATE TABLE public.site_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id UUID,
  daily_log_id UUID REFERENCES public.daily_logs(id) ON DELETE SET NULL,
  project_file_id UUID REFERENCES public.project_files(id) ON DELETE CASCADE,
  caption TEXT,
  taken_at TIMESTAMPTZ,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  bearing NUMERIC,
  exif_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags TEXT[],
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_photos TO authenticated;
GRANT ALL ON public.site_photos TO service_role;
ALTER TABLE public.site_photos ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 6. inspections
--------------------------------------------------------------------------------
CREATE TABLE public.inspections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id UUID,
  inspection_type TEXT NOT NULL,
  inspector_id UUID REFERENCES auth.users(id),
  inspector_name TEXT,
  inspected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  result public.inspection_result NOT NULL DEFAULT 'pending',
  score NUMERIC,
  defects_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  followup_required BOOLEAN NOT NULL DEFAULT false,
  followup_due DATE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspections TO authenticated;
GRANT ALL ON public.inspections TO service_role;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 7. materials_deliveries
--------------------------------------------------------------------------------
CREATE TABLE public.materials_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id UUID,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  po_line_id UUID REFERENCES public.po_lines(id) ON DELETE SET NULL,
  item TEXT NOT NULL,
  description TEXT,
  qty NUMERIC NOT NULL DEFAULT 0,
  uom TEXT,
  supplier TEXT,
  delivery_note_ref TEXT,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by UUID REFERENCES auth.users(id),
  received_by_name TEXT,
  condition_notes TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.materials_deliveries TO authenticated;
GRANT ALL ON public.materials_deliveries TO service_role;
ALTER TABLE public.materials_deliveries ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- Policies (identical shape for all 7 tables)
--------------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['permits','traffic_management_plans','rams_documents','daily_logs','site_photos','inspections','materials_deliveries'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format($p$
      CREATE POLICY "Org members can view %1$s"
      ON public.%1$s FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = %1$s.org_id AND om.user_id = auth.uid()));
    $p$, t);

    EXECUTE format($p$
      CREATE POLICY "Admins/engineers can insert %1$s"
      ON public.%1$s FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = %1$s.org_id AND om.user_id = auth.uid())
        AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'engineer'))
      );
    $p$, t);

    EXECUTE format($p$
      CREATE POLICY "Admins/engineers can update %1$s"
      ON public.%1$s FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = %1$s.org_id AND om.user_id = auth.uid())
        AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'engineer'))
      );
    $p$, t);

    EXECUTE format($p$
      CREATE POLICY "Admins can delete %1$s"
      ON public.%1$s FOR DELETE TO authenticated
      USING (public.has_role(auth.uid(),'admin'));
    $p$, t);

    EXECUTE format('CREATE TRIGGER update_%1$s_updated_at BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();', t);
  END LOOP;
END $$;

--------------------------------------------------------------------------------
-- Indexes
--------------------------------------------------------------------------------
CREATE INDEX idx_permits_wp ON public.permits(work_package_id);
CREATE INDEX idx_permits_site ON public.permits(site_id);
CREATE INDEX idx_permits_org ON public.permits(org_id);
CREATE INDEX idx_permits_status ON public.permits(status);

CREATE INDEX idx_tm_wp ON public.traffic_management_plans(work_package_id);
CREATE INDEX idx_tm_site ON public.traffic_management_plans(site_id);
CREATE INDEX idx_tm_org ON public.traffic_management_plans(org_id);
CREATE INDEX idx_tm_state ON public.traffic_management_plans(approval_state);

CREATE INDEX idx_rams_wp ON public.rams_documents(work_package_id);
CREATE INDEX idx_rams_site ON public.rams_documents(site_id);
CREATE INDEX idx_rams_org ON public.rams_documents(org_id);
CREATE INDEX idx_rams_status ON public.rams_documents(status);

CREATE INDEX idx_daily_logs_wp ON public.daily_logs(work_package_id);
CREATE INDEX idx_daily_logs_site_date ON public.daily_logs(site_id, log_date);
CREATE INDEX idx_daily_logs_org ON public.daily_logs(org_id);

CREATE INDEX idx_site_photos_wp ON public.site_photos(work_package_id);
CREATE INDEX idx_site_photos_site ON public.site_photos(site_id);
CREATE INDEX idx_site_photos_daily_log ON public.site_photos(daily_log_id);
CREATE INDEX idx_site_photos_org ON public.site_photos(org_id);

CREATE INDEX idx_inspections_wp ON public.inspections(work_package_id);
CREATE INDEX idx_inspections_site ON public.inspections(site_id);
CREATE INDEX idx_inspections_org ON public.inspections(org_id);
CREATE INDEX idx_inspections_result ON public.inspections(result);

CREATE INDEX idx_materials_wp ON public.materials_deliveries(work_package_id);
CREATE INDEX idx_materials_site ON public.materials_deliveries(site_id);
CREATE INDEX idx_materials_org ON public.materials_deliveries(org_id);
CREATE INDEX idx_materials_po ON public.materials_deliveries(purchase_order_id);
