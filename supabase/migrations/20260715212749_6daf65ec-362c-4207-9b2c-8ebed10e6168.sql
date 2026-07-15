
-- Phase 10: Commissioning & Handover (4 tables + readiness view)

CREATE TYPE public.commissioning_status AS ENUM ('pending','in_progress','energised','commissioned','failed');
CREATE TYPE public.certificate_status  AS ENUM ('draft','issued','expired','revoked');
CREATE TYPE public.snag_severity       AS ENUM ('minor','major','critical');
CREATE TYPE public.snag_status         AS ENUM ('open','in_progress','resolved','closed','wont_fix');
CREATE TYPE public.handover_status     AS ENUM ('pending','practical_completion','client_signed','completed','on_hold');

--------------------------------------------------------------------------------
-- 1. commissioning_records
--------------------------------------------------------------------------------
CREATE TABLE public.commissioning_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id UUID,
  status public.commissioning_status NOT NULL DEFAULT 'pending',
  meter_serial TEXT,
  mpan TEXT,
  connection_capacity_kva NUMERIC,
  voltage_level TEXT,
  energised_at TIMESTAMPTZ,
  commissioned_at TIMESTAMPTZ,
  commissioning_engineer_id UUID REFERENCES auth.users(id),
  commissioning_engineer_name TEXT,
  test_pack_ref TEXT,
  test_pack_file_id UUID REFERENCES public.project_files(id) ON DELETE SET NULL,
  witness_name TEXT,
  witness_org TEXT,
  notes TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.commissioning_records TO authenticated;
GRANT ALL ON public.commissioning_records TO service_role;
ALTER TABLE public.commissioning_records ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 2. test_certificates
--------------------------------------------------------------------------------
CREATE TABLE public.test_certificates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id UUID,
  commissioning_record_id UUID REFERENCES public.commissioning_records(id) ON DELETE SET NULL,
  cert_type TEXT NOT NULL,
  cert_number TEXT,
  status public.certificate_status NOT NULL DEFAULT 'issued',
  issued_by TEXT,
  issued_by_user_id UUID REFERENCES auth.users(id),
  issued_at DATE,
  expires_at DATE,
  file_id UUID REFERENCES public.project_files(id) ON DELETE SET NULL,
  notes TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.test_certificates TO authenticated;
GRANT ALL ON public.test_certificates TO service_role;
ALTER TABLE public.test_certificates ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 3. snagging_items
--------------------------------------------------------------------------------
CREATE TABLE public.snagging_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id UUID,
  title TEXT NOT NULL,
  description TEXT,
  severity public.snag_severity NOT NULL DEFAULT 'minor',
  status public.snag_status NOT NULL DEFAULT 'open',
  raised_by UUID REFERENCES auth.users(id),
  raised_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  owner_user_id UUID REFERENCES auth.users(id),
  owner_partner_id UUID,
  target_close_date DATE,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT,
  photo_file_id UUID REFERENCES public.project_files(id) ON DELETE SET NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.snagging_items TO authenticated;
GRANT ALL ON public.snagging_items TO service_role;
ALTER TABLE public.snagging_items ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- 4. handover_packs
--------------------------------------------------------------------------------
CREATE TABLE public.handover_packs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  work_package_id UUID REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id UUID,
  status public.handover_status NOT NULL DEFAULT 'pending',
  pc_signed_at TIMESTAMPTZ,
  pc_signed_by UUID REFERENCES auth.users(id),
  pc_signed_by_name TEXT,
  om_bundle_file_id UUID REFERENCES public.project_files(id) ON DELETE SET NULL,
  client_signed_at TIMESTAMPTZ,
  client_signed_by_name TEXT,
  client_signed_by_email TEXT,
  signature_ip TEXT,
  warranty_period_months INTEGER,
  warranty_start_date DATE,
  handover_notes TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.handover_packs TO authenticated;
GRANT ALL ON public.handover_packs TO service_role;
ALTER TABLE public.handover_packs ENABLE ROW LEVEL SECURITY;

--------------------------------------------------------------------------------
-- Policies (identical shape for all 4 tables)
--------------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['commissioning_records','test_certificates','snagging_items','handover_packs'];
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
CREATE INDEX idx_commissioning_wp ON public.commissioning_records(work_package_id);
CREATE INDEX idx_commissioning_site ON public.commissioning_records(site_id);
CREATE INDEX idx_commissioning_org ON public.commissioning_records(org_id);
CREATE INDEX idx_commissioning_status ON public.commissioning_records(status);

CREATE INDEX idx_certs_wp ON public.test_certificates(work_package_id);
CREATE INDEX idx_certs_site ON public.test_certificates(site_id);
CREATE INDEX idx_certs_org ON public.test_certificates(org_id);
CREATE INDEX idx_certs_type ON public.test_certificates(cert_type);
CREATE INDEX idx_certs_commissioning ON public.test_certificates(commissioning_record_id);

CREATE INDEX idx_snags_wp ON public.snagging_items(work_package_id);
CREATE INDEX idx_snags_site ON public.snagging_items(site_id);
CREATE INDEX idx_snags_org ON public.snagging_items(org_id);
CREATE INDEX idx_snags_status ON public.snagging_items(status);
CREATE INDEX idx_snags_severity ON public.snagging_items(severity);

CREATE INDEX idx_handover_wp ON public.handover_packs(work_package_id);
CREATE INDEX idx_handover_site ON public.handover_packs(site_id);
CREATE INDEX idx_handover_org ON public.handover_packs(org_id);
CREATE INDEX idx_handover_status ON public.handover_packs(status);

--------------------------------------------------------------------------------
-- Readiness view: one row per (wp, site) with completion signals
--------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_site_handover_readiness
WITH (security_invoker = true)
AS
WITH scope AS (
  -- Union of every (wp, site) touched by any phase-10 record
  SELECT work_package_id, site_id, org_id FROM public.commissioning_records
  UNION
  SELECT work_package_id, site_id, org_id FROM public.test_certificates
  UNION
  SELECT work_package_id, site_id, org_id FROM public.snagging_items
  UNION
  SELECT work_package_id, site_id, org_id FROM public.handover_packs
),
scope_d AS (
  SELECT DISTINCT work_package_id, site_id, org_id FROM scope
),
commissioning AS (
  SELECT work_package_id, site_id,
         MAX(CASE WHEN status IN ('energised','commissioned') THEN 1 ELSE 0 END) AS is_energised,
         MAX(CASE WHEN status = 'commissioned' THEN 1 ELSE 0 END)                 AS is_commissioned,
         MAX(energised_at)   AS energised_at,
         MAX(commissioned_at) AS commissioned_at
  FROM public.commissioning_records
  GROUP BY work_package_id, site_id
),
certs AS (
  SELECT work_package_id, site_id,
         COUNT(*)                                                                 AS cert_count,
         COUNT(*) FILTER (WHERE status = 'issued')                                AS cert_issued_count,
         COUNT(*) FILTER (WHERE status = 'expired' OR (expires_at IS NOT NULL AND expires_at < CURRENT_DATE)) AS cert_expired_count
  FROM public.test_certificates
  GROUP BY work_package_id, site_id
),
snags AS (
  SELECT work_package_id, site_id,
         COUNT(*)                                                                 AS snag_total,
         COUNT(*) FILTER (WHERE status IN ('open','in_progress'))                 AS snag_open,
         COUNT(*) FILTER (WHERE severity = 'critical' AND status IN ('open','in_progress')) AS snag_open_critical,
         COUNT(*) FILTER (WHERE severity = 'major'    AND status IN ('open','in_progress')) AS snag_open_major
  FROM public.snagging_items
  GROUP BY work_package_id, site_id
),
handover AS (
  SELECT DISTINCT ON (work_package_id, site_id)
         work_package_id, site_id, status AS handover_status,
         pc_signed_at, client_signed_at, om_bundle_file_id
  FROM public.handover_packs
  ORDER BY work_package_id, site_id, updated_at DESC
)
SELECT
  s.work_package_id,
  s.site_id,
  s.org_id,
  COALESCE(c.is_energised,0)::boolean     AS is_energised,
  COALESCE(c.is_commissioned,0)::boolean  AS is_commissioned,
  c.energised_at,
  c.commissioned_at,
  COALESCE(ct.cert_count,0)               AS cert_count,
  COALESCE(ct.cert_issued_count,0)        AS cert_issued_count,
  COALESCE(ct.cert_expired_count,0)       AS cert_expired_count,
  COALESCE(sn.snag_total,0)               AS snag_total,
  COALESCE(sn.snag_open,0)                AS snag_open,
  COALESCE(sn.snag_open_critical,0)       AS snag_open_critical,
  COALESCE(sn.snag_open_major,0)          AS snag_open_major,
  h.handover_status,
  h.pc_signed_at,
  h.client_signed_at,
  (h.om_bundle_file_id IS NOT NULL)       AS has_om_bundle,
  -- Ready when: commissioned, no open critical snags, has O&M bundle, at least one cert issued
  (
    COALESCE(c.is_commissioned,0) = 1
    AND COALESCE(sn.snag_open_critical,0) = 0
    AND h.om_bundle_file_id IS NOT NULL
    AND COALESCE(ct.cert_issued_count,0) > 0
  ) AS ready_for_handover
FROM scope_d s
LEFT JOIN commissioning c ON c.work_package_id IS NOT DISTINCT FROM s.work_package_id AND c.site_id IS NOT DISTINCT FROM s.site_id
LEFT JOIN certs        ct ON ct.work_package_id IS NOT DISTINCT FROM s.work_package_id AND ct.site_id IS NOT DISTINCT FROM s.site_id
LEFT JOIN snags        sn ON sn.work_package_id IS NOT DISTINCT FROM s.work_package_id AND sn.site_id IS NOT DISTINCT FROM s.site_id
LEFT JOIN handover     h  ON h.work_package_id  IS NOT DISTINCT FROM s.work_package_id AND h.site_id  IS NOT DISTINCT FROM s.site_id;

GRANT SELECT ON public.v_site_handover_readiness TO authenticated;
GRANT SELECT ON public.v_site_handover_readiness TO service_role;
