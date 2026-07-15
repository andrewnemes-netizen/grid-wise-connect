
-- Partner Portal enablement

-- 1. Ack fields on snagging_items
ALTER TABLE public.snagging_items
  ADD COLUMN IF NOT EXISTS partner_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS partner_acknowledged_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS partner_ack_notes TEXT;

-- 2. Helper: is caller a partner allocated to this WP?
CREATE OR REPLACE FUNCTION public.is_partner_for_wp(_wp_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.partner_users pu
    JOIN public.wp_partner_allocations wpa ON wpa.partner_id = pu.partner_id
    WHERE pu.user_id = auth.uid()
      AND wpa.work_package_id = _wp_id
  );
$$;

-- 3. Helper: is caller a partner allocated to any WP touching this site?
CREATE OR REPLACE FUNCTION public.is_partner_for_site(_site_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.partner_users pu
    JOIN public.wp_partner_allocations wpa ON wpa.partner_id = pu.partner_id
    WHERE pu.user_id = auth.uid()
      AND (wpa.site_id = _site_id
           OR EXISTS (
             SELECT 1 FROM public.wp_sites ws
             WHERE ws.work_package_id = wpa.work_package_id
               AND ws.site_id = _site_id
           ))
  );
$$;

-- 4. Partner SELECT policies
DROP POLICY IF EXISTS "Partners can view allocated work packages" ON public.work_packages;
CREATE POLICY "Partners can view allocated work packages"
ON public.work_packages FOR SELECT TO authenticated
USING (public.is_partner_for_wp(id));

DROP POLICY IF EXISTS "Partners can view allocated commissioning" ON public.commissioning_records;
CREATE POLICY "Partners can view allocated commissioning"
ON public.commissioning_records FOR SELECT TO authenticated
USING (public.is_partner_for_wp(work_package_id));

DROP POLICY IF EXISTS "Partners can view allocated certificates" ON public.test_certificates;
CREATE POLICY "Partners can view allocated certificates"
ON public.test_certificates FOR SELECT TO authenticated
USING (public.is_partner_for_wp(work_package_id));

DROP POLICY IF EXISTS "Partners can view allocated snags" ON public.snagging_items;
CREATE POLICY "Partners can view allocated snags"
ON public.snagging_items FOR SELECT TO authenticated
USING (public.is_partner_for_wp(work_package_id));

DROP POLICY IF EXISTS "Partners can view allocated handover" ON public.handover_packs;
CREATE POLICY "Partners can view allocated handover"
ON public.handover_packs FOR SELECT TO authenticated
USING (public.is_partner_for_wp(work_package_id));

-- 5. Ack RPC (SECURITY DEFINER — enforces its own auth check)
CREATE OR REPLACE FUNCTION public.partner_acknowledge_snag(_snag_id UUID, _notes TEXT DEFAULT NULL)
RETURNS public.snagging_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wp UUID;
  v_row public.snagging_items;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT work_package_id INTO v_wp FROM public.snagging_items WHERE id = _snag_id;
  IF v_wp IS NULL THEN
    RAISE EXCEPTION 'Snag not found';
  END IF;

  IF NOT public.is_partner_for_wp(v_wp) THEN
    RAISE EXCEPTION 'Not authorised for this work package';
  END IF;

  UPDATE public.snagging_items
     SET partner_acknowledged_at = now(),
         partner_acknowledged_by = auth.uid(),
         partner_ack_notes = COALESCE(_notes, partner_ack_notes)
   WHERE id = _snag_id
   RETURNING * INTO v_row;

  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public.partner_acknowledge_snag(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_partner_for_wp(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_partner_for_site(UUID) TO authenticated;
