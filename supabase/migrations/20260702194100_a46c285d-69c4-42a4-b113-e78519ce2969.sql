
-- 1. Security definer view → security invoker
ALTER VIEW public.ukpn_circuit_latest_utilisation SET (security_invoker = true);

-- 2. Function search_path fixes
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;

-- 3. Revoke EXECUTE from anon on user SECURITY DEFINER functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname NOT LIKE 'st\_%'
      AND p.proname NOT LIKE '\_st%'
      AND p.proname NOT LIKE 'postgis%'
      AND p.proname NOT LIKE 'geometry%'
      AND p.proname NOT LIKE 'geography%'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', r.proname, r.args);
  END LOOP;
END $$;

-- 4. osm_tile_cache: restrict insert/update to admins only
DROP POLICY IF EXISTS "Authenticated can insert osm_tile_cache" ON public.osm_tile_cache;
DROP POLICY IF EXISTS "Authenticated can update osm_tile_cache" ON public.osm_tile_cache;
-- "Admins can manage osm_tile_cache" (ALL) already covers admin writes; service_role has full access.

-- 5. notifications: only allow inserting notifications for yourself (admins covered separately if needed)
DROP POLICY IF EXISTS "Authenticated can insert notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can insert any notification"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. profiles.phone hidden from other authenticated users
REVOKE SELECT (phone) ON public.profiles FROM authenticated;
REVOKE SELECT (phone) ON public.profiles FROM anon;
-- (service_role and postgres retain full access via table-level GRANT)

CREATE OR REPLACE FUNCTION public.get_own_profile()
RETURNS SETOF public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.profiles WHERE user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_own_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_own_profile() TO authenticated;

-- Admin-only helper for viewing another user's phone
CREATE OR REPLACE FUNCTION public.admin_get_profile_phone(target_user uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorised';
  END IF;
  SELECT phone INTO v_phone FROM public.profiles WHERE user_id = target_user;
  RETURN v_phone;
END $$;
REVOKE ALL ON FUNCTION public.admin_get_profile_phone(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_profile_phone(uuid) TO authenticated;

-- 7. training-images storage bucket: remove broad listing permission (public URLs still work)
DROP POLICY IF EXISTS "Training images are publicly accessible" ON storage.objects;
