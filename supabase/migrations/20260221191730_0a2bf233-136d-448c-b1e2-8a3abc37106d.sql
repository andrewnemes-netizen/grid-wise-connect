
-- 1. Add phone and approval columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT true;

-- Mark all existing users as approved
UPDATE public.profiles SET is_approved = true;

-- 2. App settings table (single-row config)
CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  require_approval BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings
CREATE POLICY "Authenticated can read app_settings"
  ON public.app_settings FOR SELECT
  USING (true);

-- Only admins can update
CREATE POLICY "Admins can update app_settings"
  ON public.app_settings FOR UPDATE
  USING (has_role(auth.uid(), 'admin'));

-- Insert initial row
INSERT INTO public.app_settings (require_approval) VALUES (false);

-- 3. Update trigger to check approval setting
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _require_approval BOOLEAN;
BEGIN
  SELECT require_approval INTO _require_approval 
  FROM public.app_settings LIMIT 1;

  INSERT INTO public.profiles (user_id, full_name, avatar_url, company, phone, is_approved)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', ''),
    COALESCE(NEW.raw_user_meta_data->>'company', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NOT COALESCE(_require_approval, false)
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), profiles.full_name),
    company = COALESCE(NULLIF(EXCLUDED.company, ''), profiles.company),
    avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), profiles.avatar_url);
  RETURN NEW;
END;
$$;
