CREATE OR REPLACE FUNCTION public.sweep_expired_archives()
RETURNS TABLE(purged_count int, failed_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  purged int := 0;
  failed int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.deleted_entities
    WHERE status = 'archived'
      AND retention_expires_at < now()
    LIMIT 500
  LOOP
    BEGIN
      PERFORM public.purge_entity(r.id);
      purged := purged + 1;
    EXCEPTION WHEN OTHERS THEN
      failed := failed + 1;
    END;
  END LOOP;
  RETURN QUERY SELECT purged, failed;
END;
$$;

REVOKE ALL ON FUNCTION public.sweep_expired_archives() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_expired_archives() TO service_role;