
-- ============================================================
-- Gridwise Infrastructure Delivery OS — Phase 1 Foundation
-- Slice (a): core hierarchy + RLS
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- CLIENTS
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  tenant_org_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  primary_contact_id UUID,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_clients_tenant ON public.clients(tenant_org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ACCOUNTS
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  region TEXT,
  billing_terms JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_accounts_client ON public.accounts(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_accounts_updated BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- CONTACTS
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contacts_client ON public.contacts(client_id);
CREATE INDEX idx_contacts_account ON public.contacts(account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_contacts_updated BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.clients
  ADD CONSTRAINT fk_clients_primary_contact
  FOREIGN KEY (primary_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

-- FRAMEWORKS
CREATE TABLE public.frameworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  awarding_body TEXT,
  start_date DATE,
  end_date DATE,
  rate_card_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.frameworks TO authenticated;
GRANT ALL ON public.frameworks TO service_role;
ALTER TABLE public.frameworks ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_frameworks_updated BEFORE UPDATE ON public.frameworks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- WORKFLOWS
CREATE TABLE public.workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  stages_json JSONB NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflows TO authenticated;
GRANT ALL ON public.workflows TO service_role;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_workflows_updated BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- WORK PACKAGE TYPES
CREATE TABLE public.work_package_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  default_workflow_id UUID REFERENCES public.workflows(id) ON DELETE SET NULL,
  default_template_bundle_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_package_types TO authenticated;
GRANT ALL ON public.work_package_types TO service_role;
ALTER TABLE public.work_package_types ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_wp_types_updated BEFORE UPDATE ON public.work_package_types
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- PROGRAMMES
CREATE TABLE public.programmes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  framework_id UUID REFERENCES public.frameworks(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  code TEXT,
  target_site_count INTEGER,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_programmes_account ON public.programmes(account_id);
CREATE INDEX idx_programmes_framework ON public.programmes(framework_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.programmes TO authenticated;
GRANT ALL ON public.programmes TO service_role;
ALTER TABLE public.programmes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_programmes_updated BEFORE UPDATE ON public.programmes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- WORK PACKAGES
CREATE TABLE public.work_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id UUID NOT NULL REFERENCES public.programmes(id) ON DELETE CASCADE,
  wp_type_id UUID REFERENCES public.work_package_types(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  pm_user_id UUID REFERENCES auth.users(id),
  commercial_user_id UUID REFERENCES auth.users(id),
  delivery_user_id UUID REFERENCES auth.users(id),
  budget_amount NUMERIC(14,2),
  start_date DATE,
  target_end_date DATE,
  config_json JSONB DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (programme_id, code)
);
CREATE INDEX idx_wp_programme ON public.work_packages(programme_id);
CREATE INDEX idx_wp_type ON public.work_packages(wp_type_id);
CREATE INDEX idx_wp_status ON public.work_packages(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_packages TO authenticated;
GRANT ALL ON public.work_packages TO service_role;
ALTER TABLE public.work_packages ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_wp_updated BEFORE UPDATE ON public.work_packages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- WP TEAM
CREATE TABLE public.wp_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id UUID NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (work_package_id, user_id, team_role)
);
CREATE INDEX idx_wp_team_user ON public.wp_team(user_id);
CREATE INDEX idx_wp_team_wp ON public.wp_team(work_package_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wp_team TO authenticated;
GRANT ALL ON public.wp_team TO service_role;
ALTER TABLE public.wp_team ENABLE ROW LEVEL SECURITY;

-- WP ACCESS
CREATE TABLE public.wp_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id UUID NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  access_role TEXT NOT NULL,
  granted_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (work_package_id, user_id, access_role)
);
CREATE INDEX idx_wp_access_user ON public.wp_access(user_id);
CREATE INDEX idx_wp_access_wp ON public.wp_access(work_package_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wp_access TO authenticated;
GRANT ALL ON public.wp_access TO service_role;
ALTER TABLE public.wp_access ENABLE ROW LEVEL SECURITY;

-- WP SITES
CREATE TABLE public.wp_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id UUID NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  sequence INTEGER,
  local_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (work_package_id, site_id)
);
CREATE INDEX idx_wp_sites_wp ON public.wp_sites(work_package_id);
CREATE INDEX idx_wp_sites_site ON public.wp_sites(site_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wp_sites TO authenticated;
GRANT ALL ON public.wp_sites TO service_role;
ALTER TABLE public.wp_sites ENABLE ROW LEVEL SECURITY;

-- WORKFLOW INSTANCES
CREATE TABLE public.workflow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE RESTRICT,
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
  current_stage TEXT NOT NULL,
  state_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (work_package_id IS NOT NULL OR site_id IS NOT NULL)
);
CREATE INDEX idx_wf_inst_wp ON public.workflow_instances(work_package_id);
CREATE INDEX idx_wf_inst_site ON public.workflow_instances(site_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_instances TO authenticated;
GRANT ALL ON public.workflow_instances TO service_role;
ALTER TABLE public.workflow_instances ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_wf_inst_updated BEFORE UPDATE ON public.workflow_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- STUDIES: optional WP link
ALTER TABLE public.studies
  ADD COLUMN IF NOT EXISTS wp_id UUID REFERENCES public.work_packages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_studies_wp ON public.studies(wp_id);

-- ============================================================
-- ACCESS HELPERS (SECURITY DEFINER — avoid RLS recursion)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_gridwise_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin'::app_role, 'engineer'::app_role)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_wp_team_access(_user_id UUID, _wp_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.wp_team
    WHERE work_package_id = _wp_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_wp_access(_user_id UUID, _wp_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.wp_team
    WHERE work_package_id = _wp_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.wp_access
    WHERE work_package_id = _wp_id AND user_id = _user_id
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- ============================================================
-- RLS POLICIES
-- ============================================================
CREATE POLICY clients_staff_all ON public.clients FOR ALL TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));

CREATE POLICY accounts_staff_all ON public.accounts FOR ALL TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));

CREATE POLICY contacts_staff_all ON public.contacts FOR ALL TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));

CREATE POLICY frameworks_staff_all ON public.frameworks FOR ALL TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));

CREATE POLICY workflows_read_published ON public.workflows FOR SELECT TO authenticated
  USING (is_published OR public.is_gridwise_staff(auth.uid()));
CREATE POLICY workflows_staff_write ON public.workflows FOR INSERT TO authenticated
  WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY workflows_staff_update ON public.workflows FOR UPDATE TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY workflows_staff_delete ON public.workflows FOR DELETE TO authenticated
  USING (public.is_gridwise_staff(auth.uid()));

CREATE POLICY wp_types_read_all ON public.work_package_types FOR SELECT TO authenticated USING (true);
CREATE POLICY wp_types_staff_write ON public.work_package_types FOR INSERT TO authenticated
  WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY wp_types_staff_update ON public.work_package_types FOR UPDATE TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY wp_types_staff_delete ON public.work_package_types FOR DELETE TO authenticated
  USING (public.is_gridwise_staff(auth.uid()));

CREATE POLICY programmes_staff_all ON public.programmes FOR ALL TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY programmes_member_read ON public.programmes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.work_packages wp
    WHERE wp.programme_id = programmes.id AND public.has_wp_access(auth.uid(), wp.id)
  ));

CREATE POLICY wp_staff_all ON public.work_packages FOR ALL TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY wp_member_read ON public.work_packages FOR SELECT TO authenticated
  USING (public.has_wp_access(auth.uid(), id));
CREATE POLICY wp_team_update ON public.work_packages FOR UPDATE TO authenticated
  USING (public.has_wp_team_access(auth.uid(), id))
  WITH CHECK (public.has_wp_team_access(auth.uid(), id));

CREATE POLICY wp_team_staff_all ON public.wp_team FOR ALL TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY wp_team_self_read ON public.wp_team FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY wp_access_staff_all ON public.wp_access FOR ALL TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY wp_access_team_manage ON public.wp_access FOR ALL TO authenticated
  USING (public.has_wp_team_access(auth.uid(), work_package_id))
  WITH CHECK (public.has_wp_team_access(auth.uid(), work_package_id));
CREATE POLICY wp_access_self_read ON public.wp_access FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY wp_sites_staff_all ON public.wp_sites FOR ALL TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY wp_sites_member_read ON public.wp_sites FOR SELECT TO authenticated
  USING (public.has_wp_access(auth.uid(), work_package_id));
CREATE POLICY wp_sites_team_write ON public.wp_sites FOR INSERT TO authenticated
  WITH CHECK (public.has_wp_team_access(auth.uid(), work_package_id));
CREATE POLICY wp_sites_team_delete ON public.wp_sites FOR DELETE TO authenticated
  USING (public.has_wp_team_access(auth.uid(), work_package_id));

CREATE POLICY wf_inst_staff_all ON public.workflow_instances FOR ALL TO authenticated
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY wf_inst_member_read ON public.workflow_instances FOR SELECT TO authenticated
  USING (work_package_id IS NOT NULL AND public.has_wp_access(auth.uid(), work_package_id));
CREATE POLICY wf_inst_team_write ON public.workflow_instances FOR UPDATE TO authenticated
  USING (work_package_id IS NOT NULL AND public.has_wp_team_access(auth.uid(), work_package_id))
  WITH CHECK (work_package_id IS NOT NULL AND public.has_wp_team_access(auth.uid(), work_package_id));

-- ============================================================
-- SEEDS
-- ============================================================
INSERT INTO public.workflows (key, name, version, is_published, stages_json)
VALUES ('levi_onstreet_v1', 'LEVI On-Street v1', 1, true,
  '{"stages":[
    {"id":"site_selection","label":"Site selection","owner_role":"pm"},
    {"id":"grid_feasibility","label":"Grid feasibility","owner_role":"gridwise_engineer"},
    {"id":"estimate","label":"Estimate"},
    {"id":"client_approval","label":"Client approval"},
    {"id":"survey","label":"Survey"},
    {"id":"design","label":"Design"},
    {"id":"dno","label":"DNO application"},
    {"id":"streetworks","label":"Streetworks"},
    {"id":"traffic_management","label":"Traffic management"},
    {"id":"permits","label":"Permits"},
    {"id":"construction","label":"Construction"},
    {"id":"commissioning","label":"Commissioning"},
    {"id":"energisation","label":"Energisation"},
    {"id":"as_built","label":"As-built"},
    {"id":"invoice","label":"Invoice"},
    {"id":"closed","label":"Closed"}
  ]}'::jsonb);

INSERT INTO public.work_package_types (key, name, description, default_workflow_id)
SELECT 'levi_onstreet', 'LEVI On-Street', 'Local authority on-street EV charging programme',
       (SELECT id FROM public.workflows WHERE key='levi_onstreet_v1' AND version=1);

INSERT INTO public.work_package_types (key, name, description) VALUES
  ('hub', 'EV Charging Hub', 'Depot or destination hub with HV/EHV connection'),
  ('icp_only', 'ICP-only', 'ICP works without EV scope'),
  ('solar_bess', 'Solar + BESS', 'Solar PV and/or battery storage connection');
