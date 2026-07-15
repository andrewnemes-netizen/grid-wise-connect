
-- ============================================================
-- PHASE 1 — GRIDWISE OS DATA FOUNDATION
-- ============================================================

-- ── 1. Site-stage configuration (replaces v2 enum) ──────────

CREATE TABLE public.stage_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE, -- null = global default
  key text NOT NULL,
  label text NOT NULL,
  colour text,
  category text NOT NULL CHECK (category IN ('pre-con','design','delivery','commissioning','handover','closed')),
  order_index int NOT NULL DEFAULT 0,
  is_terminal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_definitions TO authenticated;
GRANT ALL ON public.stage_definitions TO service_role;
ALTER TABLE public.stage_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stage_definitions readable to authenticated" ON public.stage_definitions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "stage_definitions admin write" ON public.stage_definitions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.workflow_stage_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_stage_sets TO authenticated;
GRANT ALL ON public.workflow_stage_sets TO service_role;
ALTER TABLE public.workflow_stage_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workflow_stage_sets read" ON public.workflow_stage_sets
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "workflow_stage_sets admin write" ON public.workflow_stage_sets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.workflow_stage_set_stages (
  set_id uuid NOT NULL REFERENCES public.workflow_stage_sets(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.stage_definitions(id) ON DELETE CASCADE,
  order_index int NOT NULL DEFAULT 0,
  PRIMARY KEY (set_id, stage_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_stage_set_stages TO authenticated;
GRANT ALL ON public.workflow_stage_set_stages TO service_role;
ALTER TABLE public.workflow_stage_set_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wsss read" ON public.workflow_stage_set_stages
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "wsss admin write" ON public.workflow_stage_set_stages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.stage_transition_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_set_id uuid REFERENCES public.workflow_stage_sets(id) ON DELETE CASCADE,
  from_stage_id uuid REFERENCES public.stage_definitions(id) ON DELETE CASCADE,
  to_stage_id uuid NOT NULL REFERENCES public.stage_definitions(id) ON DELETE CASCADE,
  required_role text, -- 'admin' | 'engineer' | 'partner' | null
  required_gate text, -- 'design_approved' | 'po_received' | 'rams_present' | 'energised' | ...
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stage_transition_rules TO authenticated;
GRANT ALL ON public.stage_transition_rules TO service_role;
ALTER TABLE public.stage_transition_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "str read" ON public.stage_transition_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "str admin write" ON public.stage_transition_rules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── 2. Partners ────────────────────────────────────────────

CREATE TABLE public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'icp' CHECK (type IN ('icp','contractor','consultant','subcontractor')),
  status text NOT NULL DEFAULT 'active',
  primary_contact_email text,
  default_rate_card_id uuid REFERENCES public.rate_cards(id) ON DELETE SET NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partners TO authenticated;
GRANT ALL ON public.partners TO service_role;
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partners staff read" ON public.partners
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "partners staff write" ON public.partners
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));

CREATE TABLE public.partner_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_users TO authenticated;
GRANT ALL ON public.partner_users TO service_role;
ALTER TABLE public.partner_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "partner_users self read" ON public.partner_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "partner_users admin write" ON public.partner_users
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.wp_partner_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE, -- null = whole WP
  allocated_by uuid REFERENCES auth.users(id),
  allocated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (work_package_id, partner_id, site_id)
);
CREATE INDEX idx_wp_partner_alloc_wp ON public.wp_partner_allocations(work_package_id);
CREATE INDEX idx_wp_partner_alloc_partner ON public.wp_partner_allocations(partner_id);
CREATE INDEX idx_wp_partner_alloc_site ON public.wp_partner_allocations(site_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wp_partner_allocations TO authenticated;
GRANT ALL ON public.wp_partner_allocations TO service_role;
ALTER TABLE public.wp_partner_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wp_partner_alloc staff read" ON public.wp_partner_allocations
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'engineer')
    OR EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = wp_partner_allocations.partner_id AND pu.user_id = auth.uid())
  );
CREATE POLICY "wp_partner_alloc staff write" ON public.wp_partner_allocations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));

-- ── 3. DNO Offers ──────────────────────────────────────────

CREATE TABLE public.dno_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
  work_package_id uuid REFERENCES public.work_packages(id) ON DELETE CASCADE,
  dno_key text,
  offer_ref text NOT NULL,
  revision int NOT NULL DEFAULT 1,
  offer_value numeric,
  received_at timestamptz,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','expired','rejected','superseded')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_dno_offers_wp ON public.dno_offers(work_package_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dno_offers TO authenticated;
GRANT ALL ON public.dno_offers TO service_role;
ALTER TABLE public.dno_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dno_offers staff all" ON public.dno_offers
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));

CREATE TABLE public.dno_offer_sites (
  dno_offer_id uuid NOT NULL REFERENCES public.dno_offers(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (dno_offer_id, site_id)
);
CREATE INDEX idx_dno_offer_sites_site ON public.dno_offer_sites(site_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dno_offer_sites TO authenticated;
GRANT ALL ON public.dno_offer_sites TO service_role;
ALTER TABLE public.dno_offer_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dno_offer_sites staff all" ON public.dno_offer_sites
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));

-- ── 4. Purchase Orders ─────────────────────────────────────

CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL,
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  po_number text NOT NULL,
  order_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed','amended','cancelled')),
  issued_at timestamptz,
  expires_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, po_number)
);
CREATE INDEX idx_po_wp ON public.purchase_orders(work_package_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_orders staff all" ON public.purchase_orders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));

CREATE TABLE public.po_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  description text,
  line_value numeric NOT NULL DEFAULT 0,
  estimate_line_id uuid REFERENCES public.estimate_lines(id) ON DELETE SET NULL,
  sort_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_po_lines_po ON public.po_lines(po_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.po_lines TO authenticated;
GRANT ALL ON public.po_lines TO service_role;
ALTER TABLE public.po_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_lines staff all" ON public.po_lines
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));

CREATE TABLE public.po_line_sites (
  po_line_id uuid NOT NULL REFERENCES public.po_lines(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  qty numeric,
  value numeric,
  PRIMARY KEY (po_line_id, site_id)
);
CREATE INDEX idx_po_line_sites_site ON public.po_line_sites(site_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.po_line_sites TO authenticated;
GRANT ALL ON public.po_line_sites TO service_role;
ALTER TABLE public.po_line_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "po_line_sites staff all" ON public.po_line_sites
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));

-- ── 5. Design submissions / reviews ────────────────────────

CREATE TABLE public.design_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  submitted_by_user_id uuid REFERENCES auth.users(id),
  submitted_by_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  revision int NOT NULL DEFAULT 1,
  title text,
  notes text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','in_review','approved','rejected','superseded')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_design_subs_wp ON public.design_submissions(work_package_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.design_submissions TO authenticated;
GRANT ALL ON public.design_submissions TO service_role;
ALTER TABLE public.design_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "design_subs staff all" ON public.design_submissions
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'engineer')
    OR EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = design_submissions.submitted_by_partner_id AND pu.user_id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'engineer')
    OR EXISTS (SELECT 1 FROM public.partner_users pu WHERE pu.partner_id = design_submissions.submitted_by_partner_id AND pu.user_id = auth.uid())
  );

CREATE TABLE public.design_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_submission_id uuid NOT NULL REFERENCES public.design_submissions(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id),
  decision text NOT NULL CHECK (decision IN ('approved','rejected','comments')),
  comments text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_design_reviews_sub ON public.design_reviews(design_submission_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.design_reviews TO authenticated;
GRANT ALL ON public.design_reviews TO service_role;
ALTER TABLE public.design_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "design_reviews staff all" ON public.design_reviews
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));

CREATE TABLE public.site_design_submissions (
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  design_submission_id uuid NOT NULL REFERENCES public.design_submissions(id) ON DELETE CASCADE,
  is_current boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (site_id, design_submission_id)
);
CREATE INDEX idx_sds_sub ON public.site_design_submissions(design_submission_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_design_submissions TO authenticated;
GRANT ALL ON public.site_design_submissions TO service_role;
ALTER TABLE public.site_design_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sds staff all" ON public.site_design_submissions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));

-- ── 6. Site stage history ──────────────────────────────────

CREATE TABLE public.site_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  from_stage_id uuid REFERENCES public.stage_definitions(id) ON DELETE SET NULL,
  to_stage_id uuid NOT NULL REFERENCES public.stage_definitions(id) ON DELETE RESTRICT,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_ssh_site ON public.site_stage_history(site_id, changed_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_stage_history TO authenticated;
GRANT ALL ON public.site_stage_history TO service_role;
ALTER TABLE public.site_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ssh staff read" ON public.site_stage_history
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));
CREATE POLICY "ssh staff insert" ON public.site_stage_history
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'engineer'));

-- ── 7. Feature flags ───────────────────────────────────────

CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('global','org','user')),
  org_id uuid REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feature_flags_scope_target CHECK (
    (scope = 'global' AND org_id IS NULL AND user_id IS NULL)
    OR (scope = 'org' AND org_id IS NOT NULL AND user_id IS NULL)
    OR (scope = 'user' AND user_id IS NOT NULL AND org_id IS NULL)
  ),
  UNIQUE (flag_key, scope, org_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feature_flags read visible" ON public.feature_flags
  FOR SELECT TO authenticated
  USING (
    scope = 'global'
    OR (scope = 'user' AND user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY "feature_flags admin write" ON public.feature_flags
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ── 8. Altered tables (additive only) ──────────────────────

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS current_stage_id uuid REFERENCES public.stage_definitions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS primary_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sites_current_stage ON public.sites(current_stage_id);

ALTER TABLE public.wp_sites
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

ALTER TABLE public.project_files
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id uuid;
CREATE INDEX IF NOT EXISTS idx_project_files_entity ON public.project_files(entity_type, entity_id);

ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS visibility_lens_default text CHECK (visibility_lens_default IN ('internal','client','partner','dno')),
  ADD COLUMN IF NOT EXISTS parent_estimate_id uuid REFERENCES public.estimates(id) ON DELETE SET NULL;

ALTER TABLE public.estimate_lines
  ADD COLUMN IF NOT EXISTS partner_visible boolean NOT NULL DEFAULT false;

ALTER TABLE public.wp_tasks
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'wp_level' CHECK (scope = 'wp_level');

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.sites(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'site_level' CHECK (scope = 'site_level');

ALTER TABLE public.work_packages
  ADD COLUMN IF NOT EXISTS delivery_project_id uuid,
  ADD COLUMN IF NOT EXISTS wp_procurement_unlocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS workflow_stage_set_id uuid REFERENCES public.workflow_stage_sets(id) ON DELETE SET NULL;

-- ── 9. Updated-at triggers ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'stage_definitions','workflow_stage_sets','partners','dno_offers',
    'purchase_orders','po_lines','design_submissions','feature_flags'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%1$s ON public.%1$s;', t);
    EXECUTE format('CREATE TRIGGER trg_touch_%1$s BEFORE UPDATE ON public.%1$s FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();', t);
  END LOOP;
END $$;

-- ── 10. Trigger: log site stage changes ────────────────────

CREATE OR REPLACE FUNCTION public.tg_log_site_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.current_stage_id IS DISTINCT FROM OLD.current_stage_id THEN
    INSERT INTO public.site_stage_history (site_id, from_stage_id, to_stage_id, changed_by)
    VALUES (NEW.id, OLD.current_stage_id, NEW.current_stage_id, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.tg_log_site_stage_change() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_log_site_stage_change ON public.sites;
CREATE TRIGGER trg_log_site_stage_change
  AFTER UPDATE OF current_stage_id ON public.sites
  FOR EACH ROW EXECUTE FUNCTION public.tg_log_site_stage_change();

-- ── 11. Trigger: maintain sites.primary_partner_id from allocations ──

CREATE OR REPLACE FUNCTION public.tg_refresh_site_primary_partner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_site_id uuid;
BEGIN
  v_site_id := COALESCE(NEW.site_id, OLD.site_id);
  IF v_site_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  UPDATE public.sites s
    SET primary_partner_id = (
      SELECT wpa.partner_id
      FROM public.wp_partner_allocations wpa
      WHERE wpa.site_id = v_site_id
      ORDER BY wpa.allocated_at DESC
      LIMIT 1
    )
    WHERE s.id = v_site_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.tg_refresh_site_primary_partner() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_refresh_site_primary_partner ON public.wp_partner_allocations;
CREATE TRIGGER trg_refresh_site_primary_partner
  AFTER INSERT OR UPDATE OR DELETE ON public.wp_partner_allocations
  FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_site_primary_partner();

-- ── 12. Seed data ──────────────────────────────────────────

-- Global stage definitions (org_id = NULL)
INSERT INTO public.stage_definitions (org_id, key, label, category, order_index, is_terminal) VALUES
  (NULL, 'imported',                'Imported',                'pre-con',      10,  false),
  (NULL, 'allocated',                'Allocated',                'pre-con',      20,  false),
  (NULL, 'poc_assessment',           'POC Assessment',           'pre-con',      30,  false),
  (NULL, 'dno_submitted',            'DNO Submitted',            'pre-con',      40,  false),
  (NULL, 'awaiting_offer',           'Awaiting Offer',           'pre-con',      50,  false),
  (NULL, 'offer_received',           'Offer Received',           'pre-con',      60,  false),
  (NULL, 'commercial_review',        'Commercial Review',        'pre-con',      70,  false),
  (NULL, 'awaiting_client_po',       'Awaiting Client PO',       'pre-con',      80,  false),
  (NULL, 'client_po_received',       'Client PO Received',       'pre-con',      90,  false),
  (NULL, 'design_in_progress',       'Design In Progress',       'design',      100,  false),
  (NULL, 'design_submitted',         'Design Submitted',         'design',      110,  false),
  (NULL, 'design_approved',          'Design Approved',          'design',      120,  false),
  (NULL, 'ready_for_delivery',       'Ready For Delivery',       'delivery',    130,  false),
  (NULL, 'permits_applied',          'Permits Applied',          'delivery',    140,  false),
  (NULL, 'traffic_management_agreed','Traffic Management Agreed','delivery',    150,  false),
  (NULL, 'mobilised',                'Mobilised',                'delivery',    160,  false),
  (NULL, 'civils_in_progress',       'Civils In Progress',       'delivery',    170,  false),
  (NULL, 'cabling_complete',         'Cabling Complete',         'delivery',    180,  false),
  (NULL, 'jointing_complete',        'Jointing Complete',        'delivery',    190,  false),
  (NULL, 'energised',                'Energised',                'commissioning', 200, false),
  (NULL, 'commissioned',             'Commissioned',             'commissioning', 210, false),
  (NULL, 'snagging',                 'Snagging',                 'commissioning', 220, false),
  (NULL, 'practical_completion',     'Practical Completion',     'handover',    230,  false),
  (NULL, 'handover_complete',        'Handover Complete',        'handover',    240,  false),
  (NULL, 'closed',                   'Closed',                   'closed',      250,  true )
ON CONFLICT DO NOTHING;

-- Global default workflow set
INSERT INTO public.workflow_stage_sets (id, org_id, name, description, is_default)
VALUES ('00000000-0000-0000-0000-000000000001', NULL, 'Gridwise OS Default', 'Full lifecycle from import to handover', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workflow_stage_set_stages (set_id, stage_id, order_index)
SELECT '00000000-0000-0000-0000-000000000001', id, order_index
FROM public.stage_definitions WHERE org_id IS NULL
ON CONFLICT DO NOTHING;

-- Feature flag row, disabled
INSERT INTO public.feature_flags (flag_key, scope, enabled)
VALUES ('gridwise_os_shell', 'global', false)
ON CONFLICT DO NOTHING;
