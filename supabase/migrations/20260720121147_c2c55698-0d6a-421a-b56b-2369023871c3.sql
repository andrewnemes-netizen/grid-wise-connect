
-- Extend site_estimate_lines and poc_estimate_lines with rich BOQ editor fields.
-- All new columns are nullable / have sensible defaults so existing rows and existing insert paths
-- continue to work unchanged.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_estimate_lines', 'poc_estimate_lines'] LOOP
    -- Item details
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS boq_item_name text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS boq_description text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS pricing_notes text', t);

    -- Quantity / logic
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS item_logic text DEFAULT ''SUPPLY_AND_INSTALL''', t);

    -- Install details
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS time_value numeric DEFAULT 0', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS time_measure text DEFAULT ''Minutes''', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS no_resources numeric', t);

    -- Supplier / product
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS supplier text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS product_service text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS product_type text', t);

    -- Mark up
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS markup_type text DEFAULT ''Combination''', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS markup_dollar numeric DEFAULT 0', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS contingency_pct numeric DEFAULT 0', t);

    -- Discount / tax
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 20', t);

    -- Financial terms
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS cost_category text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS charge_out_rate_used text DEFAULT ''BOQ Item Rate''', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS conversion_type text DEFAULT ''Show on Convert''', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS show_image_in_proposal boolean DEFAULT false', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS solution_link text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS image_link text', t);

    -- Estimating feature flags
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS itemised boolean DEFAULT false', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS flexible_qty boolean DEFAULT false', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS fixed_price boolean DEFAULT false', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS lock_markup_dollar boolean DEFAULT false', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS split_labour_materials boolean DEFAULT false', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS calculate_time boolean DEFAULT true', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS rfq_required boolean DEFAULT false', t);

    -- Compare grouping
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS compare_list text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS compare_title text', t);

    -- Project task sync
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS project_sync_type text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS project_task_name text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS project_description text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS milestone_for_sync text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS project_stage text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS include_in_create_task boolean DEFAULT true', t);

    -- Attribute group
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS attribute_group text', t);
  END LOOP;

  -- poc_estimate_lines is missing several columns that site_estimate_lines already has;
  -- add them so the shared editor can write uniformly.
  ALTER TABLE public.poc_estimate_lines ADD COLUMN IF NOT EXISTS stage text;
  ALTER TABLE public.poc_estimate_lines ADD COLUMN IF NOT EXISTS cost_code text;
  ALTER TABLE public.poc_estimate_lines ADD COLUMN IF NOT EXISTS is_allowance boolean DEFAULT false;
  ALTER TABLE public.poc_estimate_lines ADD COLUMN IF NOT EXISTS markup_pct numeric;
END $$;
