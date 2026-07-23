-- =============================================================
-- POC Designer Purchase Orders
-- =============================================================

-- 1) purchase_orders: new columns
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'build',
  ADD COLUMN IF NOT EXISTS supplier_contact_name text,
  ADD COLUMN IF NOT EXISTS supplier_contact_email text,
  ADD COLUMN IF NOT EXISTS source_task_id uuid REFERENCES public.wp_tasks(id) ON DELETE SET NULL;

-- Belt-and-braces backfill (DEFAULT already handles new rows; guarantees NOT NULL holds)
UPDATE public.purchase_orders SET category = 'build' WHERE category IS NULL;

-- Category CHECK
ALTER TABLE public.purchase_orders
  DROP CONSTRAINT IF EXISTS purchase_orders_category_check;
ALTER TABLE public.purchase_orders
  ADD  CONSTRAINT purchase_orders_category_check
  CHECK (category IN ('build','poc_design','other'));

-- Widen status CHECK — the existing constraint ('active','closed','amended','cancelled')
-- was inconsistent with the UI (which already surfaced draft/issued/acknowledged/…),
-- and we now need a real DRAFT state.
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE public.purchase_orders
  ADD CONSTRAINT purchase_orders_status_check
  CHECK (status IN (
    'draft','active','issued','sent','acknowledged',
    'part_delivered','delivered','closed','amended','cancelled'
  ));

CREATE INDEX IF NOT EXISTS idx_po_category    ON public.purchase_orders(category);
CREATE INDEX IF NOT EXISTS idx_po_source_task ON public.purchase_orders(source_task_id);

-- 2) po_lines: new columns
ALTER TABLE public.po_lines
  ADD COLUMN IF NOT EXISTS unit_rate numeric,
  ADD COLUMN IF NOT EXISTS qty       numeric NOT NULL DEFAULT 1;

-- 3) POC PO number generator — per org, per calendar year, "POC-YYYY-####"
CREATE OR REPLACE FUNCTION public.next_poc_po_number(_org uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr       text := to_char(now(), 'YYYY');
  prefix   text := 'POC-' || yr || '-';
  last_seq int;
BEGIN
  SELECT COALESCE(
           MAX( (regexp_replace(po_number, '^' || prefix, ''))::int ),
           0
         )
  INTO last_seq
  FROM public.purchase_orders
  WHERE org_id IS NOT DISTINCT FROM _org
    AND po_number ~ ('^' || prefix || '[0-9]+$');

  RETURN prefix || lpad((last_seq + 1)::text, 4, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_poc_po_number(uuid) TO authenticated;
