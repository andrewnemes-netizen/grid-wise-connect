
CREATE OR REPLACE FUNCTION public.is_open_site_survey(_survey_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.site_surveys
    WHERE id = _survey_id
      AND status IN ('pending','draft','sent','in_progress')
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_open_site_survey(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS estimates_auth_all           ON public.estimates;
DROP POLICY IF EXISTS estimate_lines_auth_all      ON public.estimate_lines;
DROP POLICY IF EXISTS estimate_groups_auth_all     ON public.estimate_groups;
DROP POLICY IF EXISTS estimate_allowances_auth_all ON public.estimate_allowances;

CREATE POLICY estimates_staff_all ON public.estimates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'engineer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'engineer'));
CREATE POLICY estimate_lines_staff_all ON public.estimate_lines
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'engineer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'engineer'));
CREATE POLICY estimate_groups_staff_all ON public.estimate_groups
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'engineer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'engineer'));
CREATE POLICY estimate_allowances_staff_all ON public.estimate_allowances
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'engineer'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'engineer'));

DROP POLICY IF EXISTS "Authenticated read folder cache"     ON public.onedrive_folder_cache;
DROP POLICY IF EXISTS "Authenticated read onedrive uploads" ON public.onedrive_uploads;
CREATE POLICY onedrive_folder_cache_admin_read ON public.onedrive_folder_cache
  FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));
CREATE POLICY onedrive_uploads_admin_read ON public.onedrive_uploads
  FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "Authenticated can read xero contacts" ON public.xero_contacts;
CREATE POLICY xero_contacts_staff_read ON public.xero_contacts
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'engineer'));

DROP POLICY IF EXISTS "Public can upload site-survey files"      ON storage.objects;
DROP POLICY IF EXISTS "Public can read site-survey files"        ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can read site-survey files" ON storage.objects;
CREATE POLICY "Site-survey uploads only for open surveys"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (
    bucket_id = 'site-surveys'
    AND public.is_open_site_survey(NULLIF((storage.foldername(name))[1],'')::uuid)
  );
CREATE POLICY "Site-survey read for open surveys or staff"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'site-surveys'
    AND (
      public.is_open_site_survey(NULLIF((storage.foldername(name))[1],'')::uuid)
      OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'engineer')
    )
  );

DROP POLICY IF EXISTS "Authenticated can read quotations"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload quotations" ON storage.objects;
CREATE POLICY "Staff can read quotations"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='quotations' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'engineer')));
CREATE POLICY "Staff can upload quotations"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='quotations' AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'engineer')));

ALTER VIEW public.v_wp_commercial_position SET (security_invoker = true);

ALTER FUNCTION public.enqueue_email(text, jsonb)                                SET search_path = public;
ALTER FUNCTION public.delete_email(text, bigint)                                SET search_path = public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb)                    SET search_path = public;
ALTER FUNCTION public.read_email_batch(text, integer, integer)                  SET search_path = public;

DO $$
DECLARE
  r record;
  allowlist text[] := ARRAY[
    'has_role','can_access_project','can_access_wp','can_manage_wp',
    'get_user_org_id','has_wp_access','has_wp_team_access',
    'is_gridwise_staff','is_org_member','is_partner_for_wp',
    'is_partner_for_site','is_platform_admin',
    'user_can_access_study','user_has_study_editor_share','user_has_study_share',
    'get_survey_by_token','is_open_site_survey'
  ];
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true AND p.proname <> ALL(allowlist)
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, public',
                     r.proname, r.args);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;
