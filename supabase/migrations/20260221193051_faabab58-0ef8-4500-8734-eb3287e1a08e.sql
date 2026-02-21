
-- Update handle_new_user to also create notifications for admin users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _require_approval BOOLEAN;
  _admin_id UUID;
  _user_name TEXT;
BEGIN
  SELECT require_approval INTO _require_approval 
  FROM public.app_settings LIMIT 1;

  _user_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    NEW.email
  );

  INSERT INTO public.profiles (user_id, full_name, avatar_url, company, phone, is_approved)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NULLIF(NEW.raw_user_meta_data->>'name', ''), ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'company', ''), ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'phone', ''), ''),
    NOT COALESCE(_require_approval, false)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
    company = COALESCE(NULLIF(EXCLUDED.company, ''), profiles.company),
    phone = COALESCE(NULLIF(EXCLUDED.phone, ''), profiles.phone),
    avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), profiles.avatar_url);

  -- Notify all admin users about new signup when approval is required
  IF COALESCE(_require_approval, false) THEN
    FOR _admin_id IN
      SELECT user_id FROM public.user_roles WHERE role = 'admin'
    LOOP
      INSERT INTO public.notifications (user_id, type, message)
      VALUES (
        _admin_id,
        'new_signup',
        'New user "' || _user_name || '" has signed up and is awaiting approval.'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;
