
-- =============== IMPORT BATCHES ===============
CREATE TABLE public.import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  created_by uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('csv','xlsx','pdf','docx','paste')),
  filename text,
  file_path text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','validating','geocoding','ready','approving','approved','failed','rolled_back')),
  mapping_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_client_id uuid,
  target_programme_id uuid,
  target_wp_id uuid,
  new_programme_json jsonb,
  new_wp_json jsonb,
  new_client_name text,
  version integer NOT NULL DEFAULT 1,
  parent_batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL,
  total_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  duplicate_rows integer NOT NULL DEFAULT 0,
  approved_at timestamptz,
  rolled_back_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_batches TO authenticated;
GRANT ALL ON public.import_batches TO service_role;
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_batches_staff_all" ON public.import_batches FOR ALL
  USING (public.is_gridwise_staff(auth.uid()))
  WITH CHECK (public.is_gridwise_staff(auth.uid()));

CREATE POLICY "import_batches_owner_read" ON public.import_batches FOR SELECT
  USING (created_by = auth.uid());

CREATE POLICY "import_batches_org_read" ON public.import_batches FOR SELECT
  USING (org_id IS NOT NULL AND public.is_org_member(auth.uid(), org_id));

CREATE POLICY "import_batches_owner_insert" ON public.import_batches FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "import_batches_owner_update" ON public.import_batches FOR UPDATE
  USING (created_by = auth.uid() AND status IN ('draft','validating','geocoding','ready','failed'))
  WITH CHECK (created_by = auth.uid());

CREATE INDEX ix_import_batches_created_by ON public.import_batches(created_by);
CREATE INDEX ix_import_batches_org ON public.import_batches(org_id);
CREATE INDEX ix_import_batches_status ON public.import_batches(status);

-- =============== IMPORT ROWS ===============
CREATE TABLE public.import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  row_index integer NOT NULL,
  raw_json jsonb NOT NULL,
  mapped_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','warning','error','duplicate','skipped')),
  errors_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  dedupe_key text,
  geocode_confidence numeric,
  geocode_source text,
  lat numeric,
  lng numeric,
  resolved_site_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (batch_id, row_index)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_rows TO authenticated;
GRANT ALL ON public.import_rows TO service_role;
ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_rows_staff_all" ON public.import_rows FOR ALL
  USING (public.is_gridwise_staff(auth.uid()))
  WITH CHECK (public.is_gridwise_staff(auth.uid()));

CREATE POLICY "import_rows_batch_read" ON public.import_rows FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.import_batches b WHERE b.id = batch_id AND (b.created_by = auth.uid() OR (b.org_id IS NOT NULL AND public.is_org_member(auth.uid(), b.org_id)))));

CREATE POLICY "import_rows_owner_write" ON public.import_rows FOR ALL
  USING (EXISTS (SELECT 1 FROM public.import_batches b WHERE b.id = batch_id AND b.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.import_batches b WHERE b.id = batch_id AND b.created_by = auth.uid()));

CREATE INDEX ix_import_rows_batch ON public.import_rows(batch_id, row_index);
CREATE INDEX ix_import_rows_dedupe ON public.import_rows(dedupe_key);

-- =============== IMPORT COLUMN MAPPINGS ===============
CREATE TABLE public.import_column_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  created_by uuid NOT NULL,
  name text NOT NULL,
  mapping_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_column_mappings TO authenticated;
GRANT ALL ON public.import_column_mappings TO service_role;
ALTER TABLE public.import_column_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_mappings_staff_all" ON public.import_column_mappings FOR ALL
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "import_mappings_owner_all" ON public.import_column_mappings FOR ALL
  USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "import_mappings_org_read" ON public.import_column_mappings FOR SELECT
  USING (org_id IS NOT NULL AND public.is_org_member(auth.uid(), org_id));

-- =============== IMPORT AUDIT ===============
CREATE TABLE public.import_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  actor_id uuid,
  action text NOT NULL,
  diff_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.import_audit TO authenticated;
GRANT ALL ON public.import_audit TO service_role;
ALTER TABLE public.import_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_audit_staff_all" ON public.import_audit FOR ALL
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "import_audit_batch_read" ON public.import_audit FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.import_batches b WHERE b.id = batch_id AND (b.created_by = auth.uid() OR (b.org_id IS NOT NULL AND public.is_org_member(auth.uid(), b.org_id)))));

CREATE INDEX ix_import_audit_batch ON public.import_audit(batch_id, created_at DESC);

-- =============== IMPORT CREATED RECORDS ===============
CREATE TABLE public.import_created_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.import_batches(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('client','programme','work_package','site','wp_site','geo_point')),
  entity_id uuid NOT NULL,
  reversible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.import_created_records TO authenticated;
GRANT ALL ON public.import_created_records TO service_role;
ALTER TABLE public.import_created_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_created_staff_all" ON public.import_created_records FOR ALL
  USING (public.is_gridwise_staff(auth.uid())) WITH CHECK (public.is_gridwise_staff(auth.uid()));
CREATE POLICY "import_created_batch_read" ON public.import_created_records FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.import_batches b WHERE b.id = batch_id AND (b.created_by = auth.uid() OR (b.org_id IS NOT NULL AND public.is_org_member(auth.uid(), b.org_id)))));

CREATE INDEX ix_import_created_batch ON public.import_created_records(batch_id, entity_type);

-- =============== TRACE COLUMNS ON EXISTING TABLES ===============
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL;
ALTER TABLE public.sites ADD COLUMN IF NOT EXISTS import_row_id uuid REFERENCES public.import_rows(id) ON DELETE SET NULL;
ALTER TABLE public.programmes ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL;
ALTER TABLE public.work_packages ADD COLUMN IF NOT EXISTS import_batch_id uuid REFERENCES public.import_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ix_sites_import_batch ON public.sites(import_batch_id);

-- =============== updated_at TRIGGERS ===============
CREATE TRIGGER trg_import_batches_updated BEFORE UPDATE ON public.import_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_import_rows_updated BEFORE UPDATE ON public.import_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_import_mappings_updated BEFORE UPDATE ON public.import_column_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
