CREATE OR REPLACE FUNCTION public.site_move_blockers(_site_id uuid)
RETURNS TABLE(blocker text, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _lock_before date;
BEGIN
  SELECT financial_period_lock_before INTO _lock_before FROM public.app_settings LIMIT 1;

  RETURN QUERY
    SELECT 'commissioning_complete'::text, 'Commissioning record ' || cr.id::text
    FROM public.commissioning_records cr
    WHERE cr.site_id = _site_id AND cr.status = 'complete';

  RETURN QUERY
    SELECT 'handover_signed'::text, 'Handover pack ' || hp.id::text
    FROM public.handover_packs hp
    WHERE hp.site_id = _site_id
      AND hp.status::text IN ('signed','completed','handed_over');

  RETURN QUERY
    SELECT 'contract_closed'::text, 'Contract ' || c.id::text
    FROM public.contracts c
    WHERE c.closed_at IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.site_estimates se
        WHERE se.site_id = _site_id AND se.contract_id = c.id
      );

  IF _lock_before IS NOT NULL THEN
    RETURN QUERY
      SELECT 'financial_period_locked'::text,
             'Site has actual costs dated before ' || _lock_before::text
      FROM public.actual_costs ac
      WHERE ac.site_id = _site_id
        AND ac.created_at::date < _lock_before
      LIMIT 1;
  END IF;
END;
$$;