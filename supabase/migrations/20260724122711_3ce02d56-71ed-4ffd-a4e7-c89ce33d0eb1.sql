CREATE OR REPLACE FUNCTION public.approve_rate_card_version(_version_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_card uuid;
  v_status public.rate_card_status;
BEGIN
  IF NOT public.is_gridwise_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  SELECT rate_card_id, status INTO v_card, v_status
  FROM public.rate_card_versions WHERE id = _version_id;
  IF v_card IS NULL THEN RAISE EXCEPTION 'Version not found'; END IF;
  IF v_status <> 'DRAFT' THEN RAISE EXCEPTION 'Only DRAFT versions can be approved'; END IF;

  -- Supersede any previously approved versions on this card
  UPDATE public.rate_card_versions
    SET status = 'SUPERSEDED', effective_to = now()
    WHERE rate_card_id = v_card AND status = 'APPROVED';

  UPDATE public.rate_card_versions
    SET status = 'APPROVED',
        approved_at = now(),
        approved_by = auth.uid(),
        effective_from = now()
    WHERE id = _version_id;

  INSERT INTO public.audit_log (user_id, action, meta_json)
  VALUES (auth.uid(), 'rate_card_version_approved',
          jsonb_build_object('version_id', _version_id, 'rate_card_id', v_card));

  RETURN _version_id;
END;
$function$;