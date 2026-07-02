
CREATE OR REPLACE FUNCTION public.create_notification_for_user(
  target_user uuid,
  target_study uuid,
  notification_type text,
  notification_message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF notification_type NOT IN ('study_share','comment_added','status_changed') THEN
    RAISE EXCEPTION 'invalid notification type';
  END IF;
  -- Allow if caller owns the study, has edit share on it, or is admin
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.studies WHERE id = target_study AND created_by = auth.uid())
    OR public.user_has_study_editor_share(target_study, auth.uid())
  ) THEN
    RAISE EXCEPTION 'not authorised for this study';
  END IF;
  INSERT INTO public.notifications (user_id, study_id, type, message)
  VALUES (target_user, target_study, notification_type, notification_message)
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

REVOKE ALL ON FUNCTION public.create_notification_for_user(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_notification_for_user(uuid, uuid, text, text) TO authenticated;
