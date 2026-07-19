
-- ============ PoC Estimates (separate from EV Build estimates) ============

-- Status enum
DO $$ BEGIN
  CREATE TYPE public.poc_estimate_status AS ENUM ('draft','sent','accepted','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Parent table
CREATE TABLE IF NOT EXISTS public.poc_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_package_id uuid NOT NULL REFERENCES public.work_packages(id) ON DELETE CASCADE,
  site_id uuid REFERENCES public.sites(id) ON DELETE SET NULL,
  dno_offer_id uuid REFERENCES public.dno_offers(id) ON DELETE SET NULL,
  ref text,
  name text NOT NULL DEFAULT 'PoC Estimate',
  rate_card_version_id uuid REFERENCES public.rate_card_versions(id) ON DELETE SET NULL,
  status public.poc_estimate_status NOT NULL DEFAULT 'draft',
  currency text NOT NULL DEFAULT 'GBP',
  notes text,
  total_cost numeric(14,2) NOT NULL DEFAULT 0,
  total_price numeric(14,2) NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS poc_estimates_uniq_wp_site_offer
  ON public.poc_estimates(work_package_id, site_id, dno_offer_id)
  WHERE site_id IS NOT NULL AND dno_offer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS poc_estimates_wp_idx ON public.poc_estimates(work_package_id);
CREATE INDEX IF NOT EXISTS poc_estimates_site_idx ON public.poc_estimates(site_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.poc_estimates TO authenticated;
GRANT ALL ON public.poc_estimates TO service_role;
ALTER TABLE public.poc_estimates ENABLE ROW LEVEL SECURITY;

-- RLS: any authenticated user who can see the work package (same permissive
-- pattern as public.estimates today). Tighten later via WP membership if needed.
CREATE POLICY "poc_estimates authenticated read"
  ON public.poc_estimates FOR SELECT TO authenticated USING (true);
CREATE POLICY "poc_estimates authenticated insert"
  ON public.poc_estimates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "poc_estimates authenticated update"
  ON public.poc_estimates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "poc_estimates authenticated delete"
  ON public.poc_estimates FOR DELETE TO authenticated USING (true);

-- Line items
CREATE TABLE IF NOT EXISTS public.poc_estimate_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poc_estimate_id uuid NOT NULL REFERENCES public.poc_estimates(id) ON DELETE CASCADE,
  sort_index integer NOT NULL DEFAULT 0,
  rate_item_id uuid REFERENCES public.rate_items(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  unit text NOT NULL DEFAULT 'ea',
  quantity numeric(14,3) NOT NULL DEFAULT 1,
  unit_cost numeric(14,4) NOT NULL DEFAULT 0,
  unit_price numeric(14,4) NOT NULL DEFAULT 0,
  line_cost numeric(14,2) GENERATED ALWAYS AS (ROUND(quantity * unit_cost, 2)) STORED,
  line_price numeric(14,2) GENERATED ALWAYS AS (ROUND(quantity * unit_price, 2)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS poc_estimate_lines_parent_idx ON public.poc_estimate_lines(poc_estimate_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.poc_estimate_lines TO authenticated;
GRANT ALL ON public.poc_estimate_lines TO service_role;
ALTER TABLE public.poc_estimate_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "poc_estimate_lines authenticated all"
  ON public.poc_estimate_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_poc_estimates_touch ON public.poc_estimates;
CREATE TRIGGER trg_poc_estimates_touch BEFORE UPDATE ON public.poc_estimates
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_poc_estimate_lines_touch ON public.poc_estimate_lines;
CREATE TRIGGER trg_poc_estimate_lines_touch BEFORE UPDATE ON public.poc_estimate_lines
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- Recompute totals on line change
CREATE OR REPLACE FUNCTION public.tg_poc_estimate_recompute_totals()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE parent uuid;
BEGIN
  parent := COALESCE(NEW.poc_estimate_id, OLD.poc_estimate_id);
  IF parent IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  UPDATE public.poc_estimates p
     SET total_cost  = COALESCE((SELECT SUM(line_cost)  FROM public.poc_estimate_lines WHERE poc_estimate_id = parent), 0),
         total_price = COALESCE((SELECT SUM(line_price) FROM public.poc_estimate_lines WHERE poc_estimate_id = parent), 0),
         updated_at  = now()
   WHERE p.id = parent;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_poc_estimate_lines_totals ON public.poc_estimate_lines;
CREATE TRIGGER trg_poc_estimate_lines_totals
AFTER INSERT OR UPDATE OR DELETE ON public.poc_estimate_lines
FOR EACH ROW EXECUTE FUNCTION public.tg_poc_estimate_recompute_totals();

-- Auto-create a PoC Estimate when a DNO offer is inserted for a site
CREATE OR REPLACE FUNCTION public.tg_dno_offer_create_poc_estimate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.site_id IS NULL OR NEW.work_package_id IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.poc_estimates (work_package_id, site_id, dno_offer_id, name, status, created_by)
  VALUES (NEW.work_package_id, NEW.site_id, NEW.id,
          'PoC Estimate — ' || COALESCE(NEW.offer_ref, to_char(now(),'YYYY-MM-DD')),
          'draft', NEW.created_by)
  ON CONFLICT (work_package_id, site_id, dno_offer_id)
    WHERE site_id IS NOT NULL AND dno_offer_id IS NOT NULL
  DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dno_offers_create_poc_estimate ON public.dno_offers;
CREATE TRIGGER trg_dno_offers_create_poc_estimate
AFTER INSERT ON public.dno_offers
FOR EACH ROW EXECUTE FUNCTION public.tg_dno_offer_create_poc_estimate();
